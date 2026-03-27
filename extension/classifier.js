// Content Classification Engine
// Classifies websites and content as educational or distracting
// ML-enhanced: queries local SmartFocus model server (model_server.py)
// Fallback: keyword + domain-based rules when server is offline

const ML_SERVER_URL = 'http://127.0.0.1:5000';
const ML_TIMEOUT_MS   = 5000;  // Allow enough time for cold model loads
const ML_RETRY_INTERVAL = 30000; // Re-probe server every 30 s if offline

// ── Cache settings ──────────────────────────────────────────────────────────
const CACHE_TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_MAX_SIZE = 500;                  // Max cached domains
const CACHE_STORAGE_KEY = 'mlClassificationCache';

class Classifier {
    constructor() {
        this.categories     = null;
        this.keywords       = null;
        this.customRules    = null;
        this.mlAvailable    = false;
        this.mlRetryTimeout = null;   // handle for pending retry timer
        this.mlCache        = new Map(); // domain -> { result, timestamp }
        this.init();

        // Keep customRules in sync whenever storage changes
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.customRules) {
                const oldRules = this.customRules || { whitelist: [], blacklist: [] };
                this.customRules = changes.customRules.newValue || { whitelist: [], blacklist: [] };

                // Invalidate cache entries for domains that were just added/removed
                const changedDomains = new Set([
                    ...this.symmetricDiff(oldRules.whitelist, this.customRules.whitelist),
                    ...this.symmetricDiff(oldRules.blacklist, this.customRules.blacklist)
                ]);
                changedDomains.forEach(d => this.mlCache.delete(d));
                if (changedDomains.size > 0) {
                    this.persistCache();
                }
                console.log('Classifier: customRules updated, invalidated cache for', [...changedDomains]);
            }
        });
    }

    // Helper: items in A or B but not both
    symmetricDiff(a = [], b = []) {
        const setA = new Set(a);
        const setB = new Set(b);
        return [...a.filter(x => !setB.has(x)), ...b.filter(x => !setA.has(x))];
    }

    async init() {
        // Load categories and keywords
        try {
            const categoriesResponse = await fetch(chrome.runtime.getURL('data/categories.json'));
            this.categories = await categoriesResponse.json();

            const keywordsResponse = await fetch(chrome.runtime.getURL('data/keywords.json'));
            this.keywords = await keywordsResponse.json();

            // Load custom user rules from storage
            const result = await chrome.storage.local.get(['customRules', 'whitelist', 'blacklist']);
            this.customRules = result.customRules || { whitelist: [], blacklist: [] };

            // Merge with storage whitelist/blacklist for backwards compatibility
            if (result.whitelist) {
                this.customRules.whitelist = [...new Set([...this.customRules.whitelist, ...result.whitelist])];
            }
            if (result.blacklist) {
                this.customRules.blacklist = [...new Set([...this.customRules.blacklist, ...result.blacklist])];
            }
        } catch (error) {
            console.error('Failed to load classification data:', error);
        }

        // Restore ML cache from storage
        await this.restoreCache();

        // Check ML server availability at startup
        this.mlAvailable = await this.checkMLServer();
        console.log('SmartFocus ML Server available:', this.mlAvailable);

        // If offline at startup, keep retrying every 30 s
        if (!this.mlAvailable) {
            this.scheduleMLRetry();
        }
    }

    // ── ML Server helpers ──────────────────────────────────────────────────

    /**
     * Ping the ML server health endpoint.
     * Returns true if the server is running with a loaded model.
     */
    async checkMLServer() {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);
            const resp = await fetch(`${ML_SERVER_URL}/health`, {
                signal: controller.signal
            });
            clearTimeout(timer);
            if (!resp.ok) return false;
            const data = await resp.json();
            return data.model_loaded === true;
        } catch {
            return false;
        }
    }

    /**
     * Schedule a background retry that probes the ML server every 30 s.
     * When the server comes back online, mlAvailable is flipped to true
     * and the retry loop stops.
     */
    scheduleMLRetry() {
        if (this.mlRetryTimeout) return;  // already scheduled
        this.mlRetryTimeout = setInterval(async () => {
            const available = await this.checkMLServer();
            if (available) {
                this.mlAvailable = true;
                clearInterval(this.mlRetryTimeout);
                this.mlRetryTimeout = null;
                console.log('SmartFocus ML Server came online — ML classification enabled.');
            }
        }, ML_RETRY_INTERVAL);
    }

    /**
     * Classify a URL (plus optional page metadata) using the trained ML model.
     * The URL is automatically captured by the extension from the browser tab —
     * the user never needs to enter it manually.
     *
     * @param {string} url        - The page URL (auto-captured from tab)
     * @param {object} pageData   - { title, description, keywords } from content-script
     * @returns {object|null}     - Classification result or null if server unavailable
     */
    async classifyWithML(url, pageData = {}) {
        if (!this.mlAvailable) return null;

        const domain = this.extractDomain(url);

        // ── Check cache first ──────────────────────────────────────────────
        const cached = this.getCachedResult(domain);
        if (cached) {
            return { ...cached, reason: 'SmartFocus ML model (cached)' };
        }

        // ── Cache miss — call ML server ─────────────────────────────────────
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);

            const response = await fetch(`${ML_SERVER_URL}/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    url: url,
                    title: pageData.title || '',
                    description: pageData.description || '',
                    keywords: Array.isArray(pageData.tags)
                        ? pageData.tags.join(' ')
                        : (pageData.keywords || '')
                })
            });
            clearTimeout(timer);

            if (!response.ok) return null;

            const data = await response.json();
            if (!data.label) return null;

            const result = {
                category: data.label,          // "educational" | "distracting" | "neutral"
                confidence: data.confidence,
                reason: 'SmartFocus ML model',
                mlClassified: true
            };

            // ── Store in cache ──────────────────────────────────────────────
            this.setCachedResult(domain, result);

            return result;
        } catch {
            // Server went offline mid-session — mark unavailable and start retry loop
            console.warn('SmartFocus ML Server unreachable — switching to fallback classifier.');
            this.mlAvailable = false;
            this.scheduleMLRetry();
            return null;
        }
    }

    // ── Cache management ────────────────────────────────────────────────────

    /** Get a cached result if it exists and hasn't expired. */
    getCachedResult(domain) {
        const entry = this.mlCache.get(domain);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            this.mlCache.delete(domain);
            return null;
        }
        return entry.result;
    }

    /** Store a classification result in the cache. */
    setCachedResult(domain, result) {
        // Evict oldest entries if cache is full
        if (this.mlCache.size >= CACHE_MAX_SIZE) {
            const oldestKey = this.mlCache.keys().next().value;
            this.mlCache.delete(oldestKey);
        }
        this.mlCache.set(domain, {
            result: { category: result.category, confidence: result.confidence, mlClassified: true },
            timestamp: Date.now()
        });
        this.persistCache();
    }

    /** Persist the in-memory cache to chrome.storage.local. */
    async persistCache() {
        try {
            const serialised = {};
            this.mlCache.forEach((value, key) => {
                serialised[key] = value;
            });
            await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: serialised });
        } catch (e) {
            console.warn('Classifier: failed to persist ML cache', e);
        }
    }

    /** Restore cache from chrome.storage.local after a SW restart. */
    async restoreCache() {
        try {
            const data = await chrome.storage.local.get(CACHE_STORAGE_KEY);
            const stored = data[CACHE_STORAGE_KEY];
            if (stored && typeof stored === 'object') {
                const now = Date.now();
                let restored = 0;
                Object.entries(stored).forEach(([domain, entry]) => {
                    if (entry.timestamp && (now - entry.timestamp) < CACHE_TTL_MS) {
                        this.mlCache.set(domain, entry);
                        restored++;
                    }
                });
                console.log(`Classifier: restored ${restored} cached ML results from storage.`);
            }
        } catch (e) {
            console.warn('Classifier: failed to restore ML cache', e);
        }
    }

    /** Clear the entire ML cache. */
    clearCache() {
        this.mlCache.clear();
        this.persistCache();
        console.log('Classifier: ML cache cleared.');
    }

    // ── Main classification method ─────────────────────────────────────────

    /**
     * Classify a URL that was automatically fetched from the active browser tab.
     * Priority order:
     *   1. User custom rules (whitelist / blacklist) — always honoured
     *   2. SmartFocus ML model API (if server running)
     *   3. Predefined domain lists (categories.json)
     *   4. YouTube-specific content analysis
     *   5. Keyword-based content analysis (fallback)
     */
    async classifyUrl(url, pageData = {}) {
        // If data isn't loaded yet (e.g. after a service-worker restart), re-init
        if (!this.categories || !this.keywords || !this.customRules) {
            await this.init();
        }

        if (!url || !this.categories || !this.keywords) {
            return { category: 'neutral', confidence: 0, reason: 'Initialization pending' };
        }

        // Always reload customRules fresh from storage before checking.
        // This guarantees whitelist/blacklist ALWAYS overrides ML, even if
        // the service worker restarted or init() raced with a classification.
        try {
            const stored = await chrome.storage.local.get('customRules');
            this.customRules = stored.customRules || { whitelist: [], blacklist: [] };
        } catch (e) {
            console.warn('Classifier: could not reload customRules from storage', e);
        }

        const domain = this.extractDomain(url);
        const domainParts = domain.split('.');

        // 1 ── Custom rules (highest priority — ALWAYS overrides ML)
        // Check exact domain and parent domains (e.g. drive.google.com, google.com)
        for (let i = 0; i <= domainParts.length - 2; i++) {
            const currentDomain = domainParts.slice(i).join('.');
            if (this.customRules.blacklist.includes(currentDomain)) {
                return { category: 'distracting', confidence: 100, reason: `User blacklist (${currentDomain})` };
            }
            if (this.customRules.whitelist.includes(currentDomain)) {
                return { category: 'educational', confidence: 100, reason: `User whitelist (${currentDomain})` };
            }
        }

        // 2 ── SmartFocus ML model (trained on Urls_dataset + dataset + websites_dataset)
        const mlResult = await this.classifyWithML(url, pageData);
        if (mlResult) {
            return mlResult;
        }

        // 3 ── Predefined categories (domain lists)
        if (this.categories.educational.includes(domain)) {
            return { category: 'educational', confidence: 90, reason: 'Known educational domain' };
        }
        if (this.categories.distracting.includes(domain)) {
            return { category: 'distracting', confidence: 90, reason: 'Known distracting domain' };
        }
        if (this.categories.neutral.includes(domain)) {
            return { category: 'neutral', confidence: 85, reason: 'Known neutral domain' };
        }

        // 4 ── YouTube-specific analysis
        if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
            return this.classifyYouTube(url, pageData);
        }

        // 5 ── Keyword-based content analysis (fallback)
        return this.classifyByContent(url, pageData);
    }

    // ── YouTube classification ─────────────────────────────────────────────

    classifyYouTube(url, pageData) {
        const { title = '', description = '', tags = [] } = pageData;
        const combinedText = `${title} ${description} ${tags.join(' ')}`.toLowerCase();

        let educationalScore = 0;
        let distractingScore = 0;

        this.keywords.educational.high_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) educationalScore += 3;
        });
        this.keywords.educational.medium_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) educationalScore += 1;
        });
        this.keywords.distracting.high_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) distractingScore += 3;
        });
        this.keywords.distracting.medium_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) distractingScore += 1;
        });

        if (educationalScore > distractingScore && educationalScore >= 3) {
            return {
                category: 'educational',
                confidence: Math.min(95, 60 + educationalScore * 5),
                reason: 'Educational YouTube content',
                scores: { educational: educationalScore, distracting: distractingScore }
            };
        } else if (distractingScore > educationalScore && distractingScore >= 3) {
            return {
                category: 'distracting',
                confidence: Math.min(95, 60 + distractingScore * 5),
                reason: 'Entertainment YouTube content',
                scores: { educational: educationalScore, distracting: distractingScore }
            };
        } else {
            return {
                category: 'neutral',
                confidence: 50,
                reason: 'Unclear YouTube content',
                scores: { educational: educationalScore, distracting: distractingScore }
            };
        }
    }

    // ── Keyword-based fallback ─────────────────────────────────────────────

    classifyByContent(url, pageData) {
        const { title = '', description = '', content = '' } = pageData;
        const combinedText = `${title} ${description} ${content}`.toLowerCase();
        const domain = this.extractDomain(url);

        let educationalScore = 0;
        let distractingScore = 0;

        this.keywords.educational.high_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) educationalScore += 2;
        });
        this.keywords.educational.medium_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) educationalScore += 1;
        });
        this.keywords.distracting.high_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) distractingScore += 2;
        });
        this.keywords.distracting.medium_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) distractingScore += 1;
        });

        // Domain heuristics
        if (domain.includes('.edu') || domain.includes('academic') || domain.includes('university')) {
            educationalScore += 5;
        }
        if (domain.includes('game') || domain.includes('play') || domain.includes('fun')) {
            distractingScore += 3;
        }

        if (educationalScore > distractingScore && educationalScore >= 2) {
            return {
                category: 'educational',
                confidence: Math.min(85, 50 + educationalScore * 5),
                reason: 'Content analysis suggests educational',
                scores: { educational: educationalScore, distracting: distractingScore }
            };
        } else if (distractingScore > educationalScore && distractingScore >= 2) {
            return {
                category: 'distracting',
                confidence: Math.min(85, 50 + distractingScore * 5),
                reason: 'Content analysis suggests distracting',
                scores: { educational: educationalScore, distracting: distractingScore }
            };
        } else {
            return {
                category: 'neutral',
                confidence: 40,
                reason: 'Insufficient data for classification',
                scores: { educational: educationalScore, distracting: distractingScore }
            };
        }
    }

    // ── Custom rules management ────────────────────────────────────────────

    async addToWhitelist(domain) {
        this.customRules.whitelist.push(domain);
        this.customRules.blacklist = this.customRules.blacklist.filter(d => d !== domain);
        await chrome.storage.local.set({ customRules: this.customRules });
    }

    async addToBlacklist(domain) {
        this.customRules.blacklist.push(domain);
        this.customRules.whitelist = this.customRules.whitelist.filter(d => d !== domain);
        await chrome.storage.local.set({ customRules: this.customRules });
    }

    async removeFromCustomRules(domain) {
        this.customRules.whitelist = this.customRules.whitelist.filter(d => d !== domain);
        this.customRules.blacklist = this.customRules.blacklist.filter(d => d !== domain);
        await chrome.storage.local.set({ customRules: this.customRules });
    }

    // ── Utility ───────────────────────────────────────────────────────────

    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch (e) {
            return '';
        }
    }
}

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Classifier;
}
