function getTodayKey() {
  const today = new Date().toISOString().split("T")[0];
  return `usage_${today}`;
}

async function fetchTranscript(url) {
  try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const res = await fetch(url, {
          signal: controller.signal,
          headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const text = await res.text();
      
      // Handle different response formats
      if (text.startsWith('<?xml')) {
          return parseXMLTranscript(text);
      } else if (text.startsWith('{') || text.startsWith('[')) {
          return parseJSONTranscript(text);
      } else {
          return parseTextTranscript(text);
      }
      
  } catch (error) {
      console.error("Transcript fetch failed:", error);
      
      if (error.name === 'AbortError') {
          throw new Error('Transcript fetch timed out');
      }
      
      throw error;
  }
}

function parseXMLTranscript(text) {
  try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, "text/xml");
      
      // Handle different XML structures
      let textElements;
      if (xml.querySelector('text')) {
          textElements = xml.querySelectorAll('text');
      } else if (xml.querySelector('body p')) {
          textElements = xml.querySelectorAll('body p');
      } else {
          textElements = Array.from(xml.getElementsByTagName('*')).filter(
              el => el.textContent?.trim() && !el.children.length
          );
      }
      
      let transcript = '';
      for (let element of textElements) {
          const textContent = element.textContent?.trim();
          if (textContent) {
              transcript += textContent + ' ';
          }
      }
      
      return transcript.trim();
  } catch (error) {
      console.warn("XML parsing failed:", error);
      return text; // Fallback to raw text
  }
}

function parseJSONTranscript(text) {
  try {
      const json = JSON.parse(text);
      
      if (json.events) {
          return json.events.map(e => 
              e.segs?.map(seg => seg.utf8).join('') || ''
          ).join(' ').trim();
      }
      
      if (json.transcript) {
          return json.transcript;
      }
      
      return JSON.stringify(json); // Fallback
      
  } catch (error) {
      console.warn("JSON transcript parsing failed:", error);
      return text;
  }
}

function parseTextTranscript(text) {
  return text
      .replace(/(\d{2}:)?\d{2}:\d{2}\.\d{3} --> (\d{2}:)?\d{2}:\d{2}\.\d{3}/g, '')
      .replace(/\d+\n/g, '')
      .replace(/\n{2,}/g, '\n')
      .replace(/^\s*\n/gm, '')
      .trim();
}

async function trackUsage() {
  return new Promise((resolve) => {
      const todayKey = getTodayKey();
      
      chrome.storage.local.get([todayKey, "isPro", "proExpiryDate"], (result) => {
          const count = result[todayKey] || 0;
          const isPro = result.isPro || false;
          const proExpiryDate = result.proExpiryDate;
          
          // Check if Pro subscription is still valid
          if (isPro && proExpiryDate) {
              const expiryDate = new Date(proExpiryDate);
              const now = new Date();
              
              if (now > expiryDate) {
                  // Pro subscription expired
                  chrome.storage.local.set({ isPro: false, proExpiryDate: null });
                  resolve({ 
                      allowed: count < 3, 
                      remaining: Math.max(0, 3 - count - 1),
                      isPro: false,
                      message: 'Pro subscription expired'
                  });
                  return;
              }
          }
          
          if (isPro) {
              resolve({ 
                  allowed: true, 
                  remaining: -1, // Unlimited
                  isPro: true 
              });
          } else if (count < 3) {
              chrome.storage.local.set({ [todayKey]: count + 1 });
              resolve({ 
                  allowed: true, 
                  remaining: Math.max(0, 3 - count - 1),
                  isPro: false 
              });
          } else {
              resolve({ 
                  allowed: false, 
                  remaining: 0,
                  isPro: false,
                  message: 'Daily limit reached'
              });
          }
      });
  });
}

// Cleanup old usage data
async function cleanupOldUsageData() {
  try {
      const result = await chrome.storage.local.get(null);
      const keysToRemove = [];
      const currentDate = new Date();
      const thirtyDaysAgo = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      for (const key in result) {
          if (key.startsWith('usage_')) {
              const dateStr = key.replace('usage_', '');
              const date = new Date(dateStr);
              
              if (date < thirtyDaysAgo) {
                  keysToRemove.push(key);
              }
          }
      }
      
      if (keysToRemove.length > 0) {
          await chrome.storage.local.remove(keysToRemove);
          console.log(`Cleaned up ${keysToRemove.length} old usage records`);
      }
  } catch (error) {
      console.error('Error cleaning up old usage data:', error);
  }
}

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'generate_summary') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs[0];
          if (tab.url.includes('youtube.com')) {
              // Open popup or trigger summary generation
              chrome.action.openPopup();
          }
      });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "fetchTranscript") {
      fetchTranscript(msg.url)
          .then(transcript => {
              sendResponse({ 
                  transcript,
                  success: true,
                  wordCount: transcript.split(/\s+/).length
              });
          })
          .catch(error => {
              sendResponse({ 
                  transcript: null,
                  success: false,
                  error: error.message
              });
          });
      return true; // Keep channel open
  }
  
  if (msg.action === "trackUsage") {
      trackUsage().then(result => {
          sendResponse(result);
      });
      return true;
  }
  
  if (msg.action === "openPayment") {
      openPaymentPage();
      sendResponse({ success: true });
      return true;
  }
  
  if (msg.action === "paymentSuccess") {
      handlePaymentSuccess(msg.paymentId)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
  }
  
  if (msg.action === "getStorageInfo") {
      getStorageInfo()
          .then(info => sendResponse(info))
          .catch(error => sendResponse({ error: error.message }));
      return true;
  }
  
  if (msg.action === "exportData") {
      exportUserData()
          .then(data => sendResponse(data))
          .catch(error => sendResponse({ error: error.message }));
      return true;
  }
});

