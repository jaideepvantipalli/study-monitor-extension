# 🎯 Study Monitor - Browser Extension

A powerful, AI-powered browser extension that helps students stay focused during study sessions by monitoring browsing activity, classifying website content, and providing intelligent productivity insights.

---

## ✨ Features

### 📊 **Session Tracking**
- Start / stop / pause study sessions with one click
- Real-time tracking of focus vs. distraction vs. neutral time
- Automatic website categorization (educational / distracting / neutral)
- Session completion summaries with focus statistics

### 🤖 **ML-Powered Classification**
- Intelligent website categorization using a local **LinearSVC + TF-IDF** model
- Strictly domain-based classification trained on custom datasets (Colab)
- **Two-tier classification cache** (in-memory + persistent storage) with a **24-hour TTL** — drastically reduces redundant API calls
- Auto-invalidates cache entries when whitelist/blacklist changes
- Automatic ML server health checks and background retry every 30 s
- Hybrid fallback to keyword-based analysis when the ML server is offline

### 🛡️ **Whitelist & Blacklist System**
- Add any domain to the **Whitelist (Always Allowed)** — always treated as educational, bypassing the AI classifier
- Add any domain to the **Blacklist (Always Blocked)** — always treated as distracting, regardless of AI output
- **Subdomain support**: rules on a parent domain (e.g. `google.com`) automatically apply to subdomains (e.g. `docs.google.com`)
- Rules take **highest priority** — always override ML predictions
- **Instant sync**: changes take effect across all active tabs without restarting the extension

### 🔔 **Smart Alerts & Reminders**
- Gentle distraction alerts when visiting non-study sites
- Break reminders for healthy study habits (Pomodoro-style)
- Session completion summaries with focus statistics

### 🚫 **Website Blocking**
- Automatic temporary blocking of distracting sites once a configurable threshold is exceeded
- **Cross-tab distraction accumulation**: time spent on a distracting site is tracked globally across all open tabs — switching tabs does not reset the timer
- Block state persists across service-worker restarts (stored in `chrome.storage.local`)
- Dedicated **blocked page** with a live countdown timer; auto-redirects to a new tab when the block expires
- "Go Back" button intentionally removed to prevent bypass
- Configurable blocking threshold and block duration

### 📈 **Comprehensive Analytics**
- Daily session summaries with focus percentages
- Weekly reports showing study patterns and trends
- Top study sites and top distracting sites
- Streak tracking and productivity insights

### 💾 **Data Management**
- All data stored locally (**privacy-first** — nothing leaves your device)
- Export data in **JSON** or **CSV** format
- Configurable data retention period (auto-clean old sessions)
- Complete data control — import or wipe at any time

---

## 🚀 Installation

### Chrome / Edge (Manifest V3)

1. **Download the Extension**
   - Clone or download this repository
   - Extract to a folder on your computer

2. **Setup ML Backend**
   - Ensure **Python 3.x** is installed
   - Install dependencies:
     ```bash
     pip install -r backend/requirements.txt
     ```
   - Start the server:
     ```bash
     python backend/model_server.py
     ```
     *(Or double-click `backend/start_model_server.bat` on Windows)*
   - Keep the server running while using the extension

3. **Load in Chrome / Edge**
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in the top-right corner)
   - Click **Load unpacked**
   - Select the `extension/` folder

4. **Start Using**
   - Click the extension icon in your toolbar
   - Click **Start Session** to begin tracking
   - Access **Dashboard** for detailed analytics

---

## 📖 How to Use

### Starting a Study Session

1. Click the Study Monitor icon in your browser toolbar
2. Click **Start Session**
3. Browse normally — the extension classifies every site you visit
4. View real-time focus/distraction stats in the popup

### Viewing Analytics

1. Click **Dashboard** in the popup
2. Explore the tabs:
   - **Overview**: Today's activity and top sites
   - **Sessions**: Complete session history
   - **Weekly Report**: 7-day breakdown and trends
   - **Insights**: AI-generated recommendations

### Customizing Settings

