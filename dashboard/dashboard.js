// Dashboard Script
// Handles dashboard UI, data visualization, and reports

let currentWeekStart = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    // Set up tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Set up event listeners
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('settingsBtn').addEventListener('click', () => {
        window.location.href = '../settings/settings.html';
    });

    document.getElementById('sessionFilter').addEventListener('change', loadSessions);
    document.getElementById('prevWeek').addEventListener('click', () => changeWeek(-1));
    document.getElementById('nextWeek').addEventListener('click', () => changeWeek(1));

    // Load initial data
    await loadOverview();
    await loadSessions();

    // Set current week
    currentWeekStart = getWeekStart(new Date());
    await loadWeeklyReport();
});

// Switch tabs
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');

    // Load data for specific tabs
    if (tabName === 'weekly') {
        loadWeeklyReport();
    } else if (tabName === 'insights') {
        loadInsights();
    }
}

// Load overview data
async function loadOverview() {
    try {
        const stats = await chrome.runtime.sendMessage({ action: 'getStatistics' });
        const dailyReport = await chrome.runtime.sendMessage({ action: 'getDailyReport' });

        // Update statistics cards
        document.getElementById('currentStreak').textContent = stats.currentStreak || 0;
        document.getElementById('totalSessions').textContent = stats.totalSessions || 0;
        document.getElementById('totalFocusTime').textContent = formatHours(stats.totalFocusTime || 0);
        document.getElementById('avgFocusPercentage').textContent = (stats.averageFocusPercentage || 0) + '%';

        // Draw today's pie chart
        if (!dailyReport.noData) {
            drawPieChart(dailyReport.totalFocusTime, dailyReport.totalDistractionTime);
        }

        // Load top sites
        loadTopSites(stats);

    } catch (error) {
        console.error('Error loading overview:', error);
    }
}

// Draw pie chart for today's activity
function drawPieChart(focusTime, distractionTime) {
    const total = focusTime + distractionTime;
    if (total === 0) {
        document.getElementById('todayChart').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">No data for today</div></div>';
        return;
    }

    const focusPercentage = (focusTime / total) * 100;
    const distractionPercentage = (distractionTime / total) * 100;

    const svg = document.getElementById('todayPieChart');
    const radius = 80;
    const centerX = 100;
    const centerY = 100;

    // Clear existing content
    svg.innerHTML = '';

    // Calculate angles
    const focusAngle = (focusPercentage / 100) * 360;
    const distractionAngle = (distractionPercentage / 100) * 360;

    // Draw focus slice
    const focusPath = describeArc(centerX, centerY, radius, 0, focusAngle);
    const focusSlice = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    focusSlice.setAttribute('d', focusPath);
    focusSlice.setAttribute('fill', '#667eea');
    svg.appendChild(focusSlice);

    // Draw distraction slice
    const distractionPath = describeArc(centerX, centerY, radius, focusAngle, focusAngle + distractionAngle);
    const distractionSlice = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    distractionSlice.setAttribute('d', distractionPath);
    distractionSlice.setAttribute('fill', '#ff6b6b');
    svg.appendChild(distractionSlice);

    // Update legend
    const legend = document.getElementById('todayLegend');
    legend.innerHTML = `
    <div class="legend-item">
      <div class="legend-color" style="background: #667eea;"></div>
      <span>Focus: ${Utils.formatTimeShort(focusTime)} (${Math.round(focusPercentage)}%)</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #ff6b6b;"></div>
      <span>Distracted: ${Utils.formatTimeShort(distractionTime)} (${Math.round(distractionPercentage)}%)</span>
    </div>
  `;
}

// Helper function to describe SVG arc
function describeArc(x, y, radius, startAngle, endAngle) {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
        'M', x, y,
        'L', start.x, start.y,
        'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
        'Z'
    ].join(' ');
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
}

