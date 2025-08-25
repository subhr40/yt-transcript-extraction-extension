function getTodayKey() {
    const today = new Date().toISOString().split("T")[0];
    return `usage_${today}`
}

//Fetches YT transcript
async function fetchTranscript(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    
    const text = await res.text();
    
    // Handle different response formats
    if (text.startsWith('<?xml')) {
      // Parse as XML
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, "text/xml");
      
      // Handle different XML structures
      let textElements;
      if (xml.querySelector('text')) {
        textElements = xml.querySelectorAll('text');
      } else if (xml.querySelector('body p')) {
        textElements = xml.querySelectorAll('body p');
      } else {
        // Try to find any text-containing elements
        textElements = Array.from(xml.getElementsByTagName('*')).filter(
          el => el.textContent?.trim() && !el.children.length
        );
      }
      
      let transcript = '';
      for (let i = 0; i < textElements.length; i++) {
        const textContent = textElements[i].textContent?.trim();
        if (textContent) transcript += textContent + ' ';
      }
      
      return transcript;
      
    } else if (text.startsWith('{') || text.startsWith('[')) {
      // Parse as JSON (some endpoints return JSON)
      try {
        const json = JSON.parse(text);
        return json.events?.map(e => 
          e.segs?.map(seg => seg.utf8).join('') || ''
        ).join(' ');
      } catch (e) {
        console.warn("JSON transcript parsing failed:", e);
        return text; // Fallback to raw text
      }
      
    } else {
      // Parse as plain text (SBV/VTT formats)
      return text
        .replace(/(\d{2}:)?\d{2}:\d{2}\.\d{3} --> (\d{2}:)?\d{2}:\d{2}\.\d{3}/g, '')
        .replace(/\d+\n/g, '')
        .replace(/\n{2,}/g, '\n')
        .trim();
    }
  } catch (error) {
    console.error("Transcript fetch failed:", error);
    throw error;
  }
}
  
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "fetchTranscript") {
        fetchTranscript(msg.url).then(transcript => {
        sendResponse({ transcript });
        });
        return true; // keep channel open
    }
    if(msg.action === "trackUsage") {
        const todayKey = getTodayKey();
        chrome.storage.local.get([todayKey, "isPro"], (res) => {
            const count = res[todayKey] || 0;
            if (res.isPro) {
              sendResponse({ allowed: true });
            } else if (count < 3) {
              chrome.storage.local.set({ [todayKey]: count + 1 });
              sendResponse({ allowed: true });
            } else {
              sendResponse({ allowed: false });
            }
        });
        return true;
    }
});