// Content Classification Engine
// Classifies websites and content as educational or distracting

class Classifier {
    constructor() {
        this.categories = null;
        this.keywords = null;
        this.customRules = null;
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
    }

    // Main classification method
    async classifyUrl(url, pageData = {}) {
        if (!url || !this.categories) {
            return { category: 'neutral', confidence: 0, reason: 'Initialization pending' };
        }

        const domain = this.extractDomain(url);

        // Check custom rules first (highest priority)
        if (this.customRules.blacklist.includes(domain)) {
            return { category: 'distracting', confidence: 100, reason: 'User blacklist' };
        }
        if (this.customRules.whitelist.includes(domain)) {
            return { category: 'educational', confidence: 100, reason: 'User whitelist' };
        }

        // Check predefined categories
        if (this.categories.educational.includes(domain)) {
            return { category: 'educational', confidence: 90, reason: 'Known educational domain' };
        }
        if (this.categories.distracting.includes(domain)) {
            return { category: 'distracting', confidence: 90, reason: 'Known distracting domain' };
        }
        if (this.categories.neutral.includes(domain)) {
            return { category: 'neutral', confidence: 85, reason: 'Known neutral domain' };
        }

        // For YouTube, analyze video content
        if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
            return this.classifyYouTube(url, pageData);
        }

        // Content-based classification using keywords
        return this.classifyByContent(url, pageData);
    }

    // Classify YouTube videos
    classifyYouTube(url, pageData) {
        const { title = '', description = '', tags = [] } = pageData;
        const combinedText = `${title} ${description} ${tags.join(' ')}`.toLowerCase();

        let educationalScore = 0;
        let distractingScore = 0;

        // Check high priority educational keywords
        this.keywords.educational.high_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) {
                educationalScore += 3;
            }
        });

        // Check medium priority educational keywords
        this.keywords.educational.medium_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) {
                educationalScore += 1;
            }
        });

        // Check high priority distracting keywords
        this.keywords.distracting.high_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) {
                distractingScore += 3;
            }
        });

        // Check medium priority distracting keywords
        this.keywords.distracting.medium_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) {
                distractingScore += 1;
            }
        });

        // Determine category based on scores
        if (educationalScore > distractingScore && educationalScore >= 3) {
            const confidence = Math.min(95, 60 + educationalScore * 5);
            return {
                category: 'educational',
                confidence,
                reason: 'Educational YouTube content',
                scores: { educational: educationalScore, distracting: distractingScore }
            };
        } else if (distractingScore > educationalScore && distractingScore >= 3) {
            const confidence = Math.min(95, 60 + distractingScore * 5);
            return {
                category: 'distracting',
                confidence,
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

    // Classify based on page content
    classifyByContent(url, pageData) {
        const { title = '', description = '', content = '' } = pageData;
        const combinedText = `${title} ${description} ${content}`.toLowerCase();
        const domain = this.extractDomain(url);

        let educationalScore = 0;
        let distractingScore = 0;

        // Check educational keywords
        this.keywords.educational.high_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) {
                educationalScore += 2;
            }
        });
        this.keywords.educational.medium_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) {
                educationalScore += 1;
            }
        });

        // Check distracting keywords
        this.keywords.distracting.high_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) {
                distractingScore += 2;
            }
        });
        this.keywords.distracting.medium_priority.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) {
                distractingScore += 1;
            }
        });

        // Domain heuristics
        if (domain.includes('.edu') || domain.includes('academic') || domain.includes('university')) {
            educationalScore += 5;
        }
        if (domain.includes('game') || domain.includes('play') || domain.includes('fun')) {
            distractingScore += 3;
        }

        // Determine category
        if (educationalScore > distractingScore && educationalScore >= 2) {
            const confidence = Math.min(85, 50 + educationalScore * 5);
            return {
                category: 'educational',
                confidence,
                reason: 'Content analysis suggests educational',
                scores: { educational: educationalScore, distracting: distractingScore }
            };
        } else if (distractingScore > educationalScore && distractingScore >= 2) {
            const confidence = Math.min(85, 50 + distractingScore * 5);
            return {
                category: 'distracting',
                confidence,
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

    // Add domain to whitelist
    async addToWhitelist(domain) {
        this.customRules.whitelist.push(domain);
        this.customRules.blacklist = this.customRules.blacklist.filter(d => d !== domain);
        await chrome.storage.local.set({ customRules: this.customRules });
    }

    // Add domain to blacklist
    async addToBlacklist(domain) {
        this.customRules.blacklist.push(domain);
        this.customRules.whitelist = this.customRules.whitelist.filter(d => d !== domain);
        await chrome.storage.local.set({ customRules: this.customRules });
    }

    // Remove from custom rules
    async removeFromCustomRules(domain) {
        this.customRules.whitelist = this.customRules.whitelist.filter(d => d !== domain);
        this.customRules.blacklist = this.customRules.blacklist.filter(d => d !== domain);
        await chrome.storage.local.set({ customRules: this.customRules });
    }

    // Extract domain from URL
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
