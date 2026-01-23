// Background Service Worker
// Main controller for the Study Monitor extension

importScripts('utils.js', 'storage.js', 'classifier.js', 'alerts.js', 'analytics.js');

// Initialize managers
const storage = new StorageManager();
const classifier = new Classifier();
const alertManager = new AlertManager();
const analytics = new Analytics();

// Session state
let currentSession = null;
let activeTabId = null;
let currentSiteStartTime = null;
let currentSiteData = null;
let blockedSites = new Map(); // domain -> unblock timestamp
let settings = null;

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
    console.log('Study Monitor Extension installed');

    // Load settings
    settings = await storage.getSettings();

    // Set up alarms for break reminders
    chrome.alarms.create('checkBreakReminder', { periodInMinutes: 1 });
    chrome.alarms.create('cleanupData', { periodInMinutes: 1440 }); // Daily cleanup

    // Initialize badge
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
});

// Load settings on startup
chrome.runtime.onStartup.addListener(async () => {
    settings = await storage.getSettings();

    // Restore current session if exists
    currentSession = await storage.getCurrentSession();
    if (currentSession && currentSession.isActive) {
        updateBadge('active');
    }
});

// Tab activation listener
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    activeTabId = activeInfo.tabId;

    if (currentSession && currentSession.isActive) {
        // Save time for previous site
        await saveCurrentSiteTime();

        // Start tracking new site
        const tab = await chrome.tabs.get(activeTabId);
        if (tab.url) {
            await startTrackingSite(tab.url);
        }
    }
});

// Tab update listener (URL changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url && tabId === activeTabId && currentSession && currentSession.isActive) {
        // Save time for previous site
        await saveCurrentSiteTime();

        // Start tracking new site
        await startTrackingSite(changeInfo.url);
    }
});

// Web navigation listener
chrome.webNavigation.onCompleted.addListener(async (details) => {
    if (details.frameId === 0 && details.tabId === activeTabId && currentSession && currentSession.isActive) {
        // Request page data from content script
        try {
            const response = await chrome.tabs.sendMessage(details.tabId, { action: 'getPageData' });
            if (response && currentSiteData) {
                currentSiteData.pageData = response;

                // Re-classify with page data
                const classification = await classifier.classifyUrl(details.url, response);
                currentSiteData.category = classification.category;
                currentSiteData.confidence = classification.confidence;

                // Check if we need to show alert or block
                await checkDistractionAlert();
            }
        } catch (e) {
            // Content script might not be ready yet
            console.log('Could not get page data:', e);
        }
    }
});

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    handleMessage(request, sender).then(sendResponse);
    return true; // Keep channel open for async response
});

// Handle messages from popup and content scripts
async function handleMessage(request, sender) {
    switch (request.action) {
        case 'startSession':
            return await startSession();

        case 'stopSession':
            return await stopSession();

        case 'pauseSession':
            return await pauseSession();

        case 'resumeSession':
            return await resumeSession();

        case 'getSessionStatus':
            return await getSessionStatus();

        case 'getSettings':
            return await storage.getSettings();

        case 'updateSettings':
            settings = request.settings;
            await storage.saveSettings(settings);
            await alertManager.updateSettings(settings);
            return { success: true };

        case 'getStatistics':
            return await storage.getStatistics();

        case 'getSessionHistory':
            return await storage.getSessionHistory(request.limit);

        case 'getDailyReport':
            return await analytics.generateDailyReport(request.date);

        case 'getWeeklyReport':
            return await analytics.generateWeeklyReport(request.weekStart);

        case 'addToWhitelist':
            await classifier.addToWhitelist(request.domain);
            return { success: true };

        case 'addToBlacklist':
            await classifier.addToBlacklist(request.domain);
            return { success: true };

        case 'exportData':
            return await analytics.exportSessionData(request.format);

        case 'clearAllData':
            await storage.clearAllData();
            return { success: true };

        default:
            return { error: 'Unknown action' };
    }
}

