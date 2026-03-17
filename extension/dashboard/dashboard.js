// Dashboard Script
// Handles dashboard UI, data visualization, and reports

let currentWeekStart = null;

// ── Initialize ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Tab navigation
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Button listeners
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('settingsBtn').addEventListener('click', () => {
    window.location.href = '../settings/settings.html';
  });
  document.getElementById('sessionFilter').addEventListener('change', loadSessions);
  document.getElementById('prevWeek').addEventListener('click', () => changeWeek(-1));
  document.getElementById('nextWeek').addEventListener('click', () => changeWeek(1));

  // Set current week start
  currentWeekStart = getWeekStart(new Date());

  // Load all tabs concurrently for faster paint
  await Promise.all([
    loadOverview(),
    loadSessions()
  ]);
  await loadWeeklyReport();
});

// ── Tab switching ─────────────────────────────────────────────────────────────

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tabName).classList.add('active');

  if (tabName === 'weekly') loadWeeklyReport();
  else if (tabName === 'insights') loadInsights();
}

// ── Overview ──────────────────────────────────────────────────────────────────

async function loadOverview() {
  try {
    const [stats, dailyReport] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getStatistics' }),
      chrome.runtime.sendMessage({ action: 'getDailyReport' })
    ]);

    // Stats cards
    document.getElementById('currentStreak').textContent = stats.currentStreak || 0;
    document.getElementById('totalSessions').textContent = stats.totalSessions || 0;
    document.getElementById('totalFocusTime').textContent = formatHours(stats.totalFocusTime || 0);
    document.getElementById('avgFocusPercentage').textContent = (stats.averageFocusPercentage || 0) + '%';

    // Pie chart — today's activity (focus + distraction only)
    if (dailyReport && !dailyReport.noData) {
      drawPieChart(
        dailyReport.totalFocusTime || 0,
        dailyReport.totalDistractionTime || 0
      );
    } else {
      document.getElementById('todayChart').innerHTML =
        `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">No data for today — start a session!</div></div>`;
    }

    // Top sites
    loadTopSites(stats);

  } catch (error) {
    console.error('Error loading overview:', error);
    showError('overview-error', 'Could not load overview data.');
  }
}

// ── Pie chart (today's activity) ─────────────────────────────────────────────

function drawPieChart(focusTime, distractionTime) {
  const total = focusTime + distractionTime;

  if (total === 0) {
    document.getElementById('todayChart').innerHTML =
      `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">No data for today</div></div>`;
    return;
  }

  const svg = document.getElementById('todayPieChart');
  if (!svg) return;
  svg.innerHTML = '';

  const radius = 80;
  const cx = 100, cy = 100;

  const slices = [
    { value: focusTime, color: '#667eea', label: 'Focus' },
    { value: distractionTime, color: '#ff6b6b', label: 'Distracted' }
  ].filter(s => s.value > 0);

  let startAngle = -90; // start from top

  slices.forEach(slice => {
    const angle = (slice.value / total) * 360;
    const endAngle = startAngle + angle;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', svgArc(cx, cy, radius, startAngle, endAngle));
    path.setAttribute('fill', slice.color);
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);

    startAngle = endAngle;
  });

  // Legend
  const legend = document.getElementById('todayLegend');
  legend.innerHTML = slices.map(s => `
        <div class="legend-item">
          <div class="legend-color" style="background:${s.color}"></div>
          <span>${s.label}: ${Utils.formatTimeShort(s.value)} (${Math.round((s.value / total) * 100)}%)</span>
        </div>
    `).join('');
}

function svgArc(cx, cy, r, startDeg, endDeg) {
  // Clamp to avoid full-circle degenerate path
  const clampedEnd = Math.min(endDeg, startDeg + 359.99);
  const s = degToXY(cx, cy, r, startDeg);
  const e = degToXY(cx, cy, r, clampedEnd);
  const large = (clampedEnd - startDeg) > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
}

