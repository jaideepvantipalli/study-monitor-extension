# 🎯 Study Monitor - Browser Extension

A powerful, AI-powered browser extension that helps students stay focused during study sessions by monitoring browsing activity, classifying content, and providing intelligent insights.

## ✨ Features

### 📊 **Session Tracking**
- Start/stop/pause study sessions with one click
- Real-time tracking of focus vs distraction time
- Automatic website categorization (educational/distracting/neutral)

### 🤖 **ML-Based Content Classification**
- Intelligent website categorization using keyword analysis
- Special YouTube content analysis (educational vs entertainment)
- Customizable whitelist/blacklist for personalized classification

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

2. **Load in Chrome/Edge**
   - Open Chrome/Edge and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `study-monitor-extension` folder

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

### Managing Website Classification

The extension automatically classifies websites, but you can customize:

- **Whitelist**: Sites always marked as educational
- **Blacklist**: Sites always marked as distracting
- Edit in settings or through the classification system

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
The extension uses a hybrid ML approach:
- **Keyword Analysis**: Matches page content against educational/distracting keywords
- **Domain Reputation**: Pre-categorized database of popular websites
- **YouTube Analysis**: Special handling for video content using titles, descriptions, and tags
- **Confidence Scoring**: Each classification includes a confidence score

### Analytics Engine
Generates comprehensive insights:
- **Focus Percentage**: Ratio of study time to total time
- **Productivity Trends**: Week-over-week improvements
- **Behavior Patterns**: Most productive days and times
- **Distraction Analysis**: Top time-wasting sites

## 📁 Project Structure

```
study-monitor-extension/
├── manifest.json           # Extension configuration
├── background.js          # Service worker (main controller)
├── content-script.js      # Page content extraction
├── utils.js              # Shared utilities
├── classifier.js         # ML classification engine
├── storage.js            # Data persistence layer
├── alerts.js             # Notification manager
├── analytics.js          # Analytics engine
├── popup/                # Extension popup
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── dashboard/            # Analytics dashboard
│   ├── dashboard.html
│   ├── dashboard.css
│   └── dashboard.js
├── settings/             # Settings page
│   ├── settings.html
│   ├── settings.css
│   └── settings.js
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── data/                 # Classification data
    ├── categories.json   # Website categories
    └── keywords.json     # Classification keywords
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
- Check that the extension has necessary permissions
- Reload the extension from chrome://extensions/

### Classifications seem wrong?
- Add sites to whitelist/blacklist in settings
- The ML model improves with more data
- YouTube classification requires page to fully load

### Notifications not showing?
- Check browser notification permissions
- Enable notifications in extension settings
- Check system notification settings

## 📧 Support

For issues or questions, please check the troubleshooting section or create an issue in the repository.

---

**Happy Studying! 🎯📚**
