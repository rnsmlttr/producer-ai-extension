console.log("Popup script loaded.");

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab && tab.url && (tab.url.includes("producer.ai"))) {
            openSidebar(tab.id);
        } else {
            showStatus("Please use this extension on <b>Producer.ai</b>", "error");
        }
    } catch (e) {
        console.error(e);
        showStatus("Extension Error: " + e.message, "error");
    }
});

async function openSidebar(tabId) {
    try {
        // Optimistic: Send Message
        await chrome.tabs.sendMessage(tabId, { type: "TOGGLE_SIDEBAR" });
        window.close();
    } catch (e) {
        console.log("Message failed, attempting injection...", e);
        // Fallback: Inject
        try {
            await chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] });
            await chrome.scripting.executeScript({ target: { tabId }, files: ['sidebar_ui.js'] });

            // Wait slightly for script to init
            setTimeout(async () => {
                try {
                    await chrome.tabs.sendMessage(tabId, { type: "TOGGLE_SIDEBAR" });
                    window.close();
                } catch (timeoutErr) {
                    showStatus("Failed to open sidebar. Please refresh the page.", "error");
                }
            }, 300);
        } catch (injectErr) {
            console.error(injectErr);
            showStatus("Failed to inject scripts. Please refresh the page.", "error");
        }
    }
}

function showStatus(msg, type) {
    document.body.innerHTML = `
        <div style="padding:20px; text-align:center; font-family:sans-serif; color:${type === 'error' ? '#d32f2f' : '#333'};">
            <p>${msg}</p>
        </div>
    `;
}