1. Click the settings icon (⚙️) in the popup or dashboard
2. Configure:
   - Session duration and break intervals
   - Alert sensitivity and frequency
   - Website blocking thresholds and durations
   - Notification preferences
   - Data retention period

### 🛡️ Managing Website Classification

Navigate to **Settings → Customization** to manage your personal rules:

| Rule | Behavior |
|------|----------|
| **Whitelist** (Always Allowed) | Domain always treated as **educational** — never blocked |
| **Blacklist** (Always Blocked) | Domain always treated as **distracting** — always triggers alerts/blocking |

- Subdomain support is built-in (e.g. whitelisting `google.com` covers `docs.google.com`)
- Custom rules **always override** the ML model
- Changes sync instantly across all active tabs

---

## ⚙️ Configuration Options

### Session Settings
| Option | Default | Range |
|--------|---------|-------|
| Session Duration | 25 min | 1–180 min |
| Break Duration | 5 min | 1–60 min |
| Long Break Duration | 15 min | 1–60 min |
| Sessions Before Long Break | 4 | — |

### Alert Settings
| Option | Default | Range |
|--------|---------|-------|
| Distraction Alerts | Enabled | — |
| Alert Delay | 10 s | 5–300 s |
| Alert Frequency | 60 s | 30–600 s |

### Blocking Settings
| Option | Default | Range |
|--------|---------|-------|
| Auto-Blocking | Disabled | — |
| Blocking Threshold | 5 min | 1–60 min |
| Block Duration | 10 min | 1–120 min |

### Notification Settings
- Enable/disable all notifications
- Enable/disable notification sounds

---

## 🎨 Feature Deep-Dives

### Content Classification Engine

The extension uses a multi-layer classification pipeline:

```
URL received
    │
    ├── 1. User Custom Rules (whitelist / blacklist) ──▶ Instant override
    │
    ├── 2. In-Memory Cache (24-hour TTL, max 500 entries)
    │       └── Cache miss?
    │
    ├── 3. SmartFocus ML Model (FastAPI backend, LinearSVC + TF-IDF)
    │       └── Result stored in cache (in-memory + chrome.storage.local)
    │
    ├── 4. Predefined Domain Lists (categories.json)
    │
    ├── 5. YouTube-Specific Content Analysis
    │
    └── 6. Keyword-Based Fallback Analysis
```

**Label Mapping:**

| Code | Label | Behaviour |
|------|-------|-----------|
| `0` 🎓 | **Educational** | Tracked as focus time |
| `1` 🎮 | **Distracting** | Triggers alerts and potential blocking |
| `2` ⚪ | **Neutral** | Tracked as general activity |

### Two-Tier ML Classification Cache

To avoid hammering the local ML server on every page visit, the Classifier maintains a **two-tier cache**:

| Tier | Storage | Capacity | TTL |
|------|---------|----------|-----|
| In-Memory (`Map`) | Service worker RAM | 500 entries (LRU eviction) | 24 hours |
| Persistent | `chrome.storage.local` | Same | 24 hours |

- **On cache hit**: returns instantly without a network call
- **On service-worker restart**: cache is restored from storage (only non-expired entries)
- **On whitelist/blacklist change**: affected domain entries are automatically invalidated
- Entries older than 24 hours are silently pruned on access

### Cross-Tab Distraction Accumulation

Distraction time for each domain is accumulated globally across all tabs using the `distractionAccumulator` Map:

- Switching tabs does **not** reset the distraction timer for a domain
- The accumulated time persists across service-worker restarts (written to `chrome.storage.local`)
- Blocking triggers once the **cumulative** time exceeds the configured threshold, regardless of how many tabs were used

### Analytics Engine

- **Focus Percentage**: ratio of study time to total tracked time
- **Productivity Trends**: week-over-week improvements
- **Behavior Patterns**: most productive days and times
- **Distraction Analysis**: top time-wasting sites
- **Streak Tracking**: consecutive study days

---

## 📁 Project Structure

