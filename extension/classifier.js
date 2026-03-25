// Content Classification Engine
// Classifies websites and content as educational or distracting
// ML-enhanced: queries local SmartFocus model server (model_server.py)
// Fallback: keyword + domain-based rules when server is offline

const ML_SERVER_URL = 'http://127.0.0.1:5000';
const ML_TIMEOUT_MS   = 5000;  // Allow enough time for cold model loads
const ML_RETRY_INTERVAL = 30000; // Re-probe server every 30 s if offline

class Classifier {
    constructor() {
        this.categories     = null;
        this.keywords       = null;
        this.customRules    = null;
        this.mlAvailable    = false;
        this.mlRetryTimeout = null;   // handle for pending retry timer
        this.init();
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

            return {
                category: data.label,          // "educational" | "distracting" | "neutral"
                confidence: data.confidence,
                reason: 'SmartFocus ML model',
                mlClassified: true
            };
        } catch {
            // Server went offline mid-session — mark unavailable and start retry loop
            console.warn('SmartFocus ML Server unreachable — switching to fallback classifier.');
            this.mlAvailable = false;
            this.scheduleMLRetry();
            return null;
        }
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

        const domain = this.extractDomain(url);

        // 1 ── Custom rules (highest priority)
        if (this.customRules.blacklist.includes(domain)) {
            return { category: 'distracting', confidence: 100, reason: 'User blacklist' };
        }
        if (this.customRules.whitelist.includes(domain)) {
            return { category: 'educational', confidence: 100, reason: 'User whitelist' };
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