// Payment handling
async function openPaymentPage() {
  try {
      // Create or focus payment tab
      const paymentUrl = chrome.runtime.getURL('payment.html');
      
      const tabs = await chrome.tabs.query({});
      const existingTab = tabs.find(tab => tab.url?.includes('payment.html'));
      
      if (existingTab) {
          await chrome.tabs.update(existingTab.id, { active: true });
          await chrome.windows.update(existingTab.windowId, { focused: true });
      } else {
          await chrome.tabs.create({ url: paymentUrl });
      }
  } catch (error) {
      console.error('Error opening payment page:', error);
  }
}

async function handlePaymentSuccess(paymentId) {
  try {
      // Validate payment (in a real app, you'd verify with your server)
      if (!paymentId) {
          throw new Error('Invalid payment ID');
      }
      
      // Set Pro status with 1 year expiry
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      
      await chrome.storage.local.set({
          isPro: true,
          proExpiryDate: expiryDate.toISOString(),
          paymentId: paymentId,
          proActivatedAt: new Date().toISOString()
      });
      
      // Reset daily usage
      const todayKey = getTodayKey();
      await chrome.storage.local.remove([todayKey]);
      
      return { 
          success: true, 
          message: 'Pro subscription activated!',
          expiryDate: expiryDate.toISOString()
      };
      
  } catch (error) {
      console.error('Payment processing error:', error);
      throw error;
  }
}

// Storage management
async function getStorageInfo() {
  try {
      const result = await chrome.storage.local.get(null);
      const dataSize = JSON.stringify(result).length;
      
      // Count different types of data
      let summaryCount = 0;
      let usageRecords = 0;
      
      for (const key in result) {
          if (key === 'saved_summaries' && Array.isArray(result[key])) {
              summaryCount = result[key].length;
          }
          if (key.startsWith('usage_')) {
              usageRecords++;
          }
      }
      
      return {
          totalSizeKB: Math.round(dataSize / 1024),
          summaryCount,
          usageRecords,
          isPro: result.isPro || false,
          proExpiryDate: result.proExpiryDate || null
      };
      
  } catch (error) {
      console.error('Error getting storage info:', error);
      throw error;
  }
}

async function exportUserData() {
  try {
      const allData = await chrome.storage.local.get(null);
      
      // Remove sensitive data from export
      const { paymentId, razorpayKey, openaiApiKey, ...exportData } = allData;
      
      return {
          ...exportData,
          exportedAt: new Date().toISOString(),
          version: '2.0'
      };
      
  } catch (error) {
      console.error('Error exporting user data:', error);
      throw error;
  }
}

// Installation and update handling
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
      // First installation
      chrome.storage.local.set({
          installDate: new Date().toISOString(),
          version: '2.0'
      });
      
      // Open welcome page
      chrome.tabs.create({ 
          url: chrome.runtime.getURL('welcome.html') 
      });
      
  } else if (details.reason === 'update') {
      // Extension updated
      const currentVersion = chrome.runtime.getManifest().version;
      const previousVersion = details.previousVersion;
      
      console.log(`Updated from ${previousVersion} to ${currentVersion}`);
      
      // Handle any migration logic here
      migrateLegacyData(previousVersion, currentVersion);
  }
});

async function migrateLegacyData(fromVersion, toVersion) {
  try {
      if (fromVersion === '1.0' && toVersion === '2.0') {
          // Migrate old data structure to new format
          const oldData = await chrome.storage.local.get(null);
          
          // Example migration logic
          if (oldData.summaries && !oldData.saved_summaries) {
              await chrome.storage.local.set({
                  saved_summaries: oldData.summaries
              });
              await chrome.storage.local.remove(['summaries']);
          }
      }
  } catch (error) {
      console.error('Data migration error:', error);
  }
}

// Periodic cleanup and maintenance
chrome.alarms.create('maintenance', { 
  delayInMinutes: 60, 
  periodInMinutes: 24 * 60 // Daily
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'maintenance') {
      cleanupOldUsageData();
  }
});

// Handle extension uninstall (for analytics)
chrome.runtime.setUninstallURL('https://your-website.com/uninstall-feedback');