// Start a new study session
async function startSession() {
    if (currentSession && currentSession.isActive) {
        return { error: 'Session already active' };
    }

    currentSession = {
        id: Utils.generateId(),
        startTime: Date.now(),
        endTime: null,
        isActive: true,
        isPaused: false,
        focusTime: 0,
        distractionTime: 0,
        neutralTime: 0,
        visitedSites: [],
        alertsShown: 0,
        blockedAttempts: 0
    };

    await storage.saveCurrentSession(currentSession);

    // Get active tab and start tracking
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
        activeTabId = tabs[0].id;
        await startTrackingSite(tabs[0].url);
    }

    // Set up break reminder alarm
    if (settings.breakReminderEnabled) {
        chrome.alarms.create('breakReminder', {
            delayInMinutes: settings.breakReminderInterval / 60
        });
    }

    updateBadge('active');

    return { success: true, session: currentSession };
}

// Stop the current session
async function stopSession() {
    if (!currentSession || !currentSession.isActive) {
        return { error: 'No active session' };
    }

    // Save current site time
    await saveCurrentSiteTime();

    // Finalize session
    currentSession.endTime = Date.now();
    currentSession.isActive = false;

    // Add to history
    await storage.addSessionToHistory(currentSession);

    // Update statistics
    await storage.updateStatistics(currentSession);

    // Generate summary
    const summary = await analytics.generateSessionSummary(currentSession);

    // Show completion notification
    await alertManager.showSessionComplete(currentSession);

    // Clear current session
    await storage.clearCurrentSession();
    currentSession = null;
    currentSiteData = null;

    // Clear alarms
    chrome.alarms.clear('breakReminder');

    updateBadge('inactive');

    return { success: true, summary };
}

// Pause session
async function pauseSession() {
    if (!currentSession || !currentSession.isActive || currentSession.isPaused) {
        return { error: 'Cannot pause session' };
    }

    await saveCurrentSiteTime();
    currentSession.isPaused = true;
    await storage.saveCurrentSession(currentSession);

    updateBadge('paused');

    return { success: true };
}

// Resume session
async function resumeSession() {
    if (!currentSession || !currentSession.isActive || !currentSession.isPaused) {
        return { error: 'Cannot resume session' };
    }

    currentSession.isPaused = false;
    await storage.saveCurrentSession(currentSession);

    // Start tracking current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
        await startTrackingSite(tabs[0].url);
    }

    updateBadge('active');

    return { success: true };
}

// Get current session status
async function getSessionStatus() {
    if (!currentSession) {
        return { isActive: false };
    }

    // Calculate current duration
    const now = Date.now();
    const duration = Math.floor((now - currentSession.startTime) / 1000);
    const totalTime = currentSession.focusTime + currentSession.distractionTime + currentSession.neutralTime;
    const focusPercentage = totalTime > 0 ? Math.round((currentSession.focusTime / totalTime) * 100) : 0;

    return {
        isActive: currentSession.isActive,
        isPaused: currentSession.isPaused,
        duration,
        focusTime: currentSession.focusTime,
        distractionTime: currentSession.distractionTime,
        neutralTime: currentSession.neutralTime,
        focusPercentage,
        currentSite: currentSiteData ? {
            domain: currentSiteData.domain,
            category: currentSiteData.category,
            timeSpent: Math.floor((now - currentSiteStartTime) / 1000)
        } : null
    };
}

// Start tracking a new site
async function startTrackingSite(url) {
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
        return;
    }

    const domain = Utils.extractDomain(url);

    // Check if site is blocked
    if (blockedSites.has(domain)) {
        const unblockTime = blockedSites.get(domain);
        if (Date.now() < unblockTime) {
            // Still blocked - redirect or show warning
            currentSession.blockedAttempts++;
            const timeRemaining = Math.floor((unblockTime - Date.now()) / 1000);
            await alertManager.showBlockedNotification(domain, timeRemaining);

            // Optionally redirect to a blocking page
            // chrome.tabs.update(activeTabId, { url: 'blocked.html?domain=' + domain });
            return;
        } else {
            // Unblock
            blockedSites.delete(domain);
        }
    }

    // Classify the URL
    const classification = await classifier.classifyUrl(url);

    currentSiteData = {
        url,
        domain,
        category: classification.category,
        confidence: classification.confidence,
        pageData: null
    };

    currentSiteStartTime = Date.now();
}

