// Popup Script
// Handles popup UI interactions and real-time updates

let updateInterval = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    await updateUI();

    // Set up event listeners
    document.getElementById('startBtn').addEventListener('click', startSession);
    document.getElementById('pauseBtn').addEventListener('click', pauseSession);
    document.getElementById('resumeBtn').addEventListener('click', resumeSession);
    document.getElementById('stopBtn').addEventListener('click', stopSession);
    document.getElementById('dashboardBtn').addEventListener('click', openDashboard);
    document.getElementById('statsBtn').addEventListener('click', openDashboard);
    document.getElementById('settingsBtn').addEventListener('click', openSettings);

    // Start update interval
    updateInterval = setInterval(updateUI, 1000);
});

// Update UI with current session status
async function updateUI() {
    try {
        const status = await chrome.runtime.sendMessage({ action: 'getSessionStatus' });

        if (status.isActive) {
            showActiveSession(status);
        } else {
            showInactiveSession();
        }
    } catch (error) {
        console.error('Error updating UI:', error);
    }
}

// Show active session UI
function showActiveSession(status) {
    // Update status indicator
    const sessionStatus = document.getElementById('sessionStatus');
    const statusText = document.getElementById('statusText');

    if (status.isPaused) {
        sessionStatus.className = 'session-status paused';
        statusText.textContent = 'Session Paused';
    } else {
        sessionStatus.className = 'session-status active';
        statusText.textContent = 'Session Active';
    }

    // Update timer
    document.getElementById('timerDisplay').textContent = formatTimeDisplay(status.duration);

    // Show stats
    document.getElementById('statsSection').classList.remove('hidden');
    document.getElementById('focusTime').textContent = Utils.formatTimeShort(status.focusTime);
    document.getElementById('distractionTime').textContent = Utils.formatTimeShort(status.distractionTime);

    // Update focus percentage
    document.getElementById('focusSection').classList.remove('hidden');
    document.getElementById('focusPercentage').textContent = status.focusPercentage + '%';
    document.getElementById('focusProgress').style.width = status.focusPercentage + '%';

    // Update current site
    if (status.currentSite) {
        document.getElementById('currentSiteSection').classList.remove('hidden');
        document.getElementById('currentDomain').textContent = status.currentSite.domain;

        const categoryEl = document.getElementById('currentCategory');
        categoryEl.textContent = status.currentSite.category;
        categoryEl.className = 'site-category ' + status.currentSite.category;

        document.getElementById('currentSiteTime').textContent = Utils.formatTimeShort(status.currentSite.timeSpent);
    } else {
        document.getElementById('currentSiteSection').classList.add('hidden');
    }

    // Update buttons
    document.getElementById('startBtn').classList.add('hidden');
    document.getElementById('stopBtn').classList.remove('hidden');

    if (status.isPaused) {
        document.getElementById('pauseBtn').classList.add('hidden');
        document.getElementById('resumeBtn').classList.remove('hidden');
    } else {
        document.getElementById('pauseBtn').classList.remove('hidden');
        document.getElementById('resumeBtn').classList.add('hidden');
    }
}

// Show inactive session UI
function showInactiveSession() {
    // Update status
    const sessionStatus = document.getElementById('sessionStatus');
    sessionStatus.className = 'session-status inactive';
    document.getElementById('statusText').textContent = 'No Active Session';

    // Reset timer
    document.getElementById('timerDisplay').textContent = '00:00:00';

    // Hide stats
    document.getElementById('statsSection').classList.add('hidden');
    document.getElementById('focusSection').classList.add('hidden');
    document.getElementById('currentSiteSection').classList.add('hidden');

    // Update buttons
    document.getElementById('startBtn').classList.remove('hidden');
    document.getElementById('pauseBtn').classList.add('hidden');
    document.getElementById('resumeBtn').classList.add('hidden');
    document.getElementById('stopBtn').classList.add('hidden');
}

// Format time for display (HH:MM:SS)
function formatTimeDisplay(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Start session
async function startSession() {
    try {
        const result = await chrome.runtime.sendMessage({ action: 'startSession' });
        if (result.success) {
            await updateUI();
            showNotification('Session started! Stay focused! 🎯');
        } else {
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error starting session:', error);
        showNotification('Failed to start session', 'error');
    }
}

// Pause session
async function pauseSession() {
    try {
        const result = await chrome.runtime.sendMessage({ action: 'pauseSession' });
        if (result.success) {
            await updateUI();
            showNotification('Session paused ⏸️');
        }
    } catch (error) {
        console.error('Error pausing session:', error);
    }
}

// Resume session
async function resumeSession() {
    try {
        const result = await chrome.runtime.sendMessage({ action: 'resumeSession' });
        if (result.success) {
            await updateUI();
            showNotification('Session resumed! Let\'s focus! 💪');
        }
    } catch (error) {
        console.error('Error resuming session:', error);
    }
}

// Stop session
async function stopSession() {
    if (!confirm('Are you sure you want to stop this session?')) {
        return;
    }

    try {
        const result = await chrome.runtime.sendMessage({ action: 'stopSession' });
        if (result.success) {
            await updateUI();

            // Show summary
            if (result.summary) {
                const message = `Session complete!\nFocus: ${result.summary.focusPercentage}%\nStudy time: ${Utils.formatTimeShort(result.summary.focusTime)}`;
                showNotification(message);
            }
        }
    } catch (error) {
        console.error('Error stopping session:', error);
    }
}

// Open dashboard
function openDashboard() {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
}

// Open settings
function openSettings() {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
}

// Show notification (simple toast)
function showNotification(message, type = 'success') {
    // Create toast element
    const toast = document.createElement('div');
    toast.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'error' ? '#ff6b6b' : '#4CAF50'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    animation: slideDown 0.3s ease;
  `;
    toast.textContent = message;

    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Cleanup on popup close
window.addEventListener('unload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});