function degToXY(cx, cy, r, deg) {
  const rad = deg * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// ── Week bar chart ────────────────────────────────────────────────────────────

function drawWeekBarChart(dailyBreakdown) {
  const canvas = document.getElementById('weekBarChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || canvas.width;
  const H = canvas.offsetHeight || canvas.height;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const PADDING = { top: 20, bottom: 40, left: 44, right: 10 };
  const chartW = W - PADDING.left - PADDING.right;
  const chartH = H - PADDING.top - PADDING.bottom;

  const maxFocus = Math.max(...dailyBreakdown.map(d => (d.focusTime || 0) + (d.distractionTime || 0)), 1);
  const barWidth = (chartW / 7) * 0.6;
  const barGap = (chartW / 7) * 0.4;

  // Grid lines
  ctx.strokeStyle = '#e0e4f0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PADDING.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, y);
    ctx.lineTo(W - PADDING.right, y);
    ctx.stroke();

    // Y-axis labels (seconds → minutes/hours)
    const val = maxFocus - (maxFocus / 4) * i;
    ctx.fillStyle = '#999';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Utils.formatTimeShort(Math.round(val)), PADDING.left - 4, y + 4);
  }

  dailyBreakdown.forEach((day, index) => {
    const x = PADDING.left + index * (chartW / 7) + barGap / 2;
    const focusH = ((day.focusTime || 0) / maxFocus) * chartH;
    const distH = ((day.distractionTime || 0) / maxFocus) * chartH;

    // Distraction bar (behind / bottom)
    if (distH > 0) {
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(x, PADDING.top + chartH - distH, barWidth, distH);
    }

    // Focus bar (stacked on top)
    if (focusH > 0) {
      ctx.fillStyle = '#667eea';
      ctx.fillRect(x, PADDING.top + chartH - distH - focusH, barWidth, focusH);
    }

    // Day label
    ctx.fillStyle = '#555';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(DAYS[index], x + barWidth / 2, H - PADDING.bottom + 16);
  });

  // Legend
  const legendHTML = `
        <div style="display:flex;gap:16px;justify-content:center;margin-top:8px;font-size:12px;color:#555;">
            <span><span style="display:inline-block;width:10px;height:10px;background:#667eea;border-radius:2px;margin-right:4px;"></span>Focus</span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#ff6b6b;border-radius:2px;margin-right:4px;"></span>Distracted</span>
        </div>`;

  const chartCard = canvas.closest('.chart-card');
  let legendEl = chartCard && chartCard.querySelector('.week-chart-legend');
  if (!legendEl && chartCard) {
    legendEl = document.createElement('div');
    legendEl.className = 'week-chart-legend';
    chartCard.appendChild(legendEl);
  }
  if (legendEl) legendEl.innerHTML = legendHTML;
}

// ── Top Sites ─────────────────────────────────────────────────────────────────