// Save time spent on current site
async function saveCurrentSiteTime() {
    if (!currentSiteData || !currentSiteStartTime || currentSession.isPaused) {
        return;
    }

    const now = Date.now();
    const timeSpent = Math.floor((now - currentSiteStartTime) / 1000);

    if (timeSpent < 1) {
        return; // Ignore very short visits
    }

    // Update session times
    if (currentSiteData.category === 'educational') {
        currentSession.focusTime += timeSpent;
    } else if (currentSiteData.category === 'distracting') {
        currentSession.distractionTime += timeSpent;
    } else {
        currentSession.neutralTime += timeSpent;
    }

    // Add to visited sites
    const existingSite = currentSession.visitedSites.find(s => s.domain === currentSiteData.domain);
    if (existingSite) {
        existingSite.timeSpent += timeSpent;
        existingSite.visits++;
    } else {
        currentSession.visitedSites.push({
            domain: currentSiteData.domain,
            category: currentSiteData.category,
            timeSpent,
            visits: 1
        });
    }

    await storage.saveCurrentSession(currentSession);

    // Reset for next site
    currentSiteData = null;
    currentSiteStartTime = null;
}

// Check if distraction alert should be shown
async function checkDistractionAlert() {
    if (!currentSiteData || currentSiteData.category !== 'distracting') {
        return;
    }

    const timeOnSite = Math.floor((Date.now() - currentSiteStartTime) / 1000);

    // Show alert after delay
    if (timeOnSite >= settings.distractionAlertDelay) {
        await alertManager.showDistractionAlert(currentSiteData.domain, timeOnSite);
        currentSession.alertsShown++;

        // Check if should block
        if (settings.blockingEnabled && timeOnSite >= settings.blockingThreshold) {
            const unblockTime = Date.now() + (settings.blockingDuration * 1000);
            blockedSites.set(currentSiteData.domain, unblockTime);
            await alertManager.showBlockedNotification(currentSiteData.domain, settings.blockingDuration);
        }
    }
}

// Alarm listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
    switch (alarm.name) {
        case 'breakReminder':
            if (currentSession && currentSession.isActive && !currentSession.isPaused) {
                const sessionDuration = Math.floor((Date.now() - currentSession.startTime) / 1000);
                await alertManager.showBreakReminder(sessionDuration);

                // Schedule next reminder
                if (settings.breakReminderEnabled) {
                    chrome.alarms.create('breakReminder', {
                        delayInMinutes: settings.breakReminderInterval / 60
                    });
                }
            }
            break;

        case 'checkBreakReminder':
            // Periodic check for distraction alerts
            if (currentSession && currentSession.isActive && !currentSession.isPaused && currentSiteData) {
                await checkDistractionAlert();
            }
            break;

        case 'cleanupData':
            await storage.cleanOldData();
            break;
    }
});

// Notification button click handler
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    if (notificationId.includes('sessionComplete')) {
        if (buttonIndex === 0) {
            // View Details - open dashboard
            chrome.tabs.create({ url: 'dashboard/dashboard.html' });
        } else if (buttonIndex === 1) {
            // Start New Session
            await startSession();
        }
    } else if (notificationId.includes('breakReminder')) {
        if (buttonIndex === 0) {
            // Start Break
            await pauseSession();
        }
        // Button 1 is "Continue Studying" - do nothing
    }
});

// Update extension badge
function updateBadge(status) {
    switch (status) {
        case 'active':
            chrome.action.setBadgeText({ text: '●' });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
            break;
        case 'paused':
            chrome.action.setBadgeText({ text: '❚❚' });
            chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
            break;
        case 'inactive':
            chrome.action.setBadgeText({ text: '' });
            break;
    }
}

// Periodic session save (every 10 seconds)
setInterval(async () => {
    if (currentSession && currentSession.isActive && !currentSession.isPaused) {
        // Update current site time in session
        if (currentSiteData && currentSiteStartTime) {
            const timeSpent = Math.floor((Date.now() - currentSiteStartTime) / 1000);

            // Temporarily update session for saving
            const tempSession = { ...currentSession };
            if (currentSiteData.category === 'educational') {
                tempSession.focusTime = currentSession.focusTime + timeSpent;
            } else if (currentSiteData.category === 'distracting') {
                tempSession.distractionTime = currentSession.distractionTime + timeSpent;
            } else {
                tempSession.neutralTime = currentSession.neutralTime + timeSpent;
            }

            await storage.saveCurrentSession(tempSession);
        }
    }
}, 10000);
