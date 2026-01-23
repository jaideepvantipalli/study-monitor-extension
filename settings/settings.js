// Settings Script
// Handles settings UI and persistence

// Initialize settings page
document.addEventListener('DOMContentLoaded', async () => {
    // Load current settings
    await loadSettings();

    // Set up event listeners
    document.getElementById('saveBtn').addEventListener('click', saveSettings);
    document.getElementById('resetBtn').addEventListener('click', resetSettings);
    document.getElementById('clearDataBtn').addEventListener('click', clearAllData);
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = '../dashboard/dashboard.html';
    });
});

// Load settings from storage
async function loadSettings() {
    try {
        const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });

        // Session settings
        document.getElementById('sessionDuration').value = settings.sessionDuration / 60;
        document.getElementById('breakDuration').value = settings.breakDuration / 60;
        document.getElementById('longBreakDuration').value = settings.longBreakDuration / 60;

        // Alert settings
        document.getElementById('distractionAlertEnabled').checked = settings.distractionAlertEnabled;
        document.getElementById('distractionAlertDelay').value = settings.distractionAlertDelay;
        document.getElementById('distractionAlertFrequency').value = settings.distractionAlertFrequency;

        // Break reminder settings
        document.getElementById('breakReminderEnabled').checked = settings.breakReminderEnabled;
        document.getElementById('breakReminderInterval').value = settings.breakReminderInterval / 60;

        // Blocking settings
        document.getElementById('blockingEnabled').checked = settings.blockingEnabled;
        document.getElementById('blockingThreshold').value = settings.blockingThreshold / 60;
        document.getElementById('blockingDuration').value = settings.blockingDuration / 60;

        // Notification settings
        document.getElementById('notificationsEnabled').checked = settings.notificationsEnabled;
        document.getElementById('soundEnabled').checked = settings.soundEnabled;

        // Data settings
        document.getElementById('dataRetentionDays').value = settings.dataRetentionDays;

    } catch (error) {
        console.error('Error loading settings:', error);
        showToast('Failed to load settings', 'error');
    }
}

// Save settings
async function saveSettings() {
    try {
        const settings = {
            // Session settings (convert minutes to seconds)
            sessionDuration: parseInt(document.getElementById('sessionDuration').value) * 60,
            breakDuration: parseInt(document.getElementById('breakDuration').value) * 60,
            longBreakDuration: parseInt(document.getElementById('longBreakDuration').value) * 60,
            sessionsBeforeLongBreak: 4,

            // Alert settings
            distractionAlertEnabled: document.getElementById('distractionAlertEnabled').checked,
            distractionAlertDelay: parseInt(document.getElementById('distractionAlertDelay').value),
            distractionAlertFrequency: parseInt(document.getElementById('distractionAlertFrequency').value),

            // Break reminder settings
            breakReminderEnabled: document.getElementById('breakReminderEnabled').checked,
            breakReminderInterval: parseInt(document.getElementById('breakReminderInterval').value) * 60,

            // Blocking settings
            blockingEnabled: document.getElementById('blockingEnabled').checked,
            blockingThreshold: parseInt(document.getElementById('blockingThreshold').value) * 60,
            blockingDuration: parseInt(document.getElementById('blockingDuration').value) * 60,

            // Notification settings
            notificationsEnabled: document.getElementById('notificationsEnabled').checked,
            soundEnabled: document.getElementById('soundEnabled').checked,

            // Data settings
            dataRetentionDays: parseInt(document.getElementById('dataRetentionDays').value),

            // UI settings (keep existing values)
            theme: 'light',
            compactMode: false
        };

        // Validate settings
        if (!validateSettings(settings)) {
            return;
        }

        // Save to storage
        const result = await chrome.runtime.sendMessage({
            action: 'updateSettings',
            settings: settings
        });

        if (result.success) {
            showToast('Settings saved successfully! ✓');
        } else {
            showToast('Failed to save settings', 'error');
        }

    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Failed to save settings', 'error');
    }
}

// Validate settings
function validateSettings(settings) {
    if (settings.sessionDuration < 60 || settings.sessionDuration > 10800) {
        showToast('Session duration must be between 1 and 180 minutes', 'error');
        return false;
    }

    if (settings.breakDuration < 60 || settings.breakDuration > 3600) {
        showToast('Break duration must be between 1 and 60 minutes', 'error');
        return false;
    }

    if (settings.distractionAlertDelay < 5 || settings.distractionAlertDelay > 300) {
        showToast('Alert delay must be between 5 and 300 seconds', 'error');
        return false;
    }

    if (settings.dataRetentionDays < 7 || settings.dataRetentionDays > 365) {
        showToast('Data retention must be between 7 and 365 days', 'error');
        return false;
    }

    return true;
}

// Reset to default settings
async function resetSettings() {
    if (!confirm('Are you sure you want to reset all settings to defaults?')) {
        return;
    }

    try {
        // Get default settings
        const defaultSettings = {
            sessionDuration: 25 * 60,
            breakDuration: 5 * 60,
            longBreakDuration: 15 * 60,
            sessionsBeforeLongBreak: 4,
            distractionAlertEnabled: true,
            distractionAlertDelay: 10,
            distractionAlertFrequency: 60,
            breakReminderEnabled: true,
            breakReminderInterval: 25 * 60,
            blockingEnabled: false,
            blockingThreshold: 5 * 60,
            blockingDuration: 10 * 60,
            notificationsEnabled: true,
            soundEnabled: false,
            dataRetentionDays: 90,
            theme: 'light',
            compactMode: false
        };

        // Save default settings
        await chrome.runtime.sendMessage({
            action: 'updateSettings',
            settings: defaultSettings
        });

        // Reload settings UI
        await loadSettings();

        showToast('Settings reset to defaults ✓');

    } catch (error) {
        console.error('Error resetting settings:', error);
        showToast('Failed to reset settings', 'error');
    }
}

// Clear all data
async function clearAllData() {
    const confirmation = prompt(
        'This will permanently delete ALL session history and statistics.\n\n' +
        'Type "DELETE" to confirm:'
    );

    if (confirmation !== 'DELETE') {
        return;
    }

    try {
        const result = await chrome.runtime.sendMessage({ action: 'clearAllData' });

        if (result.success) {
            showToast('All data cleared successfully ✓');
        } else {
            showToast('Failed to clear data', 'error');
        }

    } catch (error) {
        console.error('Error clearing data:', error);
        showToast('Failed to clear data', 'error');
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
