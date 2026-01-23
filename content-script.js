// Content Script
// Injected into web pages to extract content and metadata

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getPageData') {
        const pageData = extractPageData();
        sendResponse(pageData);
    }
    return true;
});

// Extract page data for classification
function extractPageData() {
    const data = {
        title: document.title || '',
        description: '',
        content: '',
        tags: []
    };

    // Get meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
        data.description = metaDescription.getAttribute('content') || '';
    }

    // Get Open Graph description
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription && !data.description) {
        data.description = ogDescription.getAttribute('content') || '';
    }

    // Extract keywords
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
        const keywords = metaKeywords.getAttribute('content') || '';
        data.tags = keywords.split(',').map(k => k.trim()).filter(k => k);
    }

    // For YouTube, extract video-specific data
    if (window.location.hostname.includes('youtube.com')) {
        data.youtube = extractYouTubeData();
    }

    // Extract main content (first 500 characters)
    const mainContent = document.querySelector('main, article, .content, #content');
    if (mainContent) {
        data.content = mainContent.innerText.substring(0, 500);
    } else {
        // Fallback to body text
        data.content = document.body.innerText.substring(0, 500);
    }

    return data;
}

// Extract YouTube-specific data
function extractYouTubeData() {
    const youtubeData = {
        title: '',
        description: '',
        tags: [],
        category: ''
    };

    // Get video title
    const titleElement = document.querySelector('h1.title, h1.ytd-video-primary-info-renderer');
    if (titleElement) {
        youtubeData.title = titleElement.innerText || '';
    }

    // Get video description
    const descriptionElement = document.querySelector('#description, .description');
    if (descriptionElement) {
        youtubeData.description = descriptionElement.innerText.substring(0, 500) || '';
    }

    // Get video tags from meta
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
        const keywords = metaKeywords.getAttribute('content') || '';
        youtubeData.tags = keywords.split(',').map(k => k.trim()).filter(k => k);
    }

    // Try to get category from page data
    try {
        const ytInitialData = window.ytInitialData;
        if (ytInitialData) {
            // Extract category if available in the data
            const videoDetails = ytInitialData.contents?.twoColumnWatchNextResults?.results?.results?.contents;
            if (videoDetails) {
                // Category extraction logic here
                // This is a simplified version
            }
        }
    } catch (e) {
        console.log('Could not extract YouTube data:', e);
    }

    return youtubeData;
}

// Show in-page alert (optional feature)
function showInPageAlert(message) {
    // Create alert element
    const alertDiv = document.createElement('div');
    alertDiv.id = 'study-monitor-alert';
    alertDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    max-width: 300px;
    animation: slideIn 0.3s ease-out;
  `;
    alertDiv.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="font-size: 24px;">🎯</span>
      <div>
        <div style="font-weight: 600; margin-bottom: 4px;">Stay Focused!</div>
        <div style="opacity: 0.9; font-size: 13px;">${message}</div>
      </div>
      <button id="study-monitor-close" style="
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
      ">×</button>
    </div>
  `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
    document.head.appendChild(style);

    document.body.appendChild(alertDiv);

    // Close button handler
    document.getElementById('study-monitor-close').addEventListener('click', () => {
        alertDiv.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => alertDiv.remove(), 300);
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentElement) {
            alertDiv.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => alertDiv.remove(), 300);
        }
    }, 5000);
}

// Listen for custom events from background (if needed)
window.addEventListener('study-monitor-alert', (event) => {
    showInPageAlert(event.detail.message);
});
