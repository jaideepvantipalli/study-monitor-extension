// Alert and Notification Manager
// Handles all user notifications and alerts

class AlertManager {
    constructor() {
        this.lastAlertTime = {};
        this.settings = null;
        this.init();
    }

    async init() {
        const storage = new StorageManager();
        this.settings = await storage.getSettings();
    }

    // Show distraction alert
    async showDistractionAlert(domain, timeSpent) {
        if (!this.settings.distractionAlertEnabled || !this.settings.notificationsEnabled) {
            return;
        }

        const now = Date.now();
        const lastAlert = this.lastAlertTime[domain] || 0;
        const timeSinceLastAlert = (now - lastAlert) / 1000;

        // Check if enough time has passed since last alert
        if (timeSinceLastAlert < this.settings.distractionAlertFrequency) {
            return;
        }

        this.lastAlertTime[domain] = now;

        await chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '🎯 Stay Focused!',
            message: `You've been on ${domain} for ${this.formatTime(timeSpent)}. Time to get back to studying?`,
            priority: 1,
            requireInteraction: false
        });

        if (this.settings.soundEnabled) {
            // Play notification sound
            this.playNotificationSound();
        }
    }

    // Show break reminder
    async showBreakReminder(sessionDuration) {
        if (!this.settings.breakReminderEnabled || !this.settings.notificationsEnabled) {
            return;
        }

        await chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '☕ Time for a Break!',
            message: `You've been studying for ${this.formatTime(sessionDuration)}. Take a ${this.formatTime(this.settings.breakDuration)} break to recharge!`,
            priority: 2,
            requireInteraction: true,
            buttons: [
                { title: 'Start Break' },
                { title: 'Continue Studying' }
            ]
        });

        if (this.settings.soundEnabled) {
            this.playNotificationSound();
        }
    }

    // Show website blocked notification
    async showBlockedNotification(domain, timeRemaining) {
        if (!this.settings.notificationsEnabled) {
            return;
        }

        await chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '🚫 Website Blocked',
            message: `${domain} is temporarily blocked. You can access it again in ${this.formatTime(timeRemaining)}.`,
            priority: 2,
            requireInteraction: false
        });
    }

    // Show session complete notification
    async showSessionComplete(session) {
        if (!this.settings.notificationsEnabled) {
            return;
        }

        const totalTime = session.focusTime + session.distractionTime;
        const focusPercentage = totalTime > 0 ? Math.round((session.focusTime / totalTime) * 100) : 0;

        let message = `Focus: ${focusPercentage}% • Study time: ${this.formatTime(session.focusTime)}`;
        let emoji = '✅';

        if (focusPercentage >= 80) {
            emoji = '🌟';
            message += '\nExcellent focus!';
        } else if (focusPercentage >= 60) {
            emoji = '👍';
            message += '\nGood session!';
        } else if (focusPercentage >= 40) {
            emoji = '📊';
            message += '\nRoom for improvement.';
        } else {
            emoji = '💪';
            message += '\nLet\'s do better next time!';
        }

        await chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: `${emoji} Study Session Complete`,
            message: message,
            priority: 2,
            requireInteraction: true,
            buttons: [
                { title: 'View Details' },
                { title: 'Start New Session' }
            ]
        });
    }

    // Show milestone notification
    async showMilestone(type, value) {
        if (!this.settings.notificationsEnabled) {
            return;
        }

        let title = '';
        let message = '';

        switch (type) {
            case 'streak':
                title = '🔥 Streak Milestone!';
                message = `${value} days in a row! Keep it up!`;
                break;
            case 'totalSessions':
                title = '🎉 Session Milestone!';
                message = `You've completed ${value} study sessions!`;
                break;
            case 'totalHours':
                title = '⏰ Time Milestone!';
                message = `${value} hours of focused study time!`;
                break;
        }

        if (title) {
            await chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: title,
                message: message,
                priority: 1,
                requireInteraction: false
            });
        }
    }

    // Show custom notification
    async showNotification(title, message, options = {}) {
        if (!this.settings.notificationsEnabled) {
            return;
        }

        await chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: title,
            message: message,
            priority: options.priority || 1,
            requireInteraction: options.requireInteraction || false,
            buttons: options.buttons || []
        });
    }

    // Play notification sound
    playNotificationSound() {
        // Create an audio context and play a simple beep
        // This is a placeholder - you can add actual sound files
        try {
            const audioContext = new AudioContext();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (e) {
            console.log('Could not play sound:', e);
        }
    }

    // Format time helper
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return `${seconds}s`;
        }
    }

    // Update settings
    async updateSettings(newSettings) {
        this.settings = newSettings;
    }
}

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlertManager;
}
