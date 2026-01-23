// Data Storage Manager
// Handles all data persistence and retrieval

class StorageManager {
    constructor() {
        this.storageKeys = {
            CURRENT_SESSION: 'currentSession',
            SESSION_HISTORY: 'sessionHistory',
            SETTINGS: 'settings',
            STATISTICS: 'statistics',
            CUSTOM_RULES: 'customRules',
            WHITELIST: 'whitelist',
            BLACKLIST: 'blacklist'
        };
    }

    // Get current session
    async getCurrentSession() {
        const result = await chrome.storage.local.get(this.storageKeys.CURRENT_SESSION);
        return result[this.storageKeys.CURRENT_SESSION] || null;
    }

    // Save current session
    async saveCurrentSession(session) {
        await chrome.storage.local.set({ [this.storageKeys.CURRENT_SESSION]: session });
    }

    // Clear current session
    async clearCurrentSession() {
        await chrome.storage.local.remove(this.storageKeys.CURRENT_SESSION);
    }

    // Add session to history
    async addSessionToHistory(session) {
        const result = await chrome.storage.local.get(this.storageKeys.SESSION_HISTORY);
        const history = result[this.storageKeys.SESSION_HISTORY] || [];

        // Add session with completion timestamp
        session.completedAt = Date.now();
        history.push(session);

        // Keep only last 100 sessions to prevent storage overflow
        const trimmedHistory = history.slice(-100);

        await chrome.storage.local.set({ [this.storageKeys.SESSION_HISTORY]: trimmedHistory });
    }

    // Get session history
    async getSessionHistory(limit = null) {
        const result = await chrome.storage.local.get(this.storageKeys.SESSION_HISTORY);
        const history = result[this.storageKeys.SESSION_HISTORY] || [];

        if (limit) {
            return history.slice(-limit);
        }
        return history;
    }

    // Get sessions within date range
    async getSessionsByDateRange(startDate, endDate) {
        const history = await this.getSessionHistory();
        return history.filter(session => {
            const sessionDate = session.completedAt || session.startTime;
            return sessionDate >= startDate && sessionDate <= endDate;
        });
    }

    // Get settings
    async getSettings() {
        const result = await chrome.storage.local.get(this.storageKeys.SETTINGS);
        return result[this.storageKeys.SETTINGS] || this.getDefaultSettings();
    }

    // Save settings
    async saveSettings(settings) {
        await chrome.storage.local.set({ [this.storageKeys.SETTINGS]: settings });
    }

    // Get default settings
    getDefaultSettings() {
        return {
            // Session settings
            sessionDuration: 25 * 60, // 25 minutes in seconds (Pomodoro)
            breakDuration: 5 * 60, // 5 minutes
            longBreakDuration: 15 * 60, // 15 minutes
            sessionsBeforeLongBreak: 4,

            // Alert settings
            distractionAlertEnabled: true,
            distractionAlertDelay: 10, // seconds on distracting site before alert
            distractionAlertFrequency: 60, // seconds between repeated alerts

            // Break reminder settings
            breakReminderEnabled: true,
            breakReminderInterval: 25 * 60, // 25 minutes

            // Blocking settings
            blockingEnabled: false,
            blockingThreshold: 5 * 60, // 5 minutes of distraction before blocking
            blockingDuration: 10 * 60, // 10 minutes block duration

            // Notification settings
            notificationsEnabled: true,
            soundEnabled: false,

            // Data settings
            dataRetentionDays: 90,

            // UI settings
            theme: 'light',
            compactMode: false
        };
    }

    // Get statistics
    async getStatistics() {
        const result = await chrome.storage.local.get(this.storageKeys.STATISTICS);
        return result[this.storageKeys.STATISTICS] || this.getDefaultStatistics();
    }

    // Save statistics
    async saveStatistics(stats) {
        await chrome.storage.local.set({ [this.storageKeys.STATISTICS]: stats });
    }

    // Get default statistics
    getDefaultStatistics() {
        return {
            totalSessions: 0,
            totalFocusTime: 0,
            totalDistractionTime: 0,
            totalBreakTime: 0,
            averageFocusPercentage: 0,
            longestStreak: 0,
            currentStreak: 0,
            lastSessionDate: null,
            topDistractingSites: {},
            topStudySites: {}
        };
    }

    // Update statistics after session
    async updateStatistics(session) {
        const stats = await this.getStatistics();

        stats.totalSessions++;
        stats.totalFocusTime += session.focusTime || 0;
        stats.totalDistractionTime += session.distractionTime || 0;

        // Calculate average focus percentage
        const totalTime = stats.totalFocusTime + stats.totalDistractionTime;
        if (totalTime > 0) {
            stats.averageFocusPercentage = Math.round((stats.totalFocusTime / totalTime) * 100);
        }

        // Update streak
        const today = new Date().setHours(0, 0, 0, 0);
        const lastSessionDay = stats.lastSessionDate ? new Date(stats.lastSessionDate).setHours(0, 0, 0, 0) : null;

        if (!lastSessionDay || lastSessionDay < today - 86400000) {
            // New day or gap in sessions
            if (lastSessionDay === today - 86400000) {
                stats.currentStreak++;
            } else {
                stats.currentStreak = 1;
            }
        }

        stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
        stats.lastSessionDate = Date.now();

        // Update top sites
        if (session.visitedSites) {
            session.visitedSites.forEach(site => {
                if (site.category === 'distracting') {
                    stats.topDistractingSites[site.domain] = (stats.topDistractingSites[site.domain] || 0) + site.timeSpent;
                } else if (site.category === 'educational') {
                    stats.topStudySites[site.domain] = (stats.topStudySites[site.domain] || 0) + site.timeSpent;
                }
            });
        }

        await this.saveStatistics(stats);
    }

    // Clean old data based on retention settings
    async cleanOldData() {
        const settings = await this.getSettings();
        const retentionMs = settings.dataRetentionDays * 24 * 60 * 60 * 1000;
        const cutoffDate = Date.now() - retentionMs;

        const history = await this.getSessionHistory();
        const filteredHistory = history.filter(session => {
            const sessionDate = session.completedAt || session.startTime;
            return sessionDate >= cutoffDate;
        });

        await chrome.storage.local.set({ [this.storageKeys.SESSION_HISTORY]: filteredHistory });
    }

    // Export all data
    async exportAllData() {
        const data = await chrome.storage.local.get(null);
        return {
            exportDate: Date.now(),
            version: '1.0.0',
            data: data
        };
    }

    // Import data
    async importData(importedData) {
        if (importedData.data) {
            await chrome.storage.local.set(importedData.data);
            return true;
        }
        return false;
    }

    // Clear all data
    async clearAllData() {
        await chrome.storage.local.clear();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}