function loadTopSites(stats) {
  const renderList = (el, entries, emptyMsg) => {
    const sorted = Object.entries(entries || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (sorted.length === 0) {
      el.innerHTML = `<div class="empty-state-text">${emptyMsg}</div>`;
    } else {
      const max = sorted[0][1] || 1;
      el.innerHTML = sorted.map(([domain, time]) => `
                <div class="site-item">
                    <span class="site-name">${domain}</span>
                    <div class="site-bar-wrap">
                        <div class="site-bar" style="width:${Math.round((time / max) * 100)}%"></div>
                    </div>
                    <span class="site-time">${Utils.formatTimeShort(time)}</span>
                </div>
            `).join('');
    }
  };

  renderList(document.getElementById('topStudySites'), stats.topStudySites, 'No study sites yet');
  renderList(document.getElementById('topDistractingSites'), stats.topDistractingSites, 'No distracting sites tracked 🎉');
}

// ── Sessions Tab ──────────────────────────────────────────────────────────────

async function loadSessions() {
  try {
    const filter = document.getElementById('sessionFilter').value;
    const allSessions = await chrome.runtime.sendMessage({ action: 'getSessionHistory', limit: 50 });
    const now = Date.now();

    // Filter (use slice to avoid mutating original)
    let sessions = (allSessions || []).slice();
    if (filter === 'today') {
      const startOfDay = new Date().setHours(0, 0, 0, 0);
      sessions = sessions.filter(s => (s.completedAt || s.startTime) >= startOfDay);
    } else if (filter === 'week') {
      sessions = sessions.filter(s => (s.completedAt || s.startTime) >= now - 7 * 86400000);
    } else if (filter === 'month') {
      sessions = sessions.filter(s => (s.completedAt || s.startTime) >= now - 30 * 86400000);
    }

    const sessionsList = document.getElementById('sessionsList');

    if (sessions.length === 0) {
      sessionsList.innerHTML =
        `<div class="empty-state"><div class="empty-state-icon">📚</div><div class="empty-state-text">No sessions found</div></div>`;
      return;
    }

    // Most recent first (use slice to avoid mutating)
    sessionsList.innerHTML = sessions.slice().reverse().map(session => {
      const totalTime = (session.focusTime || 0) + (session.distractionTime || 0);
      const focusPercentage = totalTime > 0
        ? Math.round((session.focusTime / totalTime) * 100) : 0;
      const bar = `<div class="session-focus-bar"><div class="session-focus-fill" style="width:${focusPercentage}%"></div></div>`;

      return `
                <div class="session-item">
                    <div class="session-header">
                        <span class="session-date">${Utils.formatDate(session.completedAt || session.startTime)}</span>
                        <span class="session-duration">${Utils.formatTimeShort(totalTime)}</span>
                    </div>
                    ${bar}
                    <div class="session-stats">
                        <div class="session-stat">
                            <div class="session-stat-value" style="color:${focusPercentage >= 70 ? '#48bb78' : focusPercentage >= 40 ? '#ed8936' : '#fc8181'}">${focusPercentage}%</div>
                            <div class="session-stat-label">Focus</div>
                        </div>
                        <div class="session-stat">
                            <div class="session-stat-value">${Utils.formatTimeShort(session.focusTime || 0)}</div>
                            <div class="session-stat-label">Study Time</div>
                        </div>
                        <div class="session-stat">
                            <div class="session-stat-value">${Utils.formatTimeShort(session.distractionTime || 0)}</div>
                            <div class="session-stat-label">Distracted</div>
                        </div>
                    </div>
                </div>`;
    }).join('');

  } catch (error) {
    console.error('Error loading sessions:', error);
    document.getElementById('sessionsList').innerHTML =
      `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Could not load sessions</div></div>`;
  }
}

// ── Weekly Report ─────────────────────────────────────────────────────────────

async function loadWeeklyReport() {
  try {
    const report = await chrome.runtime.sendMessage({
      action: 'getWeeklyReport',
      weekStart: currentWeekStart.getTime()
    });

    // Week range header
    const weekStart = new Date(report.weekStart);
    const weekEnd = new Date(report.weekEnd);
    document.getElementById('weekRange').textContent =
      `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ` +
      `${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const reportEl = document.getElementById('weeklyReport');

    if (report.noData) {
      reportEl.innerHTML =
        `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">No data for this week</div></div>`;
      return;
    }

    // Summary cards
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
            </div>`;

    // Daily breakdown cards
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayDay = new Date().getDay();
    const dailyHTML = `
            <div class="daily-breakdown">
                ${(report.dailyBreakdown || []).map((day, i) => {
      const isToday = i === todayDay;
      return `
                    <div class="day-card${isToday ? ' today' : ''}">
                        <div class="day-name">${DAYS[i]}</div>
                        <div class="day-focus">${Utils.formatTimeShort(day.focusTime || 0)}</div>
                        <div class="stat-label">${day.sessions} session${day.sessions !== 1 ? 's' : ''}</div>
                    </div>`;
    }).join('')}
            </div>`;

    reportEl.innerHTML = summaryHTML + dailyHTML;

    // Draw canvas bar chart after DOM is populated
    requestAnimationFrame(() => drawWeekBarChart(report.dailyBreakdown || []));

  } catch (error) {
    console.error('Error loading weekly report:', error);
    document.getElementById('weeklyReport').innerHTML =
      `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Could not load weekly report</div></div>`;
  }
}

// ── Week navigation ───────────────────────────────────────────────────────────

function changeWeek(direction) {
  currentWeekStart = new Date(currentWeekStart.getTime() + direction * 7 * 86400000);
  loadWeeklyReport();
}

function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Insights ──────────────────────────────────────────────────────────────────

async function loadInsights() {
  const insightsList = document.getElementById('insightsList');
  try {
    const report = await chrome.runtime.sendMessage({
      action: 'getWeeklyReport',
      weekStart: currentWeekStart.getTime()
    });

    if (report.noData || !report.insights || report.insights.length === 0) {
      insightsList.innerHTML =
        `<div class="empty-state"><div class="empty-state-icon">💡</div><div class="empty-state-text">Not enough data for insights yet.<br>Complete a few sessions first!</div></div>`;
      return;
    }

    const iconMap = { positive: '🌟', warning: '⚠️', suggestion: '💡' };
    insightsList.innerHTML = report.insights.map(insight => `
            <div class="insight-card ${insight.type}">
                <div class="insight-icon">${iconMap[insight.type] || '💡'}</div>
                <div class="insight-message">${insight.message}</div>
            </div>`).join('');

  } catch (error) {
    console.error('Error loading insights:', error);
    insightsList.innerHTML =
      `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Could not load insights</div></div>`;
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

async function exportData() {
  try {
    const format = confirm('Export as JSON? (Cancel for CSV)') ? 'json' : 'csv';
    const data = await chrome.runtime.sendMessage({ action: 'exportData', format });

    const filename = `study-monitor-export-${new Date().toISOString().split('T')[0]}.${format}`;

    if (format === 'json') {
      // data is an object — export as JSON
      Utils.exportAsJSON(data, filename);
    } else {
      // data is already a CSV string returned by analytics.convertToCSV
      const blob = new Blob([data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    }
    alert('Data exported successfully! ✅');
  } catch (error) {
    console.error('Error exporting data:', error);
    alert('Failed to export data. Please try again.');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatHours(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="empty-state-text" style="color:#e53e3e;">${msg}</div>`;
}
