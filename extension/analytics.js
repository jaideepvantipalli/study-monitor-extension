// Analytics Engine
// Generates reports and insights from session data

class Analytics {
    constructor() {
        this.storage = new StorageManager();
    }

    // Generate session summary
    async generateSessionSummary(session) {
        const totalTime = session.focusTime + session.distractionTime;
        const focusPercentage = totalTime > 0 ? Math.round((session.focusTime / totalTime) * 100) : 0;
        const distractionPercentage =100-focusPercentage;
        // Categorize visited sites
        const studySites = [];
        const distractingSites = [];
        const neutralSites = [];
        if (session.visitedSites) {
            session.visitedSites.forEach(site => {
                if (site.category === 'educational') {
                    studySites.push(site);
                } else if (site.category === 'distracting') {
                    distractingSites.push(site);
                } else {
                    neutralSites.push(site);
                }
            });
        }
        // Sort by time spent
        studySites.sort((a, b) => b.timeSpent - a.timeSpent);
        distractingSites.sort((a, b) => b.timeSpent - a.timeSpent);

        return {
            sessionId: session.id,
            startTime: session.startTime,
            endTime: session.endTime || Date.now(),
            duration: totalTime,
            focusTime: session.focusTime,
            distractionTime: session.distractionTime,
            focusPercentage,
            distractionPercentage,
            studySites: studySites.slice(0, 10), // Top 10
            distractingSites: distractingSites.slice(0, 10), // Top 10
            neutralSites: neutralSites.slice(0, 5),
            totalSitesVisited: session.visitedSites ? session.visitedSites.length : 0,
            blockedAttempts: session.blockedAttempts || 0,
            alertsShown: session.alertsShown || 0
        };
    }

    // Generate daily report
    async generateDailyReport(date = new Date()) {
        const startOfDay = new Date(date).setHours(0, 0, 0, 0);
        const endOfDay = new Date(date).setHours(23, 59, 59, 999);

        const sessions = await this.storage.getSessionsByDateRange(startOfDay, endOfDay);

        if (sessions.length === 0) {
            return {
                date: startOfDay,
                noData: true
            };
        }

        let totalFocusTime = 0;
        let totalDistractionTime = 0;
        const allSites = {};

        sessions.forEach(session => {
            totalFocusTime += session.focusTime || 0;
            totalDistractionTime += session.distractionTime || 0;

            if (session.visitedSites) {
                session.visitedSites.forEach(site => {
                    if (!allSites[site.domain]) {
                        allSites[site.domain] = {
                            domain: site.domain,
                            category: site.category,
                            timeSpent: 0,
                            visits: 0
                        };
                    }
                    allSites[site.domain].timeSpent += site.timeSpent;
                    allSites[site.domain].visits += site.visits || 1;
                });
            }
        });

        const totalTime = totalFocusTime + totalDistractionTime;
        const focusPercentage = totalTime > 0 ? Math.round((totalFocusTime / totalTime) * 100) : 0;

        // Convert sites object to array and sort
        const sitesArray = Object.values(allSites).sort((a, b) => b.timeSpent - a.timeSpent);

        return {
            date: startOfDay,
            totalSessions: sessions.length,
            totalFocusTime,
            totalDistractionTime,
            totalTime,
            focusPercentage,
            topSites: sitesArray.slice(0, 10),
            sessions: await Promise.all(sessions.map(s => this.generateSessionSummary(s)))
        };
    }

    // Generate weekly report
    async generateWeeklyReport(weekStartDate = null) {
        // Fix: don't mutate today when computing week start
        let startOfWeek;
        if (weekStartDate) {
            startOfWeek = new Date(weekStartDate);
        } else {
            const now = new Date();
            const dayOfWeek = now.getDay();
            startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - dayOfWeek);
        }
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        const sessions = await this.storage.getSessionsByDateRange(startOfWeek.getTime(), endOfWeek.getTime());

        if (sessions.length === 0) {
            return {
                weekStart: startOfWeek.getTime(),
                weekEnd: endOfWeek.getTime(),
                noData: true
            };
        }

        // Group sessions by day
        const dailyData = {};
        const allSites = {};
        let totalFocusTime = 0;
        let totalDistractionTime = 0;