```
study-monitor-extension/
├── backend/                    # Machine Learning Backend (FastAPI)
│   ├── model_server.py         # FastAPI ML server (LinearSVC + TF-IDF)
│   ├── website_model.pkl       # Trained LinearSVC model
│   ├── vectorizer.pkl          # TF-IDF vectorizer
│   ├── start_model_server.bat  # Windows convenience launcher
│   └── requirements.txt        # Python dependencies
├── extension/                  # Chrome Extension (Manifest V3)
│   ├── manifest.json           # Extension manifest
│   ├── background.js           # Service worker (event-driven controller)
│   ├── classifier.js           # ML classification engine + 2-tier cache
│   ├── storage.js              # Data persistence & session management
│   ├── alerts.js               # Notification & alert manager
│   ├── analytics.js            # Reporting & insights engine
│   ├── content-script.js       # Page metadata extraction
│   ├── utils.js                # Shared utility helpers
│   ├── blocked.html            # Blocked-site redirect page
│   ├── blocked.js              # Blocked-page countdown logic
│   ├── dashboard/              # Analytics dashboard UI
│   ├── popup/                  # Extension popup UI
│   ├── settings/               # Settings & customization page
│   ├── icons/                  # Extension icons
│   └── data/                   # Fallback classification data (JSON)
└── README.md                   # Project documentation
```

---

## 🔒 Privacy

- **All data stored locally** in your browser via `chrome.storage.local`
- **No external servers** — the only network request is to `127.0.0.1:5000` (your own machine)
- **No tracking** — your browsing history stays private
- **Full control** — export or delete your data at any time

---

## 🛠️ Technical Details

| Item | Detail |
|------|--------|
| Manifest Version | V3 (latest Chrome extension standard) |
| ML Backend | FastAPI (Python), LinearSVC + TF-IDF |
| Cache TTL | 24 hours (in-memory + persistent) |
| Cache Max Size | 500 domains (LRU eviction) |
| ML Retry Interval | 30 seconds when server is offline |
| Blocking Persistence | `chrome.storage.local` (survives SW restarts) |
| Permissions | `tabs`, `storage`, `alarms`, `notifications`, `webNavigation` |
| Browser Support | Chrome, Edge (Chromium-based) |
| Architecture | Event-driven service worker |

---

## 📊 Data Export

Export your study data for external analysis:
- **JSON Format**: Complete data structure with all metadata
- **CSV Format**: Simplified format for spreadsheet analysis
- Includes: session history, statistics, site visits, and more

---

## 🐛 Troubleshooting

### Extension not tracking?
- Make sure you've started a session (click **Start Session**)
- Ensure the SmartFocus ML server is running (`python backend/model_server.py`)
- Check that the extension has the required permissions
- Reload the extension from `chrome://extensions/`

### Classifications seem wrong?
- Verify `website_model.pkl` and `vectorizer.pkl` are in the `backend/` folder
- Add sites to the **whitelist / blacklist** in Settings to override the AI immediately
- If the ML server was recently updated, clear the ML cache via **Settings → Clear ML Cache**
- The ML model specialises in domain-based categorisation; page content is used only as a tiebreaker

### Blocking not triggering?
- Confirm **Auto-Blocking** is enabled in Settings
- Remember: blocking uses **cumulative time across all tabs**, not just the current tab
- Check that the distracting site isn't accidentally on the **whitelist**

### Notifications not showing?
- Check browser notification permissions (`chrome://settings/content/notifications`)
- Enable notifications in extension settings
- Check your OS system notification settings

### ML server offline?
- The extension will automatically retry every 30 seconds
- In the meantime, classification falls back to keyword and domain-list analysis
- Watch for the ML status indicator in the popup

---

## 🤝 Contributing

This is a student final-year project. Suggestions and improvements are welcome!

---

## 📝 License

MIT License — feel free to use and modify for your needs.

---

## 🎓 About

Created as a final-year project to help students improve their online study habits and productivity. The extension combines machine learning, behavioural psychology, and modern productivity techniques (Pomodoro, website blocking, streak tracking) to create a comprehensive, privacy-first study monitoring solution.

---

**Happy Studying! 🎯📚**
