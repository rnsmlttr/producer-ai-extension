importScripts('jszip.min.js');

console.log("BG.JS (Clean) Loaded successfully!");

chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension Installed - BG.JS (Clean)");
});

// --- message handling ---
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 1. legacy/direct download (unauthenticated or public urls)
    if (request.type === "DOWNLOAD") {
        chrome.downloads.download({
            url: request.url,
            filename: request.filename,
            saveAs: request.saveAs || false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId: downloadId });
            }
        });
        return true;
    }

    // 2. relay to content script
    if (request.type === "RELAY_TO_TAB") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, request.payload);
            }
        });
        return false;
    }

    // 3. authenticated / advanced download manager
    if (request.type === "DOWNLOAD_ADVANCED") {
        handleAdvancedDownload(request, sendResponse);
        return true; // keep channel open for async response
    }
});

// --- advanced download logic ---
async function handleAdvancedDownload(req, sendResponse) {
    const { jobType, token, keepOpen } = req;
    // jobType: 'manifest' (list of files), 'stems' (fetch json & process)

    try {
        if (jobType === 'manifest') {
            await processManifest(req, sendResponse);
        } else if (jobType === 'stems') {
            await processStems(req, sendResponse);
        } else {
            sendResponse({ success: false, error: "Unknown job type" });
        }
    } catch (e) {
        console.error("Advanced Download Error:", e);
        sendResponse({ success: false, error: e.message });
    }
}

// process a list of urls (files or zip)
async function processManifest(req, sendResponse) {
    const { items, zip, zipName, saveAs, token } = req;

    // --- zip mode ---
    if (zip) {
        // zip still requires fetching. if api is blocked, this might fail,
        // but we'll try with the token provided.
        try {
            const jszip = new JSZip();
            let downloaded = 0;

            const promises = items.map(async (item) => {
                try {
                    // we must fetch to zip.
                    const blob = await fetchWithAuth(item.url, token);
                    jszip.file(item.filename, blob);
                    downloaded++;
                } catch (e) {
                    console.error(`Failed to fetch ${item.filename}:`, e);
                }
            });

            await Promise.all(promises);

            if (downloaded === 0) throw new Error("All downloads failed (Zip generation).");

            const content = await jszip.generateAsync({ type: "blob" });
            const blobUrl = URL.createObjectURL(content);

            chrome.downloads.download({
                url: blobUrl,
                filename: zipName,
                saveAs: saveAs
            }, (id) => {
                if (chrome.runtime.lastError) sendResponse({ success: false, error: chrome.runtime.lastError.message });
                else sendResponse({ success: true, downloadId: id });
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
            });

        } catch (e) {
            sendResponse({ success: false, error: e.message });
        }
        return;
    }

    // --- individual mode: universal fetch strategy ---
    // 1. fetch with auth (handles redirects automatically).
    // 2. verify content-type (reject json).
    // 3. download blob.

    let triggered = 0;
    let errors = 0;
    let lastError = "";

    for (const item of items) {
        try {
            console.log(`Processing: ${item.filename}`);

            // 1. fetch & verify
            const blob = await fetchWithAuth(item.url, token);

            // 2. create url
            const blobUrl = URL.createObjectURL(blob);

            // 3. download
            await new Promise((resolve, reject) => {
                chrome.downloads.download({
                    url: blobUrl,
                    filename: item.filename,
                    saveAs: false,
                    conflictAction: 'uniquify'
                }, (downloadId) => {
                    if (chrome.runtime.lastError) {
                        console.error("Chrome Download Error:", chrome.runtime.lastError);
                        reject(chrome.runtime.lastError);
                    } else {
                        console.log(`Download started: ${downloadId}`);
                        resolve(downloadId);
                    }
                });
            });

            triggered++;

            // keep blob alive for a while to ensure write completes
            setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);

        } catch (e) {
            console.warn("Failed item:", item.filename, e);
            errors++;
            lastError = e.message || e;
        }

        // pacing
        await new Promise(r => setTimeout(r, 500));
    }

    if (triggered === 0 && errors > 0) {
        sendResponse({ success: false, error: `Failed. Last error: ${lastError}` });
    } else {
        sendResponse({ success: true, count: triggered, errors: errors });
    }
}