// Load top sites
function loadTopSites(stats) {
    const studySitesEl = document.getElementById('topStudySites');
    const distractingSitesEl = document.getElementById('topDistractingSites');

    // Top study sites
    const studySites = Object.entries(stats.topStudySites || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (studySites.length === 0) {
        studySitesEl.innerHTML = '<div class="empty-state-text">No study sites yet</div>';
    } else {
        studySitesEl.innerHTML = studySites.map(([domain, time]) => `
      <div class="site-item">
        <span class="site-name">${domain}</span>
        <span class="site-time">${Utils.formatTimeShort(time)}</span>
      </div>
    `).join('');
    }

    // Top distracting sites
    const distractingSites = Object.entries(stats.topDistractingSites || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (distractingSites.length === 0) {
        distractingSitesEl.innerHTML = '<div class="empty-state-text">No distracting sites tracked</div>';
    } else {
        distractingSitesEl.innerHTML = distractingSites.map(([domain, time]) => `
      <div class="site-item">
        <span class="site-name">${domain}</span>
        <span class="site-time">${Utils.formatTimeShort(time)}</span>
      </div>
    `).join('');
    }
}

// Load sessions
async function loadSessions() {
    try {
        const filter = document.getElementById('sessionFilter').value;
        let sessions = await chrome.runtime.sendMessage({ action: 'getSessionHistory', limit: 50 });

        // Filter sessions based on selection
        const now = Date.now();
        if (filter === 'today') {
            const startOfDay = new Date().setHours(0, 0, 0, 0);
            sessions = sessions.filter(s => (s.completedAt || s.startTime) >= startOfDay);
        } else if (filter === 'week') {
            const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
            sessions = sessions.filter(s => (s.completedAt || s.startTime) >= weekAgo);
        } else if (filter === 'month') {
            const monthAgo = now - (30 * 24 * 60 * 60 * 1000);
            sessions = sessions.filter(s => (s.completedAt || s.startTime) >= monthAgo);
        }

        const sessionsList = document.getElementById('sessionsList');

        if (sessions.length === 0) {
            sessionsList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📚</div><div class="empty-state-text">No sessions found</div></div>';
            return;
        }

        sessionsList.innerHTML = sessions.reverse().map(session => {
            const totalTime = session.focusTime + session.distractionTime;
            const focusPercentage = totalTime > 0 ? Math.round((session.focusTime / totalTime) * 100) : 0;

            return `
        <div class="session-item">
          <div class="session-header">
            <span class="session-date">${Utils.formatDate(session.completedAt || session.startTime)}</span>
            <span class="session-duration">${Utils.formatTimeShort(totalTime)}</span>
          </div>
          <div class="session-stats">
            <div class="session-stat">
              <div class="session-stat-value">${focusPercentage}%</div>
              <div class="session-stat-label">Focus</div>
            </div>
            <div class="session-stat">
              <div class="session-stat-value">${Utils.formatTimeShort(session.focusTime)}</div>
              <div class="session-stat-label">Study Time</div>
            </div>
            <div class="session-stat">
              <div class="session-stat-value">${Utils.formatTimeShort(session.distractionTime)}</div>
              <div class="session-stat-label">Distracted</div>
            </div>
          </div>
        </div>
      `;
        }).join('');

    } catch (error) {
        console.error('Error loading sessions:', error);
    }
}

// Load weekly report
async function loadWeeklyReport() {
    try {
        const report = await chrome.runtime.sendMessage({
            action: 'getWeeklyReport',
            weekStart: currentWeekStart
        });

        // Update week range display
        const weekEnd = new Date(report.weekEnd);
        const weekStart = new Date(report.weekStart);
        document.getElementById('weekRange').textContent =
            `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

        const reportEl = document.getElementById('weeklyReport');

        if (report.noData) {
            reportEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">No data for this week</div></div>';
            return;
        }

        // Create daily breakdown
        const dailyBreakdownHTML = `
      <div class="daily-breakdown">
        ${report.dailyBreakdown.map((day, index) => {
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index];
            const focusTime = Utils.formatTimeShort(day.focusTime);
            return `
            <div class="day-card">
              <div class="day-name">${dayName}</div>
              <div class="day-focus">${focusTime}</div>
              <div class="stat-label">${day.sessions} sessions</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

        // Create summary
        const summaryHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">📚</div>
          <div class="stat-info">
            <div class="stat-value">${report.totalSessions}</div>
            <div class="stat-label">Total Sessions</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">⏰</div>
          <div class="stat-info">
            <div class="stat-value">${formatHours(report.totalFocusTime)}</div>
            <div class="stat-label">Focus Time</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🎯</div>
          <div class="stat-info">
            <div class="stat-value">${report.averageFocusPercentage}%</div>
            <div class="stat-label">Avg Focus</div>
          </div>
        </div>
      </div>
    `;

        reportEl.innerHTML = summaryHTML + dailyBreakdownHTML;

    } catch (error) {
        console.error('Error loading weekly report:', error);
    }
}

// Change week
function changeWeek(direction) {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    currentWeekStart = new Date(currentWeekStart.getTime() + (direction * weekMs));
    loadWeeklyReport();
}

// Get week start date
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
}

// Load insights
async function loadInsights() {
    try {
        const report = await chrome.runtime.sendMessage({ action: 'getWeeklyReport' });
        const insightsList = document.getElementById('insightsList');

        if (report.noData || !report.insights || report.insights.length === 0) {
            insightsList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💡</div><div class="empty-state-text">Not enough data for insights yet</div></div>';
            return;
        }

        insightsList.innerHTML = report.insights.map(insight => {
            const iconMap = {
                positive: '🌟',
                warning: '⚠️',
                suggestion: '💡'
            };

            return `
        <div class="insight-card ${insight.type}">
          <div class="insight-icon">${iconMap[insight.type]}</div>
          <div class="insight-message">${insight.message}</div>
        </div>
      `;
        }).join('');

    } catch (error) {
        console.error('Error loading insights:', error);
    }
}

// Export data
async function exportData() {
    try {
        const format = confirm('Export as JSON? (Cancel for CSV)') ? 'json' : 'csv';
        const data = await chrome.runtime.sendMessage({ action: 'exportData', format });

        const filename = `study-monitor-export-${new Date().toISOString().split('T')[0]}.${format}`;

        if (format === 'json') {
            Utils.exportAsJSON(data, filename);
        } else {
            Utils.exportAsCSV(data, filename);
        }

        alert('Data exported successfully!');
    } catch (error) {
        console.error('Error exporting data:', error);
        alert('Failed to export data');
    }
}

// Format hours
function formatHours(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}
