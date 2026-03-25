// blocked.js — handles the blocked page UI (must be external for MV3 CSP)

const params = new URLSearchParams(window.location.search);
const domain = params.get('domain') || 'this site';
const unblockAt = parseInt(params.get('unblockAt'), 10) || (Date.now() + 600000);

document.getElementById('domainBadge').textContent = domain;

function formatTime(ms) {
    if (ms <= 0) return '00:00';
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function updateCountdown() {
    const remaining = unblockAt - Date.now();
    if (remaining <= 0) {
        document.getElementById('countdown').textContent = '00:00';
        // Block expired — navigate to new tab so user can continue freely
        setTimeout(() => {
            window.location.href = 'chrome://newtab';
        }, 1500);
        return;
    }
    document.getElementById('countdown').textContent = formatTime(remaining);
}

updateCountdown();
setInterval(updateCountdown, 1000);

// Wire up buttons via addEventListener (inline onclick= violates MV3 CSP)
document.getElementById('goBackBtn').addEventListener('click', () => {
    window.location.href = 'chrome://newtab';
});

document.getElementById('dashboardBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openDashboard' });
});
