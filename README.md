# 🎯 Study Monitor - Browser Extension

A powerful, AI-powered browser extension that helps students stay focused during study sessions by monitoring browsing activity, classifying content, and providing intelligent insights.

## ✨ Features

### 📊 **Session Tracking**
- Start/stop/pause study sessions with one click
- Real-time tracking of focus vs distraction time
- Automatic website categorization (educational/distracting/neutral)

### 🤖 **ML-Powered Classification**
- Intelligent website categorization using a local **LinearSVC + TF-IDF** model.
- Strictly domain-based classification trained on custom datasets from Colab.
- Customizable whitelist/blacklist for personalized classification.

### 🔔 **Smart Alerts & Reminders**
- Gentle distraction alerts when visiting non-study sites
- Break reminders for healthy study habits (Pomodoro-style)
- Session completion summaries with focus statistics

### 🚫 **Website Blocking**
- Automatic temporary blocking of distracting sites
- Configurable thresholds and block durations
- Helps maintain focus during critical study periods

### 📈 **Comprehensive Analytics**
- Daily session summaries with focus percentages
- Weekly reports showing study patterns
- Top study sites and top distracting sites
- Streak tracking and productivity insights

### 💾 **Data Management**
- Local data storage (privacy-first)
- Export data in JSON or CSV format
- Configurable data retention period
- Complete data control

## 🚀 Installation

### Chrome/Edge (Manifest V3)

1. **Download the Extension**
   - Clone or download this repository
   - Extract to a folder on your computer

2. **Setup ML Backend**
   - Ensure Python 3.x is installed.
   - Install dependencies: `pip install -r backend/requirements.txt`
   - Run the server: `python backend/model_server.py`
   - Keep the server running while using the extension.

3. **Load in Chrome/Edge**
   - Open Chrome/Edge and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `extension/` folder

3. **Start Using**
   - Click the extension icon in your toolbar
   - Click "Start Session" to begin tracking
   - Access Dashboard for detailed analytics

## 📖 How to Use

### Starting a Study Session

1. Click the Study Monitor icon in your browser toolbar
2. Click "Start Session"
3. Browse normally - the extension will track your activity
4. View real-time stats in the popup

### Viewing Analytics

1. Click "Dashboard" in the popup
2. Explore different tabs:
   - **Overview**: Today's activity and top sites
   - **Sessions**: Complete session history
   - **Weekly Report**: 7-day breakdown and trends
   - **Insights**: AI-generated recommendations

### Customizing Settings

1. Click the settings icon (⚙️) in popup or dashboard
2. Configure:
   - Session duration and break intervals
   - Alert sensitivity and frequency
   - Website blocking thresholds
   - Notification preferences
   - Data retention period

### 🛡️ Managing Website Classification

While the extension uses a high-performance ML model to automatically classify websites, you have full control over the process via the **Customization** page (Settings):

- **Whitelist (Always Allowed)**: Specific domains (e.g., `stackoverflow.com`) will always be treated as **educational**, bypassing the AI classifier. This ensures your essential study tools are never blocked.
- **Blacklist (Always Blocked)**: Specific domains (e.g., `facebook.com`) will always be treated as **distracting**, regardless of content analysis.
- **Subdomain Support**: Whitelisting or blacklisting a parent domain (e.g., `google.com`) automatically applies the same rule to its subdomains (e.g., `docs.google.com`), providing robust and convenient control.
- **Instant Sync**: Changes take effect immediately across all active tabs without needing to restart the extension.

## ⚙️ Configuration Options

### Session Settings
- **Session Duration**: Default study session length (1-180 minutes)
- **Break Duration**: Short break length (1-60 minutes)
- **Long Break Duration**: Extended break length (1-60 minutes)

### Alert Settings
- **Distraction Alerts**: Enable/disable alerts for distracting sites
- **Alert Delay**: Time on distracting site before alert (5-300 seconds)
- **Alert Frequency**: Time between repeated alerts (30-600 seconds)

