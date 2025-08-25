async function getTranscript() {
  const ytInitialData = Array.from(document.querySelectorAll('script'))
      .map(script => script.textContent)
      .find(content => content?.includes('ytInitialPlayerResponse'));
  
      if(ytInitialData) {
          try{
              const jsonStr = ytInitialData
              .split('ytInitialPlayerResponse = ')[1]
              .replace(/;\s*(?:\n|$)/, '')
              .trim();
          
              const cleanJson = jsonStr
                  .replace(/'/g, '"')
                  .replace(/,\s*}/g, '}')
                  .replace(/,\s*]/g, ']');

              const data = JSON.parse(cleanJson);

              const captionTracks = 
              data.captions?.playerCaptionsTracklistRenderer?.captionTracks ||
              data.captions?.playerCaptionsRenderer?.captionTracks ||
              [];

              if(captionTracks.length > 0) {
                  return captionTracks[0].baseUrl;
              }
      } catch(e) {
          console.warn("Primary transcript extraction failed: ", e);
      }
  }
}

async function tryTranscriptButton() {
  return new Promise((resolve) => {
      const transcriptButton = document.querySelector(
          '#show-transcript-button, ytd-transcript-button, button[aria-label="Show transcript"]'
      );
      if(!transcriptButton) {
          resolve(null);
          return;
      }

      transcriptButton.click();

      const observer = new MutationObserver((mutations, obs) => {
          const transcriptContainer = document.querySelector(
              '#transcript, ytd-transcript-renderer, #primary > ytd-engagement-panel-section-list-renderer'
          );

          if(transcriptContainer) {
              obs.disconnect();

              // extract text directly from DOM
              const textElements = transcriptContainer.querySelectorAll('span');
              let transcript = '';
              textElements.forEach(e1 => {
                  if(e1.textContent.trim()) {
                      transcript += e1.textContent + ' ';
                  }
              });
              resolve(transcript || null);
          }
      });

      observer.observe(document.body, {
          childList: true,
          subtree: true
      });

      // Timeout after 5 seconds
      setTimeout(() => {
          observer.disconnect();
          resolve(null);
      }, 5000);
  });
}

// Update message listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(msg.action === "getTranscript") {
      const transcriptUrl = getTranscript();
      if(transcriptUrl) {
          sendResponse({ transcriptUrl });
      } else {
          tryTranscriptButton().then(transcript => {
              sendResponse({ transcript });
          });
          return true;
      }
  }
  return true;
});