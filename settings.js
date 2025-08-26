/**
 * Shows temporary status message to user
 * @param {string} message - the message being displayed
 * @param {boolean} isSuccess - whether success message or error message
*/
function showStatus(message, isSuccess = true) {
    const statusEl = document.getElementById('status');
    if(statusEl) {
        statusEl.textContent = message;
        statusEl.style.color = isSuccess ? 'green' : 'red';
        // clear message after a few seconds
        setTimeout(() => { statusEl.textContent = '';}, 4000);
    }
}

/**
 * Loads saved settings from chrome.storage.local and populates the form fields
 */
async function loadSettings() {
    try{
        // Define default values
        const defaultSettings = {
            openaiApiKey: '',
            razorpayKey: ''
        };

        // Retrieve settings
        const result = await chrome.storage.local.get(Object.keys(defaultSettings));

        // Populate fileds using defaults if not found
        Object.keys(defaultSettings).forEach(key => {
            const element = document.getElementById(key);
            if(element && element.type === 'checkbox'){
                element.checked = result[key] ?? defaultSettings[key];
            } else if(element) {
                element.value = result[key] ?? defaultSettings[key];
            }
        });

        showStatus('Settings loaded', true);
    } catch(error) {
        console.error(`Error loading settings: ${error}`);
        showStatus(`Failed to load settings.`, false);
    }
}

// Event Listeners

document.addEventListener('DOMContentLoaded', () => {
    // Load settings when page opens
    loadSettings();

    const saveBtn = document.getElementById('saveBtn');
    if(saveBtn) {
        saveBtn.addEventListener('click', async () => {
            try {
                // Get values from input fields
                const openaiApiKey = document.getElementById('openaiApiKey')?.value.trim() || '';
                const razorpayKey = document.getElementById('razorpayKey')?.value.trim() || '';

                // Basic validation for OpenAI key format
                if(openaiApiKey && !openaiApiKey.startsWith('sk-')) {
                    showStatus(`Open AI API Key should start with "sk-".`, false);
                    return;
                }

                //Prepare data to save
                const settingsToSave = {};
                if(openaiApiKey != undefined) settingsToSave.openaiApiKey = openaiApiKey;
                if(razorpayKey != undefined) settingsToSave.razorpayKey = razorpayKey;

                // Save data
                await chrome.storage.local.set(settingsToSave);

                showStatus('Settings Saved Successfully.', true);

            } catch(error) {
                console.error('Error Saving Settings', error);
                showStatus("Failed to Save Settings", false);
            }
        });
    }
    else {
        console.warn(`Save Button not found in settings`);
    }
});