// universal fetch helper (function removed - using the more robust definition at bottom of file)


// process stems for a single song
async function processStems(req, sendResponse) {
    const { songId, filenamePrefix, token, zip, saveAs } = req;
    const url = `https://www.producer.ai/__api/stems/${songId}`;

    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Stems API Error: ${res.status}`);
        const data = await res.json();

        if (!data.stems || Object.keys(data.stems).length === 0) {
            throw new Error("No stems found in response.");
        }

        const stems = data.stems; // object: { "drum": "base64...", "bass": "..." }

        if (zip) {
            const jszip = new JSZip();
            for (const [name, b64] of Object.entries(stems)) {
                if (b64) jszip.file(`${name}.m4a`, b64, { base64: true });
            }
            const content = await jszip.generateAsync({ type: "blob" });
            const blobUrl = URL.createObjectURL(content);

            chrome.downloads.download({
                url: blobUrl,
                filename: `${filenamePrefix}_Stems.zip`,
                saveAs: saveAs
            }, (id) => {
                sendResponse({ success: true, downloadId: id });
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
            });

        } else {
            // individual stems
            let count = 0;
            const stemFolder = `${filenamePrefix}_Stems/`;

            for (const [name, b64] of Object.entries(stems)) {
                if (!b64) continue;

                // convert b64 to blob url
                const byteCharacters = atob(b64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: "audio/mp4" });
                const blobUrl = URL.createObjectURL(blob);

                chrome.downloads.download({
                    url: blobUrl,
                    filename: `${stemFolder}${name}.m4a`,
                    saveAs: false
                });
                count++;

                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                await new Promise(r => setTimeout(r, 100)); // pace execution
            }
            sendResponse({ success: true, count });
        }

    } catch (e) {
        sendResponse({ success: false, error: e.message });
    }
}

// helper: fetch with auth
async function fetchWithAuth(url, token) {
    console.log("Fetching:", url);
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!res.ok) {
        throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get('content-type');
    console.log("Response Type:", contentType);

    if (contentType && contentType.includes('application/json')) {
        // we expected audio, but got json.
        // let's read it to see if it's a signed url or an error.
        const json = await res.json();

        // scenario a: it's an error message
        if (json.error || json.message) {
            console.error("API returned JSON error:", json);
            throw new Error(`API Error: ${json.message || json.error || JSON.stringify(json)}`);
        }

        // scenario b: it might be a presigned url response? 
        // if the api returns { url: "..." }, use that.
        if (json.url) {
            console.log("Received presigned URL:", json.url);
            // recursively fetch the new url (without auth header potentially, if it's s3 signed)
            const newRes = await fetch(json.url);
            if (!newRes.ok) throw new Error("Presigned URL fetch failed");
            return await newRes.blob();
        }

        // scenario c: unknown json
        throw new Error(`Unexpected JSON response: ${JSON.stringify(json).substring(0, 100)}`);
    }

    const blob = await res.blob();
    console.log("Blob Size:", blob.size, "Type:", blob.type);

    if (blob.size < 100) {
        console.warn("Blob is suspiciously small!");
    }

    return blob;
}

// --- status listener ---
chrome.downloads.onChanged.addListener((delta) => {
    chrome.tabs.query({}, (tabs) => {
        for (const t of tabs) {
            // report completion
            if (delta.state && delta.state.current === 'complete') {
                chrome.tabs.sendMessage(t.id, {
                    type: "DOWNLOAD_COMPLETE",
                    downloadId: delta.id
                });
            }

            // report errors/interruptions
            if (delta.error) {
                console.error("Download Interrupted:", delta.error.current);
                chrome.tabs.sendMessage(t.id, {
                    type: "DOWNLOAD_ERROR",
                    downloadId: delta.id,
                    error: delta.error.current
                });
            }
        }
    });
});