### Blocking Settings
- **Auto-Blocking**: Enable/disable automatic website blocking
- **Blocking Threshold**: Time on distracting site before blocking (1-60 minutes)
- **Block Duration**: How long sites remain blocked (1-120 minutes)

### Notification Settings
- **Notifications**: Enable/disable all notifications
- **Sound**: Enable/disable notification sounds

## 🎨 Features Breakdown

### Content Classification Engine
The extension uses a high-performance ML model:
- **ML Backend (FastAPI)**: Processes URLs in real-time using a LinearSVC model.
- **Domain Preprocessing**: Strictly cleans and tokenizes domains for accurate prediction.
- **Label Mapping**:
    - `0` 🎓 **Educational**: Tracked as focus time.
    - `1` 🎮 **Distracting**: Triggers alerts/blocking.
    - `2` ⚪ **Neutral**: Tracks general activity.
- **Hybrid Fallback**: Uses keyword analysis if the ML server is offline.

### Analytics Engine
Generates comprehensive insights:
- **Focus Percentage**: Ratio of study time to total time
- **Productivity Trends**: Week-over-week improvements
- **Behavior Patterns**: Most productive days and times
- **Distraction Analysis**: Top time-wasting sites

## 📁 Project Structure

```
study-monitor-extension/
├── backend/               # Machine Learning Backend (FastAPI)
│   ├── model_server.py    # Python FastAPI ML server
│   ├── website_model.pkl  # Trained LinearSVC model
│   ├── vectorizer.pkl     # TF-IDF Vectorizer
│   └── requirements.txt   # Python dependencies
├── extension/             # Chrome Extension
│   ├── manifest.json      # Extension configuration
│   ├── background.js     # Service worker
│   ├── content-script.js # Page content extraction
│   ├── classifier.js    # ML classification engine
│   ├── storage.js       # Data persistence
│   ├── dashboard/       # Analytics dashboard
│   ├── popup/           # Extension popup
│   ├── settings/        # Settings page
│   ├── icons/           # Extension icons
│   └── data/            # Fallback data
└── README.md              # Project documentation
```

## 🔒 Privacy

- **All data stored locally** in your browser
- **No external servers** - no data leaves your device
- **No tracking** - your browsing history stays private
- **Full control** - export or delete your data anytime

## 🛠️ Technical Details

- **Manifest Version**: V3 (latest Chrome extension standard)
- **Permissions**: tabs, storage, alarms, notifications, webNavigation
- **Browser Support**: Chrome, Edge (Chromium-based browsers)
- **Storage**: Chrome Local Storage API
- **Architecture**: Event-driven service worker

## 📊 Data Export

Export your study data for external analysis:
- **JSON Format**: Complete data structure with all metadata
- **CSV Format**: Simplified format for spreadsheet analysis
- Includes: session history, statistics, site visits, and more

## 🤝 Contributing

This is a student project. Suggestions and improvements are welcome!

## 📝 License

MIT License - Feel free to use and modify for your needs.

## 🎓 About

Created as a final year project to help students improve their online study habits and productivity. The extension combines machine learning, behavioral psychology, and productivity techniques to create a comprehensive study monitoring solution.

## 🐛 Troubleshooting

### Extension not tracking?
- Make sure you've started a session (click "Start Session")
- Ensure the ML server is running (`python model_server.py`)
- Check that the extension has necessary permissions
- Reload the extension from chrome://extensions/

### Classifications seem wrong?
- Ensure the latest `website_model.pkl` and `vectorizer.pkl` are in the project root.
- Add sites to whitelist/blacklist in settings to override AI.
- The ML model specializes in domain-based categorization.

### Notifications not showing?
- Check browser notification permissions
- Enable notifications in extension settings
- Check system notification settings

## 📧 Support

For issues or questions, please check the troubleshooting section or create an issue in the repository.

---

**Happy Studying! 🎯📚**