        sessions.forEach(session => {
            const sessionDate = new Date(session.completedAt || session.startTime).setHours(0, 0, 0, 0);

            if (!dailyData[sessionDate]) {
                dailyData[sessionDate] = {
                    date: sessionDate,
                    sessions: 0,
                    focusTime: 0,
                    distractionTime: 0
                };
            }

            dailyData[sessionDate].sessions++;
            dailyData[sessionDate].focusTime += session.focusTime || 0;
            dailyData[sessionDate].distractionTime += session.distractionTime || 0;

            totalFocusTime += session.focusTime || 0;
            totalDistractionTime += session.distractionTime || 0;

            if (session.visitedSites) {
                session.visitedSites.forEach(site => {
                    if (!allSites[site.domain]) {
                        allSites[site.domain] = {
                            domain: site.domain,
                            category: site.category,
                            timeSpent: 0,
                            visits: 0
                        };
                    }
                    allSites[site.domain].timeSpent += site.timeSpent;
                    allSites[site.domain].visits += site.visits || 1;
                });
            }
        });

        const totalTime = totalFocusTime + totalDistractionTime;
        const averageFocusPercentage = totalTime > 0 ? Math.round((totalFocusTime / totalTime) * 100) : 0;

        // Fill in missing days with zero data
        const dailyDataArray = [];
        for (let d = new Date(startOfWeek); d <= endOfWeek; d.setDate(d.getDate() + 1)) {
            const dateKey = new Date(d).setHours(0, 0, 0, 0);
            dailyDataArray.push(dailyData[dateKey] || {
                date: dateKey,
                sessions: 0,
                focusTime: 0,
                distractionTime: 0
            });
        }

        const sitesArray = Object.values(allSites).sort((a, b) => b.timeSpent - a.timeSpent);

        return {
            weekStart: startOfWeek.getTime(),
            weekEnd: endOfWeek.getTime(),
            totalSessions: sessions.length,
            totalFocusTime,
            totalDistractionTime,
            totalTime,
            averageFocusPercentage,
            dailyBreakdown: dailyDataArray,
            topStudySites: sitesArray.filter(s => s.category === 'educational').slice(0, 10),
            topDistractingSites: sitesArray.filter(s => s.category === 'distracting').slice(0, 10),
            mostProductiveDay: this.findMostProductiveDay(dailyDataArray),
            insights: this.generateInsights(dailyDataArray, sitesArray)
        };
    }

    // Find most productive day
    findMostProductiveDay(dailyData) {
        let maxFocus = 0;
        let mostProductiveDay = null;

        dailyData.forEach(day => {
            if (day.focusTime > maxFocus) {
                maxFocus = day.focusTime;
                mostProductiveDay = day;
            }
        });

        return mostProductiveDay;
    }

    // Generate insights
    generateInsights(dailyData, sites) {
        const insights = [];

        // Check for consistency
        const daysWithSessions = dailyData.filter(d => d.sessions > 0).length;
        if (daysWithSessions >= 5) {
            insights.push({
                type: 'positive',
                message: `Great consistency! You studied ${daysWithSessions} days this week.`
            });
        } else if (daysWithSessions <= 2) {
            insights.push({
                type: 'suggestion',
                message: 'Try to study more consistently throughout the week.'
            });
        }

        // Check for top distracting site
        const topDistraction = sites.filter(s => s.category === 'distracting')[0];
        if (topDistraction && topDistraction.timeSpent > 1800) { // More than 30 minutes
            insights.push({
                type: 'warning',
                message: `${topDistraction.domain} took ${this.formatTime(topDistraction.timeSpent)} of your time. Consider blocking it during study sessions.`
            });
        }

        // Check for improvement trend
        const recentDays = dailyData.slice(-3);
        const earlierDays = dailyData.slice(0, 3);

        const recentAvgFocus = recentDays.reduce((sum, d) => sum + d.focusTime, 0) / recentDays.length;
        const earlierAvgFocus = earlierDays.reduce((sum, d) => sum + d.focusTime, 0) / earlierDays.length;

        if (recentAvgFocus > earlierAvgFocus * 1.2) {
            insights.push({
                type: 'positive',
                message: 'Your focus is improving! Keep up the momentum.'
            });
        }

        return insights;
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

    // Export session data for external analysis
    async exportSessionData(format = 'json') {
        const sessions = await this.storage.getSessionHistory();
        const stats = await this.storage.getStatistics();

        const exportData = {
            exportDate: Date.now(),
            totalSessions: sessions.length,
            statistics: stats,
            sessions: await Promise.all(sessions.map(s => this.generateSessionSummary(s)))
        };

        if (format === 'csv') {
            return this.convertToCSV(exportData.sessions);
        }

        return exportData;
    }

    // Convert to CSV format
    convertToCSV(sessions) {
        const headers = ['Session ID', 'Start Time', 'Duration', 'Focus Time', 'Distraction Time', 'Focus %', 'Sites Visited'];
        const rows = sessions.map(s => [
            s.sessionId,
            new Date(s.startTime).toISOString(),
            s.duration,
            s.focusTime,
            s.distractionTime,
            s.focusPercentage,
            s.totalSitesVisited
        ]);

        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Analytics;
}
