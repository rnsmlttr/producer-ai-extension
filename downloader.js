// downloader.js
(function () {
    const INJECTION_FLAG = 'hasInjectedProducerDownloader_v' + new Date().getTime();
    if (window[INJECTION_FLAG]) return;
    window[INJECTION_FLAG] = true;

    // clear old flags if any (optional cleanup)
    if (window.hasInjectedProducerDownloader) delete window.hasInjectedProducerDownloader;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "INIT_DOWNLOADER") {
            startDownloader(request.config);
        }
        if (request.type === "DOWNLOAD_ERROR") {
            console.error(`Download Error reported for ID ${request.downloadId}:`, request.error);
            const ui = createStatusUI();
            ui.addLog(`Download Failed: ${request.error}`, "error");
        }
    });

    async function startDownloader(config) {
        console.log("🚀 Starting Downloader V4 (Hybrid) with config:", config);

        let cancelled = false;
        const ui = createStatusUI(() => {
            cancelled = true;
            ui.addLog("Cancelled.", "error");
            ui.finish(0, 0, true);
        });

        ui.addLog("Initializing...");

        const token = getAuthToken();
        if (!token) {
            ui.showError("Could not find login session. Refresh page.");
            return;
        }
        ui.addLog("Authenticated", "success");

        // --- 1. identify songs ---
        let songs = [];
        const isAllMode = config.mode === 'all' || config.mode === 'playlist' || config.mode === 'session';

        let rawSongs = [];
        if (!isAllMode) { // 'selected'
            const checkboxes = Array.from(document.querySelectorAll('button[aria-label="Deselect song"]'));
            if (checkboxes.length === 0) {
                ui.showError("No songs selected. Check boxes or use 'All Visible' mode.");
                return;
            }
            rawSongs = checkboxes.map(cb => {
                const row = cb.closest('[role="button"]');
                return extractSongData(row);
            }).filter(s => s);
        } else {
            // all / playlist / session mode
            const rows = Array.from(document.querySelectorAll('div[role="button"][aria-label^="Open details for"]'));
            if (rows.length === 0) {
                ui.showError("No song rows detected.");
                return;
            }
            rawSongs = rows.map(row => extractSongData(row)).filter(s => s);
        }

        // deduplicate by id
        const seenIds = new Set();
        songs = rawSongs.filter(s => {
            if (seenIds.has(s.id)) return false;
            seenIds.add(s.id);
            return true;
        });

        ui.addLog(`Found ${songs.length} unique songs (from ${rawSongs.length} visible).`);
        if (songs.length > 0) {
            ui.updateProgress(0, songs.length, "Preparing...");
        }

        // --- 2. determine folder path ---
        let folderPrefix = "";
        let plTitle = config.passedTitle;

        // force check if generic
        if (!plTitle || plTitle === 'Untitled' || plTitle.startsWith('Producer.ai') || plTitle === 'Session') {
            // 1. check library page status (from url, can't check variable)
            if (window.location.pathname.includes('/library/my-songs')) {
                plTitle = "My_Songs";
            } else {
                // 2. scrape title (broader search)
                const titleEl = document.querySelector('.font-display') || document.querySelector('div[role="textbox"]') || document.querySelector('h1 div') || document.querySelector('h1');
                if (titleEl && titleEl.innerText.trim().length > 0) {
                    plTitle = titleEl.innerText.trim();
                } else {
                    plTitle = "Session_" + new Date().toISOString().slice(2, 10);
                }
            }
        }

        if (config.folder === 'generic') {
            const date = new Date().toISOString().split('T')[0];
            folderPrefix = `ProdAI_${date}/`;
        } else if (config.folder === 'smart') {
            const safeTitle = sanitizeFilename(plTitle);
            // double check we didn't sanitize down to nothing
            folderPrefix = `${safeTitle || 'Producer_Download'}/`;
        }

        // --- 3. process downloads client-side ---
        let successCount = 0;
        let failCount = 0;

        // determine file & url format
        let fileExt = 'wav';
        let urlFormat = 'wav';

        if (config.format === 'mp3') { urlFormat = 'mp3'; fileExt = 'mp3'; }
        if (config.format === 'm4a') { urlFormat = 'm4a'; fileExt = 'm4a'; }

        // execution loop
        for (const [index, song] of songs.entries()) {
            if (cancelled) break;
            ui.updateProgress(index + 1, songs.length, `Downloading ${index + 1}/${songs.length}`);

            try {
                // a. generate filename (now supports folders via background download)
                const filename = `${folderPrefix}${song.title}.${fileExt}`;

                // b. fetch blob (client side - bypasses cloudflare)
                ui.addLog(`Fetching: ${song.title}`, "download");
                const blob = await fetchTrackBlob(song.id, urlFormat, token);

                // c. relay to background to save (supports folders)
                await downloadBlobViaBackground(blob, filename);

                successCount++;
                ui.markSuccess(index);

            } catch (e) {
                console.error(e);
                failCount++;
                ui.markFail(index, e.message);
                ui.addLog(`Failed: ${song.title} - ${e.message}`, "error");
            }

            // rate limit
            await new Promise(r => setTimeout(r, 600));
        }

        if (!cancelled) ui.finish(successCount, failCount);
    }

    // --- Helpers ---

    async function fetchTrackBlob(songId, format, token) {
        const url = `https://www.producer.ai/__api/${songId}/download?format=${format}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            // try to read error
            const txt = await res.text();
            throw new Error(`Fetch failed: ${res.status} ${txt.substring(0, 50)}`);
        }

        const type = res.headers.get('content-type');
        if (type && type.includes('application/json')) {
            const json = await res.json();
            if (json.url) {
                // signed url redirect
                console.log("Redirecting to Signed URL...");
                const redir = await fetch(json.url);
                return await redir.blob();
            }
            throw new Error(`API Error: ${JSON.stringify(json)}`);
        }

        return await res.blob();
    }

    function downloadBlobViaBackground(blob, filename) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = function () {
                const dataUrl = reader.result;
                // send to background script which can use chrome.downloads (supports folders)
                chrome.runtime.sendMessage({
                    type: "DOWNLOAD",
                    url: dataUrl,
                    filename: filename,
                    saveAs: false
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError.message);
                    } else if (response && !response.success) {
                        reject(response.error);
                    } else {
                        resolve();
                    }
                });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function extractSongData(row) {
        if (!row) return null;
        try {
            const link = row.querySelector('a[href^="/song/"]');
            if (!link) return null;
            const id = link.getAttribute('href').split('/').pop();
            const h4 = row.querySelector('h4');
            let title = h4 ? h4.innerText : row.innerText.split('\n')[0];
            return { id, title: sanitizeFilename(title) };
        } catch (e) { return null; }
    }

    function sanitizeFilename(name) {
        if (!name) return "Untitled";
        name = name.substring(0, 64); // limits
        return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\.+$/, '').trim();
    }

    function getAuthToken() {
        try {
            const cookies = document.cookie.split('; ');
            const authCookies = cookies.filter(c => c.trim().startsWith('sb-api-auth-token.'));
            if (authCookies.length === 0) return null;
            authCookies.sort();
            const fullValue = authCookies.map(c => c.split('=')[1]).join('');
            return JSON.parse(atob(fullValue.replace('base64-', ''))).access_token;
        } catch (e) { return null; }
    }

    function createStatusUI(onCancel) {
        const sidebarStatusContainer = document.getElementById('sp-status-bar');
        const sidebarFooterIdle = document.getElementById('sp-footer-idle');

        if (sidebarStatusContainer) {
            sidebarStatusContainer.style.display = 'block';
            if (sidebarFooterIdle) sidebarFooterIdle.style.display = 'none';
            const fill = document.getElementById('sp-progress-fill');
            if (fill) fill.style.width = '0%';

            return {
                updateProgress: (curr, total, status) => {
                    const pct = total > 0 ? Math.round((curr / total) * 100) : 0;
                    if (fill) fill.style.width = pct + "%";
                    const text = document.getElementById('sp-status-text');
                    const count = document.getElementById('sp-status-count');
                    if (text && status) text.innerText = status;
                    if (count) count.innerText = `${curr}/${total}`;
                },
                addLog: (msg) => console.log(`[DL] ${msg}`),
                markSuccess: (index) => { },
                markFinished: (title) => { },
                markFail: (index, err) => { },
                showError: (msg) => {
                    const text = document.getElementById('sp-status-text');
                    if (text) { text.innerText = msg; text.style.color = '#ff4444'; }
                },
                finish: (success, fail) => {
                    const text = document.getElementById('sp-status-text');
                    const count = document.getElementById('sp-status-count');
                    if (text) {
                        text.innerText = "Done!";
                        text.style.color = '#44ff44';
                    }
                    if (count) {
                        count.innerText = `${success}/${success + fail}`; // approximation
                    }
                    setTimeout(() => {
                        if (sidebarStatusContainer) sidebarStatusContainer.style.display = 'none';
                        if (sidebarFooterIdle) sidebarFooterIdle.style.display = 'block';
                        if (text) text.style.color = '';
                    }, 5000);
                }
            };
        }
        return {
            updateProgress: () => { },
            addLog: console.log,
            markSuccess: () => { },
            markFinished: () => { },
            markFail: () => { },
            showError: console.error,
            finish: () => { }
        };
    }
})();
