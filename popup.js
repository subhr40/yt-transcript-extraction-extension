document.getElementById("summarizeBtn").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "getTranscript" }, (response) => {
        if (response?.transcriptUrl) {
          chrome.runtime.sendMessage({ action: "fetchTranscript", url: response.transcriptUrl }, (res) => {
            sendToAI(res.transcript);
          });
        } else {
          document.getElementById("output").innerText = "No transcript available.";
        }
      });
    });
  });
  
async function sendToAI(transcript) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
        "Authorization": "Bearer YOUR_OPENAI_KEY",
        "Content-Type": "application/json"
        },
        body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "Summarize the following transcript in 5 bullet points and generate 3 quiz questions." },
            { role: "user", content: transcript }
        ]
        })
    });
    const data = await res.json();
    document.getElementById("output").innerText = data.choices[0].message.content;
}

function attemptUsage(transcript) {
    chrome.runtime.sendMessage({ action: "trackUsage"}, (res) => {
        if(res.allowed) {
            sendToAI(transcript);
        } else {
            document.getElementById("output").innerHTML = `
                <p>⚠️ Free limit reached. Upgrade to Pro for unlimited summaries.</p>
                <button id="upgradeBtn">Upgrade</button>
            `;
            document.getElementById("upgrageBtn").addEventListener("click", openPaymentPage);
        }
    });
}

function openPaymentPage() {
    chrome.runtime.sendMessage({ action: "openPayment" });
}

async function getApiKey() {
    const { openaiApiKey } = await chrome.storage.local.get('openaiApiKey');
    return openaiApiKey || null;
}

async function sendToAI(transcript) {
    const apiKey = await getApiKey();
    if(!apiKey) {
        document.getElementById("output").innerHTML = `
            <p>⚠️ Please set your OpenAI API key in settings</p>
            <a href="settings.html">Go to Settings</a>
        `;
        return;
    }
}

async function openPaymentPage() {
    try {
        // Razorpay key from secure storage
        const data = await chrome.storage.local.get(['razorpayKey']);
        const razorpayKey = data.razorpayKey || FALLBACK_KEY;
        var options = {
            key: "RAZORPAY_KEY_ID",
            amount: 19990,
            currency: "INR",
            name: "YT AI Summarizer Pro",
            description: "Unilimited summaries & quizzes",
            handler: async (response) => {
                try {
                    //Pro Status saved
                    await chrome.storage.local.set({isPro: true});

                    //Update UI
                    const outputElement = document.getElementById("output");
                    if(outputElement) {
                        outputElement.innerText = "✅ You have subscribed to Pro!";
                    }

                    //confirmation in background script
                    chrome.runtime.sendMessage({ 
                        action: "paymentSuccess", 
                        paymentId: response.razorpay_payment_id 
                    });
                } catch(error) {
                    console.error("Failed to save Pro status: ", error);
                    if(document.getElementById("output")) {
                        document.getElementById("output").innerText = "❌ Error saving Pro status";
                    }
                }
            },

            // Payment failure handler
            modal: {
                ondismiss: function() {
                    if(document.getElementById("output")) {
                        document.getElementById("output").innerText = "Payment Cancelled";
                    }
                }
            },

            theme: {
                color: "#3399cc"
            }
        };
        var rzp = new Razorpay(options);
        rzp.open();
    } catch(error) {
        console.error("Failed to open payment page: ", error);
        if(document.getElementById("output")) {
            document.getElementById("output").innerText = "❌ Payment System Error";
        }
    }
}