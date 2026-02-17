// sidebar_ui.js
(function () {
    const INJECTION_FLAG = 'hasInjectedSidebar_v' + new Date().getTime();
    if (window[INJECTION_FLAG]) return;
    window[INJECTION_FLAG] = true;

    // clear old flags
    if (window.hasInjectedSidebar) delete window.hasInjectedSidebar;

    // global state
    const STATE = {
        credits: '...',
        pageType: 'unknown', // 'session', 'playlist', 'library'
        pageTitle: 'Untitled',
        lastPath: ''
    };

    const Storage = {
        get: (keys) => new Promise(r => chrome.storage.local.get(keys, r)),
        set: (obj) => new Promise(r => chrome.storage.local.set(obj, r))
    };

    // credits logic
    async function initCredits() {
        try {
            // load cached
            const res = await Storage.get(['cached_credits']);
            if (res.cached_credits) {
                STATE.credits = res.cached_credits;
                updateSidebarCredits();
            }

            // try api for exact amount
            const token = getAuthToken();
            if (token) {
                try {
                    const r = await fetch('https://www.producer.ai/__api/me', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (r.ok) {
                        const data = await r.json();
                        const credits = data.credits || (data.user && data.user.credits);
                        if (credits !== undefined) {
                            STATE.credits = credits.toLocaleString();
                            Storage.set({ cached_credits: STATE.credits });
                            updateSidebarCredits();
                            return;
                        }
                    }
                } catch (e) { }
            }
        } catch (e) { }

        // fallback: dom observer
        initCreditsObserver();
    }

    let observer = null;
    function initCreditsObserver() {
        if (observer) return;

        const updateFromDOM = () => {
            try {
                // User provided class structure for the menu item
                // We search for elements sharing key classes and filtering by text "Credits"
                const candidates = document.querySelectorAll('.flex.items-center.justify-between.cursor-pointer');

                for (const node of candidates) {
                    // Check for specific tailwind classes to ensure we have the right menu item
                    if (node.className.includes('data-highlighted:bg-bg-2') && node.className.includes('text-fg-1')) {
                        // Check if this row is actually for Credits
                        if (node.innerText.toLowerCase().includes('credits')) {
                            // Extract the number
                            const match = node.innerText.match(/(\d[\d,.]*[KMB]?)/);
                            if (match) {
                                const val = match[1];
                                if (val !== STATE.credits) {
                                    STATE.credits = val;
                                    Storage.set({ cached_credits: STATE.credits });
                                    updateSidebarCredits();
                                }
                                return;
                            }
                        }
                    }
                }
            } catch (e) { }
        };

        // throttle observer
        let timeout;
        observer = new MutationObserver(() => {
            if (!timeout) {
                timeout = setTimeout(() => {
                    updateFromDOM();
                    timeout = null;
                }, 1000);
            }
        });

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    function updateSidebarCredits() {
        const span = document.getElementById('sp-credits-text');
        if (span) span.innerText = `${STATE.credits} CR`;
    }

    // message listener
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === "TOGGLE_SIDEBAR") {
            toggleSidebar();
        }
    });

    // main sidebar logic
    function toggleSidebar() {
        analyzePage();
        const existing = document.getElementById('sp-sidebar');
        if (existing) {
            if (existing.style.right === '0px') closeSidebar();
            else openSidebar();
        } else {
            createSidebar();
            setTimeout(openSidebar, 50);
        }
    }

    function openSidebar() {
        const sidebar = document.getElementById('sp-sidebar');
        if (sidebar) {
            sidebar.style.right = '0';
            STATE.isOpen = true; // track open state
            analyzePage();
            updateUIForPageType();
        }
    }

    function closeSidebar() {
        const sidebar = document.getElementById('sp-sidebar');
        if (sidebar) {
            sidebar.style.right = '-420px';
            STATE.isOpen = false;
        }
    }

    // --- Helper for scraping improved selectors ---
    function extractTextFromSelectors(doc, selectors) {
        for (const sel of selectors) {
            const el = doc.querySelector(sel);
            if (el && el.innerText.trim().length > 0) return el.innerText.trim();
        }
        return "";
    }

    function showConfirmationModal(stats) {
        const modal = document.createElement('div');
        modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.8); z-index: 2147483649; display: flex;
        align-items: center; justify-content: center; font-family: 'Inter', sans-serif;
        `;

        modal.innerHTML = `
            <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 24px; width: 400px; color: #fff; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
                <h3 style="margin-top:0; font-size:18px; font-weight:700; color:#fff;">Export Complete</h3>
                <div style="margin: 20px 0; font-size: 13px; line-height: 1.6; color: #ccc;">
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #333; padding-bottom:8px; margin-bottom:8px;">
                        <span>Songs Processed:</span> <span style="color:#fff;">${stats.total}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span>Successful Downloads:</span> <span style="color:#4caf50;">${stats.success}</span>
                    </div>
                    ${stats.failed > 0 ? `
                    <div style="display:flex; justify-content:space-between; color:#ff5555;">
                        <span>Failed:</span> <span>${stats.failed}</span>
                    </div>` : ''}
                </div>
                <button id="sp-conf-close" style="width:100%; padding:12px; background:#fff; color:#000; font-weight:700; border:none; border-radius:4px; cursor:pointer;">CLOSE</button>
            </div>
            `;

        document.body.appendChild(modal);
        document.getElementById('sp-conf-close').onclick = () => modal.remove();
    }

    async function handleMasterExport(e) {
        if (e) e.preventDefault();

        // Ensure JSZip
        if (typeof JSZip === 'undefined') { alert("JSZip not loaded. Reload page."); return; }

        const btn = document.getElementById('sp-run-master-export');
        const setBtn = (txt, dis) => { if (btn) { btn.innerText = txt; btn.disabled = dis; } };

        setBtn("Initializing...", true);

        let stats = { total: 0, success: 0, failed: 0 };

        try {
            const zip = new JSZip();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const safeTitle = (STATE.pageTitle || "Export").replace(/[^a-z0-9-_]/gi, '_');
            const rootName = `${safeTitle}_Master_Package_${timestamp}`;
            const rootFolder = zip.folder(rootName);

            const audioFolder = rootFolder.folder("Audio_WAV");
            const lyricsFolder = rootFolder.folder("Lyrics");
            const metaFolder = rootFolder.folder("Metadata");
            const chatFolder = rootFolder.folder("Chat_Logs");
            const imgFolder = rootFolder.folder("Images");

            // image scraping
            const images = Array.from(document.querySelectorAll('img')).filter(img => {
                const src = img.src || "";
                return src.includes('image_') || src.includes('generated');
            });

            // deduplicate
            const uniqueImgUrls = [...new Set(images.map(i => i.src))];

            // identify "main" art
            let mainArtUrl = "";
            let maxArea = 0;

            images.forEach(img => {
                const rect = img.getBoundingClientRect();
                const area = rect.width * rect.height;
                if (area > maxArea && area > 10000) {
                    maxArea = area;
                    mainArtUrl = img.src;
                }
            });

            if (!mainArtUrl && uniqueImgUrls.length > 0) mainArtUrl = uniqueImgUrls[0];

            // download main art
            if (mainArtUrl) {
                try {
                    setBtn("Downloading Art...", true);
                    const resp = await fetch(mainArtUrl);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        const type = blob.type.split('/')[1] || 'jpg';
                        rootFolder.file(`AlbumArt.${type}`, blob);
                    }
                } catch (e) { }
            }

            // download other images
            const otherImages = uniqueImgUrls.filter(u => u !== mainArtUrl);
            if (otherImages.length > 0) {
                let imgCount = 0;
                for (const url of otherImages) {
                    try {
                        const r = await fetch(url);
                        if (r.ok) {
                            const b = await r.blob();
                            const t = b.type.split('/')[1] || 'jpg';
                            imgFolder.file(`Generated_${++imgCount}.${t}`, b);
                        }
                    } catch (e) { }
                }
            }

            // chat logs
            if (STATE.pageType === 'session') {
                const messageBlocks = Array.from(document.querySelectorAll('.group.w-full'));
                let log = "SESSION CHAT LOG\n=================\n\n";
                messageBlocks.forEach(block => {
                    const isUser = block.querySelector('.flex-row-reverse') !== null || block.className.includes('justify-end');
                    const sender = isUser ? "USER" : "AGENT";
                    const text = block.innerText.replace(/You said:|Agent said:/g, '').trim();
                    log += `[${sender}]\n${text} \n-----------------\n`;
                });
                chatFolder.file("Session_Chat.txt", log);
            }

            // identify songs
            const songRows = Array.from(document.querySelectorAll('div[role="button"][aria-label^="Open details for"]'));
            const uniqueSongs = [];
            const seen = new Set();

            // main list logic
            songRows.forEach(row => {
                try {
                    const link = row.querySelector('a[href^="/song/"]');
                    if (link) {
                        const href = link.getAttribute('href').replace(/\/+$/, '');
                        const uuid = href.split('/').pop();
                        if (!seen.has(uuid)) {
                            seen.add(uuid);
                            uniqueSongs.push({ uuid, element: row });
                        }
                    }
                } catch (e) { }
            });

            // fallback logic
            if (uniqueSongs.length === 0) {
                const queries = document.querySelectorAll('a[href^="/song/"]');
                queries.forEach(link => {
                    const href = link.getAttribute('href').replace(/\/+$/, '');
                    const uuid = href.split('/').pop();
                    if (!seen.has(uuid)) {
                        seen.add(uuid);
                        uniqueSongs.push({ uuid, element: link.closest('div') });
                    }
                });
            }

            if (uniqueSongs.length === 0) throw new Error("No songs found to export.");

            stats.total = uniqueSongs.length;

            // processing loop
            const metadataRecords = [];
            let processed = 0;

            for (const item of uniqueSongs) {
                processed++;
                setBtn(`Exporting ${processed}/${uniqueSongs.length}...`, true);

                // get list title
                let listTitle = "Untitled";
                if (item.element) {
                    const aria = item.element.getAttribute('aria-label');
                    if (aria && aria.startsWith("Open details for ")) listTitle = aria.replace("Open details for ", "").trim();
                    else {
                        const h4 = item.element.querySelector('h4');
                        if (h4) listTitle = h4.innerText.trim();
                    }
                }

                // fetch song page
                const songUrl = `https://www.producer.ai/song/${item.uuid}`;
                let lyrics = "";
                let sound = "";
                let directAudioUrl = "";

                try {
                    const resp = await fetch(songUrl);
                    if (resp.ok) {
                        const text = await resp.text();
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(text, 'text/html');

                        // extract metadata
                        lyrics = extractTextFromSelectors(doc, ['.lyrics', 'div[class*="lyrics"]', '[data-testid="lyrics"]', '.whitespace-pre-wrap']);
                        sound = extractTextFromSelectors(doc, ['.sound', 'div[class*="sound"]', '[data-testid="sound"]', '.text-xs.bg-bg-3']);

                        // try to find audio url in meta tags
                        const metaAudio = doc.querySelector('meta[property="og:audio"]') || doc.querySelector('meta[name="twitter:player:stream"]');
                        if (metaAudio) directAudioUrl = metaAudio.content;

                        // hydration fallback
                        if (!lyrics || !sound || !directAudioUrl) {
                            const script = doc.getElementById('__NEXT_DATA__');
                            if (script) {
                                const json = JSON.parse(script.innerText);
                                const songData = json.props.pageProps.song || json.props.pageProps.clip;
                                if (songData) {
                                    if (songData.metadata?.prompt) lyrics = songData.metadata.prompt;
                                    if (songData.metadata?.tags) sound = songData.metadata.tags;
                                    if (songData.title && listTitle === "Untitled") listTitle = songData.title;
                                    if (songData.audio_url) directAudioUrl = songData.audio_url;
                                }
                            }
                        }
                    }
                } catch (e) { console.error("fetch error", e); }

                const finalTitle = (listTitle !== "Untitled") ? listTitle : item.uuid;
                const safeName = finalTitle.replace(/[^a-z0-9-_ ]/gi, '').trim();

                // download audio
                try {
                    // prioritize extracted url, fallback to producer cdn
                    const targetUrl = directAudioUrl || `https://cdn1.producer.ai/${item.uuid}.mp3`;

                    const audioResp = await fetch(targetUrl);
                    if (audioResp.ok) {
                        const blob = await audioResp.blob();
                        audioFolder.file(`${safeName}.mp3`, blob);
                        stats.success++;
                    } else {
                        // last ditch attempt: maybe it's a wav?
                        if (!directAudioUrl) {
                            const wavResp = await fetch(`https://cdn1.producer.ai/${item.uuid}.wav`);
                            if (wavResp.ok) {
                                const blob = await wavResp.blob();
                                audioFolder.file(`${safeName}.wav`, blob);
                                stats.success++;
                            } else {
                                stats.failed++;
                            }
                        } else {
                            stats.failed++;
                        }
                    }
                } catch (e) { stats.failed++; }

                // save lyrics
                if (lyrics) lyricsFolder.file(`${safeName}.txt`, lyrics);

                // metadata
                metadataRecords.push({
                    title: finalTitle,
                    uuid: item.uuid,
                    style: sound,
                    url: songUrl
                });

                await new Promise(r => setTimeout(r, 200));
            }

            // save csv/json
            metaFolder.file("metadata.json", JSON.stringify(metadataRecords, null, 2));
            const csv = ["Title,UUID,Style,URL"];
            metadataRecords.forEach(r => csv.push(`"${r.title}","${r.uuid}","${r.style}","${r.url}"`));
            metaFolder.file("metadata.csv", csv.join("\n"));

            // compress
            setBtn("Compressing...", true);
            const content = await zip.generateAsync({ type: "blob" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(content);
            a.download = `${rootName}.zip`;
            a.click();
            URL.revokeObjectURL(a.href);

            showConfirmationModal(stats);

        } catch (err) {
            alert("Master Export Failed: " + err.message);
        } finally {
            setBtn("★ FULL EXPORT PACKAGE", false);
        }
    }

    function updateTitleManually() {
        const newTitle = prompt("Enter custom session title for export:", STATE.pageTitle);
        if (newTitle && newTitle.trim()) {
            STATE.pageTitle = newTitle.trim();
            updateUIForPageType(); // Re-render headers
        }
    }

    function createSidebar() {
        if (document.getElementById('sp-sidebar')) return;

        const sidebar = document.createElement('div');
        sidebar.id = 'sp-sidebar';
        sidebar.style.cssText = `
            position: fixed; top: 0; right: -420px; width: 400px; height: 100vh;
            background: #0d0d0d; border-left: 1px solid #333; z-index: 2147483647;
            display: flex; flex-direction: column; font-family: 'Inter', system-ui, sans-serif;
            color: #fff; transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: -20px 0 50px rgba(0,0,0,0.7);
        `;

        sidebar.innerHTML = `
            <div style="padding: 20px; border-bottom: 1px solid #222; display:flex; justify-content:space-between; align-items:center; background: #111;">
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <h1 style="margin:0; font-size:16px; font-weight:700;">Producer.ai Toolsuite</h1>
                    <div style="font-size:11px; color:#aaa; font-weight:600; margin-top:2px;">Release Build v1.0 | Production v3.9</div>
                    <div style="font-size:11px; color:#888; display:flex; align-items:center; gap:6px; margin-top:2px;">
                        <span>💳</span> <span id="sp-credits-text" style="color:#fff; font-family:monospace;">${STATE.credits} CR</span>
                    </div>
                </div>
                <button id="sp-close-btn" style="background:transparent; border:none; color:#666; font-size:24px; cursor:pointer;">&times;</button>
            </div>

            <div style="padding: 12px; border-bottom: 1px solid #333; background: #151515;">
                <button id="sp-run-master-export" style="
                    width:100%; padding:14px; background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); 
                    color:#1a1a1a; font-weight:900; border:none; border-radius:4px; cursor:pointer; 
                    box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3); font-size:13px; letter-spacing:0.5px;
                    display:flex; align-items:center; justify-content:center; gap:8px;
                    text-transform: uppercase;
                ">
                    <span>★ FULL EXPORT PACKAGE</span>
                </button>
                <div style="text-align:center; font-size:10px; color:#bbb; margin-top:6px; font-weight:600; letter-spacing:0.5px;">WAVs • Metadata • Lyrics • Chat Logs</div>
            </div>

            <div style="display:flex; border-bottom: 1px solid #222; background: #0d0d0d;">
                <button class="sp-tab-btn active" data-tab="download" style="flex:1; padding:12px; background:transparent; border:none; color:#fff; border-bottom:2px solid #fff; cursor:pointer; font-weight:600; text-transform:uppercase; font-size:12px;">AUDIO</button>
                <button class="sp-tab-btn" data-tab="export" style="flex:1; padding:12px; background:transparent; border:none; color:#666; border-bottom:2px solid transparent; cursor:pointer; font-weight:600; text-transform:uppercase; font-size:12px;">METADATA</button>
            </div>

            <div id="sp-tab-content-download" class="sp-tab-content" style="flex:1; overflow-y:auto; padding:20px;"></div>
            <div id="sp-tab-content-export" class="sp-tab-content" style="display:none; flex:1; overflow-y:auto; padding:20px;"></div>

            <div id="sp-footer" style="padding: 16px; border-top: 1px solid #222; background: #111; font-size: 11px; color: #666;">
                <div id="sp-status-bar" style="display:none;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                         <span id="sp-status-text">Processing...</span>
                         <span id="sp-status-count">0/0</span>
                    </div>
                    <div style="height:4px; background:#222; border-radius:2px; overflow:hidden;">
                        <div id="sp-progress-fill" style="width:0%; height:100%; background:#fff; transition:width 0.3s;"></div>
                    </div>
                </div>
                <div id="sp-footer-idle" style="text-align:center;">Ready</div>
            </div>
        `;

        document.body.appendChild(sidebar);

        sidebar.querySelector('#sp-close-btn').onclick = closeSidebar;
        sidebar.querySelectorAll('.sp-tab-btn').forEach(btn => {
            btn.onclick = () => {
                sidebar.querySelectorAll('.sp-tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.color = '#666';
                    b.style.borderBottom = '2px solid transparent';
                });
                sidebar.querySelectorAll('.sp-tab-content').forEach(c => c.style.display = 'none');

                btn.classList.add('active');
                btn.style.color = '#fff';
                btn.style.borderBottom = '2px solid #fff';

                document.getElementById(`sp-tab-content-${btn.dataset.tab}`).style.display = 'block';
            };
        });

        // Event Delegation for dynamic buttons
        sidebar.addEventListener('click', (e) => {
            if (e.target) {
                if (e.target.id === 'sp-run-export') handleExport(e);
                if (e.target.id === 'sp-run-master-export' || e.target.parentElement?.id === 'sp-run-master-export') handleMasterExport(e);
                if (e.target.id === 'sp-edit-title-btn') updateTitleManually();
            }
        });
    }

    // --- Helper for truncating text ---
    function truncate(text, length) {
        if (text.length <= length) return text;
        return text.substring(0, length) + '...';
    }

    function updateUIForPageType() {
        const dlContainer = document.getElementById('sp-tab-content-download');
        const exContainer = document.getElementById('sp-tab-content-export');
        const sidebar = document.getElementById('sp-sidebar');

        // only update if sidebar is actually present
        if (!sidebar) return;

        if (dlContainer) dlContainer.innerHTML = renderDownloadTab();
        if (exContainer) exContainer.innerHTML = renderMetadataTab();

        // re-attach listeners
        const dlBtn = document.getElementById('sp-start-download');
        if (dlBtn) dlBtn.onclick = handleDownload;

        const stemsBtn = document.getElementById('sp-dl-stems-btn');
        if (stemsBtn) stemsBtn.onclick = handleStemsDownload;

        const modeSelect = document.getElementById('sp-dl-mode');
        if (modeSelect) {
            modeSelect.onchange = () => {
                const warn = document.getElementById('sp-dl-warning');
                if (modeSelect.value === 'all') {
                    warn.style.display = 'block';
                    warn.innerText = "⚠️ Warning: Downloads ALL visible items. Use with caution.";
                } else {
                    warn.style.display = 'none';
                }
            };
        }
    }

    // --- Helper for consistent header ---
    function renderPageHeader() {
        return `
            <div style="margin-bottom:24px;">
                <div style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:600; color:#fff; padding:12px; border:1px solid #333; border-radius:4px; background:#1a1a1a;">
                    <div style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${STATE.pageTitle}">${STATE.pageTitle}</div>
                    <button id="sp-edit-title-btn" style="background:transparent; border:none; color:#666; cursor:pointer; padding:4px;" title="Rename Session">
                        ✎
                    </button>
                </div>
            </div>
        `;
    }

    function renderDownloadTab() {
        const isLibrary = STATE.pageType === 'library';
        const isPlaylist = STATE.pageType === 'playlist';
        const isSession = STATE.pageType === 'session';

        // count visible songs for "all visible" logic (deduplicated)
        const songRows = Array.from(document.querySelectorAll('div[role="button"][aria-label^="Open details for"]'));
        const seenIds = new Set();
        let visibleSongs = 0;

        songRows.forEach(row => {
            try {
                const link = row.querySelector('a[href^="/song/"]');
                if (link) {
                    const id = link.getAttribute('href').split('/').pop();
                    if (!seenIds.has(id)) {
                        seenIds.add(id);
                        visibleSongs++;
                    }
                }
            } catch (e) { }
        });

        // define options with validity
        const options = [
            { id: 'session', label: `Full Session (${visibleSongs})`, valid: isSession, suffix: '(Session Page Only)' },
            { id: 'playlist', label: `Full Playlist (${visibleSongs})`, valid: isPlaylist, suffix: '(Playlist Page Only)' },
            { id: 'song', label: `Current Song`, valid: STATE.pageType === 'song', suffix: '(Song Page Only)' },
            { id: 'all', label: `All Visible Songs (${visibleSongs})`, valid: isLibrary, suffix: '(My Songs Page Only)' },
            { id: 'selected', label: `Selected Songs Only`, valid: isLibrary, suffix: '(My Songs Page Only)' }
        ];

        // sort: valid first
        options.sort((a, b) => b.valid - a.valid);

        let optionsHtml = '';
        let firstValidSelected = false;

        options.forEach(opt => {
            if (opt.valid) {
                const selected = !firstValidSelected ? 'selected' : '';
                optionsHtml += `<option value="${opt.id}" ${selected}>${opt.label}</option>`;
                firstValidSelected = true;
            } else {
                // clean label for disabled state
                let cleanLabel = opt.label.split('(')[0].trim();
                optionsHtml += `<option value="${opt.id}" disabled>${cleanLabel} ${opt.suffix}</option>`;
            }
        });

        // organization
        let safeTitle = (STATE.pageTitle || "Smart_Folder").replace(/"/g, '&quot;');

        let smartText = "Smart (Auto-Name)";
        if (isSession || isPlaylist) {
            smartText = `Smart (${truncate(safeTitle, 25)})`;
        } else if (isLibrary) {
            smartText = "Smart (My Songs)";
        }

        let orgOptions = `
            <option value="default">Downloads (Default)</option>
            <option value="smart" selected>${smartText}</option>
            <option value="generic">Timestamp</option>
        `;

        return `
            ${renderPageHeader()}

            <div style="margin-bottom:20px;">
                <label style="display:block; font-size:10px; color:#666; margin-bottom:8px; font-weight:600; letter-spacing:0.5px;">FOCUS MODE</label>
                <select id="sp-dl-mode" style="width:100%; background:#1a1a1a; color:#fff; border:1px solid #333; padding:10px; border-radius:4px; outline:none; font-size:13px;">
                    ${optionsHtml}
                </select>
                <div id="sp-dl-warning" style="display:none; font-size:10px; color:#ffcc00; margin-top:6px; background:#332b00; padding:6px; border-radius:4px;"></div>
            </div>

            <div style="display:flex; gap:10px; margin-bottom:20px;">
                <div style="flex:1;">
                    <label style="display:block; font-size:10px; color:#666; margin-bottom:8px; font-weight:600; letter-spacing:0.5px;">AUDIO FORMAT</label>
                    <select id="sp-dl-format" style="width:100%; background:#1a1a1a; color:#fff; border:1px solid #333; padding:10px; border-radius:4px; outline:none; font-size:13px;">
                        <option value="original">WAV (Lossless)</option>
                        <option value="mp3">MP3 (320kbps)</option>
                        <option value="m4a">M4A</option>
                    </select>
                </div>
                <div style="flex:1;">
                    <label style="display:block; font-size:10px; color:#666; margin-bottom:8px; font-weight:600; letter-spacing:0.5px;">DELIVERY</label>
                    <select id="sp-dl-delivery" style="width:100%; background:#1a1a1a; color:#fff; border:1px solid #333; padding:10px; border-radius:4px; outline:none; font-size:13px;">
                        <option value="individual">Individual Files</option>
                        <option value="zip">Zip Archive</option>
                    </select>
                </div>
            </div>

            <div style="margin-bottom:20px;">
                <label style="display:block; font-size:10px; color:#666; margin-bottom:8px; font-weight:600; letter-spacing:0.5px;">ORGANIZATION</label>
                <select id="sp-dl-folder" style="width:100%; background:#1a1a1a; color:#fff; border:1px solid #333; padding:10px; border-radius:4px; outline:none; font-size:13px;">
                    ${orgOptions}
                </select>
            </div>

            <button id="sp-start-download" style="
                width:100%; padding:14px; background:#fff; color:#000; font-weight:700;
                border:none; border-radius:4px; cursor:pointer; text-transform:uppercase; margin-top:4px;
                transition: background 0.2s;
            " onmouseover="this.style.background='#e0e0e0'" onmouseout="this.style.background='#fff'">EXPORT AUDIO</button>

            <!-- Stems Section -->
            <div style="margin-top:30px; padding-top:20px; border-top:1px solid #222;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <label style="font-size:11px; font-weight:700; color:#888;">STEMS</label>
                    <select id="sp-stem-type" style="background:#111; color:#aaa; border:1px solid #333; padding:4px 8px; border-radius:4px; font-size:11px; outline:none;">
                        <option value="zip">Zipped Package</option>
                        <option value="folder">Individual Files</option>
                    </select>
                </div>
                <button id="sp-dl-stems-btn" style="
                    width:100%; padding:10px; background:#1a1a1a; color:#ccc; font-weight:600; font-size:12px;
                    border:1px solid #333; border-radius:4px; cursor:pointer; 
                    transition: all 0.2s;
                " onmouseover="this.style.borderColor='#555';this.style.color='#fff'" onmouseout="this.style.borderColor='#333';this.style.color='#ccc'">Download Stems</button>
            </div>
        `;
    }

    function renderMetadataTab() {
        const isPageSession = STATE.pageType === 'session';
        const isPagePlaylist = STATE.pageType === 'playlist';
        const isPageSong = window.location.pathname.startsWith('/song/');

        let contentHtml = "";

        if (isPageSong) {
            contentHtml = `
                <div style="margin-bottom:15px; font-size:12px; color:#aaa;">Single Song Export</div>
                <div style="margin-bottom:20px;">
                    <label style="display:block; margin-bottom:8px; cursor:pointer;">
                        <input type="radio" name="sp-exp-format" value="json" checked> JSON Format
                    </label>
                    <label style="display:block; cursor:pointer;">
                        <input type="radio" name="sp-exp-format" value="txt"> Text Format
                    </label>
                </div>
                <div style="font-size:11px; color:#666; margin-bottom:20px;">Exports track metadata only.</div>
            `;
        } else if (isPagePlaylist) {
            contentHtml = `
                <div style="margin-bottom:15px; font-size:12px; color:#aaa;">Playlist Export</div>
                <div style="margin-bottom:20px;">
                     <label style="display:block; margin-bottom:8px; cursor:pointer;">
                        <input type="radio" name="sp-exp-format" value="json" checked> JSON Format
                    </label>
                    <label style="display:block; cursor:pointer;">
                        <input type="radio" name="sp-exp-format" value="csv"> CSV Format
                    </label>
                </div>
                <div style="font-size:11px; color:#666; margin-bottom:20px;">Exports metadata for all tracks in playlist.</div>
            `;
        } else if (isPageSession) {
            contentHtml = `
                <div style="margin-bottom:15px; font-size:12px; color:#aaa;">Full Session Export</div>
                <div style="margin-bottom:20px; background:#111; padding:10px; border-radius:4px; border:1px solid #333;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <input type="checkbox" checked disabled> 
                        <span style="color:#fff;">All Session Data</span>
                    </div>
                    <ul style="margin:0; padding-left:24px; color:#888; font-size:11px;">
                        <li>Metadata (CSV & JSON)</li>
                        <li>Chat Logs (Separated & Raw)</li>
                    </ul>
                </div>
            `;
        } else {
            return `<div style="padding:20px; color:#666; text-align:center;">Open a Session, Playlist, or Song to use this tool.</div>`;
        }

        return `
            ${renderPageHeader()}
            ${contentHtml}
            <button id="sp-run-export" style="width:100%; padding:14px; background:#fff; color:#000; font-weight:700; border:none; border-radius:4px; cursor:pointer;">EXPORT METADATA</button>
        `;
    }

    // --- MISSING HANDLERS RESTORED ---

    async function handleDownload(e) {
        if (e) e.preventDefault();
        const btn = document.getElementById('sp-start-download');
        const setBtn = (t, d) => { if (btn) { btn.innerText = t; btn.disabled = d; } };

        if (typeof JSZip === 'undefined') { alert("JSZip missing. Reload page."); return; }

        const mode = document.getElementById('sp-dl-mode')?.value || 'all';
        const format = document.getElementById('sp-dl-format')?.value || 'mp3';
        const delivery = document.getElementById('sp-dl-delivery')?.value || 'zip';

        setBtn("Scanning...", true);

        try {
            let songs = [];

            // 1. Identification
            if (mode === 'song') {
                const uuid = window.location.pathname.split('/').pop();
                songs.push({ uuid, element: document.body });
            } else {
                // List scraping (reusing robust logic)
                const songRows = Array.from(document.querySelectorAll('div[role="button"][aria-label^="Open details for"]'));
                const seen = new Set();
                songRows.forEach(row => {
                    try {
                        const link = row.querySelector('a[href^="/song/"]');
                        if (link) {
                            const uuid = link.getAttribute('href').split('/').pop();
                            if (!seen.has(uuid)) {
                                seen.add(uuid);
                                songs.push({ uuid, element: row });
                            }
                        }
                    } catch (e) { }
                });
            }

            if (songs.length === 0) throw new Error("No songs found.");

            // Filter for 'selected' mode would go here if we implemented checkbox tracking
            // For now 'all visible' is the main bulk mode.

            // 2. Processing
            const zip = new JSZip();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const rootName = `${STATE.pageTitle}_Audio_${timestamp}`;
            const folder = zip.folder(rootName);

            let processed = 0;
            let success = 0;

            for (const item of songs) {
                processed++;
                setBtn(`Downloading ${processed}/${songs.length}...`, true);

                // Title
                let title = item.uuid;
                if (item.element) {
                    const aria = item.element.getAttribute('aria-label');
                    if (aria && aria.startsWith("Open details for ")) {
                        title = aria.replace("Open details for ", "").trim();
                    } else if (mode === 'song') {
                        // Attempt to find title on song page
                        const h1 = document.querySelector('h1');
                        if (h1) title = h1.innerText.trim();
                        else {
                            const display = document.querySelector('.font-display');
                            if (display) title = display.innerText.trim();
                        }
                    }
                }
                const safeName = title.replace(/[^a-z0-9-_ ]/gi, '').trim();

                // URL
                // We try to match what handleMasterExport does for consistency
                let audioUrl = `https://cdn1.producer.ai/${item.uuid}.mp3`;
                // If user wants wav, try wav
                if (format === 'original') audioUrl = `https://cdn1.producer.ai/${item.uuid}.wav`;

                try {
                    const resp = await fetch(audioUrl);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        const ext = (format === 'original') ? 'wav' : 'mp3';

                        if (delivery === 'zip') {
                            folder.file(`${safeName}.${ext}`, blob);
                        } else {
                            // Individual download
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = `${safeName}.${ext}`;
                            a.click();
                            URL.revokeObjectURL(a.href);
                        }
                        success++;
                    } else {
                        // Fallback: if wav failed, try mp3
                        if (format === 'original') {
                            const mp3Resp = await fetch(`https://cdn1.producer.ai/${item.uuid}.mp3`);
                            if (mp3Resp.ok) {
                                const blob = await mp3Resp.blob();
                                if (delivery === 'zip') folder.file(`${safeName}.mp3`, blob);
                                else {
                                    const a = document.createElement('a');
                                    a.href = URL.createObjectURL(blob);
                                    a.download = `${safeName}.mp3`;
                                    a.click();
                                }
                                success++;
                            }
                        }
                    }
                } catch (e) { }

                await new Promise(r => setTimeout(r, 100));
            }

            if (delivery === 'zip' && success > 0) {
                setBtn("Compressing...", true);
                const content = await zip.generateAsync({ type: "blob" });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(content);
                a.download = `${rootName}.zip`;
                a.click();
                URL.revokeObjectURL(a.href);
            }

            if (success === 0) throw new Error("No valid audio files could be downloaded.");

        } catch (err) {
            alert("Download Error: " + err.message);
        } finally {
            setBtn("EXPORT AUDIO", false);
        }
    }

    function handleStemsDownload() {
        alert("Stems download feature is coming soon!");
    }

    async function handleExport(e) {
        if (e) e.preventDefault();
        console.log("[sidebar] export started");

        // 0. check jszip
        if (typeof JSZip === 'undefined') {
            const msg = "JSZip library not loaded. Please reload the page.";
            alert(msg);
            console.error(msg);
            return;
        }

        const btn = document.getElementById('sp-run-export');
        const setBtn = (text, disabled) => {
            if (btn) {
                btn.innerText = text;
                btn.disabled = disabled;
            }
        };

        // Get user preference
        const formatInputs = document.querySelectorAll('input[name="sp-exp-format"]:checked');
        const selectedFormat = formatInputs.length > 0 ? formatInputs[0].value : 'json'; // default

        setBtn("Initializing...", true);

        try {
            const zip = new JSZip();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const rootName = `${STATE.pageTitle || 'Export'}_${timestamp}`;
            const dataFolder = zip.folder(rootName);

            const pageType = STATE.pageType;
            const pathname = window.location.pathname.replace(/\/+$/, '');
            const isSongLink = pathname.includes('/song/');

            let chatTextFormatted = "";
            let chatTextRaw = "";
            const lyricsMap = new Map();

            // --- SESSION SPECIFIC: Chat Logs ---
            if (pageType === 'session') {
                setBtn("Scraping Chat...", true);
                console.log("[sidebar] scraping chat...");

                // Identify chat container
                // We look for the scrolling container that holds the messages
                const chatContainer = document.querySelector('main .flex-col') || document.body;

                // Heuristic for messages: look for blocks with specific distinct styles
                // User messages often have 'flex-row-reverse' or specific background colors
                // Agent messages are usually left-aligned.
                // We'll try to find all message bubbles.

                const messageBlocks = Array.from(document.querySelectorAll('.group.w-full'));
                // .group.w-full is a common pattern for chat rows in these frameworks

                let log = "SESSION CHAT LOG\n=================\n\n";
                let raw = "";

                if (messageBlocks.length > 0) {
                    messageBlocks.forEach(block => {
                        const text = block.innerText;
                        raw += text + "\n\n";

                        // Attempt to detect role
                        // User usually has an avatar on the right or specific class
                        const isUser = block.querySelector('.flex-row-reverse') !== null || block.className.includes('justify-end');
                        const sender = isUser ? "USER" : "AGENT";

                        // Clean text (remove timestamps if possible, though innerText is usually okay)
                        const cleanText = text.replace(/You said:|Agent said:/g, '').trim();

                        log += `[${sender}]\n${cleanText}\n-----------------\n`;

                        // lyrics detection
                        const lower = text.toLowerCase();
                        if (lower.includes('[verse') || lower.includes('[chorus')) {
                            const snippet = text.substring(0, 30).replace(/\W/g, '_');
                            lyricsMap.set(`Lyrics_${snippet}`, text);
                        }
                    });
                } else {
                    // Fallback to simple text extraction if structure unknown
                    const allText = document.body.innerText;
                    raw = allText;
                    log = "Could not structurally parse chat. See raw log.";
                }

                chatTextFormatted = log;
                chatTextRaw = raw;

                dataFolder.file("chat_logs_formatted.txt", chatTextFormatted);
                dataFolder.file("chat_logs_raw.txt", chatTextRaw);
            }

            // --- SONG SCRAPING ---
            setBtn("Scraping Songs...", true);
            let songsToExport = [];

            if (isSongLink) {
                const uuid = pathname.split('/').pop();
                songsToExport.push({ uuid: uuid, element: document.body });
            } else {
                // List scraping logic
                // ... existing deduplication logic ...
                const songRows = Array.from(document.querySelectorAll('div[role="button"][aria-label^="Open details for"]'));
                songRows.forEach(row => {
                    try {
                        const link = row.querySelector('a[href^="/song/"]');
                        if (link) {
                            const href = link.getAttribute('href').replace(/\/+$/, '');
                            const uuid = href.split('/').pop();
                            songsToExport.push({ uuid, element: row });
                        }
                    } catch (e) { }
                });

                if (songsToExport.length === 0) {
                    // fallback strategy
                    const queries = document.querySelectorAll('a[href^="/song/"]');
                    queries.forEach(link => {
                        const href = link.getAttribute('href').replace(/\/+$/, '');
                        const uuid = href.split('/').pop();
                        const row = link.closest('div[role="button"]') || link.closest('li') || link.parentElement;
                        songsToExport.push({ uuid, element: row });
                    });
                }
            }

            // Deduplicate
            const uniqueSongs = [];
            const seen = new Set();
            songsToExport.forEach(s => {
                if (s.uuid && !seen.has(s.uuid)) {
                    seen.add(s.uuid);
                    uniqueSongs.push(s);
                }
            });

            // Metadata Collection Loop
            const metadataRecords = [];
            const lyricsFolder = dataFolder.folder("lyrics");

            // Add chat lyrics
            if (lyricsMap.size > 0) {
                lyricsMap.forEach((content, filename) => {
                    lyricsFolder.file(`${filename}.txt`, content);
                });
            }

            if (uniqueSongs.length > 0) {
                let processedCount = 0;

                for (const item of uniqueSongs) {
                    processedCount++;
                    setBtn(`Processing ${processedCount}/${uniqueSongs.length}...`, true);

                    try {
                        // --- 1. Scrape Basic Info (List Title) ---
                        let listTitle = "Untitled";
                        const el = item.element;
                        if (el) {
                            const ariaLabel = el.getAttribute('aria-label');
                            if (ariaLabel && ariaLabel.startsWith("Open details for ")) {
                                listTitle = ariaLabel.replace("Open details for ", "").trim();
                            }
                            if (listTitle === "Untitled" || listTitle === "") {
                                const h4 = el.querySelector('h4');
                                const bold = el.querySelector('.font-bold');
                                const truncate = el.querySelector('.truncate');
                                if (h4) listTitle = h4.innerText.trim();
                                else if (bold) listTitle = bold.innerText.trim();
                                else if (truncate) listTitle = truncate.innerText.trim();
                            }
                        }

                        // --- 2. Deep Fetch ---
                        const songUrl = `https://www.producer.ai/song/${item.uuid}`;
                        const resp = await fetch(songUrl);

                        let lyrics = "";
                        let sound = "";
                        let model = "unknown";
                        let deepTitle = "";

                        if (resp.ok) {
                            const htmlText = await resp.text();
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(htmlText, 'text/html');

                            // Extraction
                            const h1 = doc.querySelector('h1');
                            if (h1) deepTitle = h1.innerText.trim();

                            const tagNodes = doc.querySelectorAll('.text-xs.bg-bg-3, a[href^="/?tags="]');
                            const tags = [];
                            tagNodes.forEach(t => { const txt = t.innerText.trim(); if (txt) tags.push(txt); });
                            sound = tags.join(', ');

                            const fullText = doc.body.innerText;
                            if (fullText.includes("v3.5")) model = "v3.5";
                            else if (fullText.includes("v3")) model = "v3";
                            else if (fullText.includes("v2")) model = "v2";

                            const lyricNodes = doc.querySelectorAll('.whitespace-pre-wrap');
                            let maxLen = 0;
                            lyricNodes.forEach(node => {
                                const txt = node.innerText;
                                if (txt.length > maxLen && (txt.includes('[') || txt.length > 50)) {
                                    maxLen = txt.length;
                                    lyrics = txt;
                                }
                            });

                            // Hydration Fallback
                            if (!lyrics || model === "unknown") {
                                const script = doc.getElementById('__NEXT_DATA__');
                                if (script) {
                                    try {
                                        const json = JSON.parse(script.innerText);
                                        const pageProps = json.props.pageProps;
                                        const songData = pageProps.song || pageProps.clip;
                                        if (songData) {
                                            if (songData.metadata?.prompt) lyrics = songData.metadata.prompt;
                                            if (songData.metadata?.tags) sound = songData.metadata.tags;
                                            if (songData.major_model_version) model = `${songData.major_model_version}`;
                                            if (songData.title) deepTitle = songData.title;
                                        }
                                    } catch (e) { }
                                }
                            }
                        }

                        const finalTitle = (listTitle !== "Untitled" && listTitle !== "") ? listTitle : (deepTitle || "Untitled");

                        // Save Lyrics
                        if (lyrics) {
                            const safeTitle = finalTitle.replace(/[^a-z0-9]/gi, '_').substring(0, 40);
                            lyricsFolder.file(`${safeTitle}_${item.uuid}.txt`, lyrics);
                        }

                        const record = {
                            songUUID: item.uuid,
                            songTitle: finalTitle,
                            sound: sound,
                            model: model,
                            playlistURL: (pageType === 'playlist') ? window.location.href : "",
                            songURL: songUrl,
                            hasLyrics: !!lyrics
                        };

                        metadataRecords.push(record);
                        await new Promise(r => setTimeout(r, 200));

                    } catch (errLoop) {
                        console.error("Error processing song", item, errLoop);
                        metadataRecords.push({ songUUID: item.uuid, songTitle: "Error", error: errLoop.message });
                    }
                } // end loop
            }

            // --- EXPORT FORMATTING ---

            // 1. Single Song Export (Song Page)
            if (isSongLink) {
                if (metadataRecords.length > 0) {
                    const rec = metadataRecords[0];
                    if (selectedFormat === 'json') {
                        dataFolder.file(`${rec.songTitle}_metadata.json`, JSON.stringify(rec, null, 2));
                    } else { // txt
                        const txtContent = `Title: ${rec.songTitle}\nUUID: ${rec.songUUID}\nModel: ${rec.model}\nStyle: ${rec.sound}\nURL: ${rec.songURL}\n`;
                        dataFolder.file(`${rec.songTitle}_metadata.txt`, txtContent);
                    }
                }
            }
            // 2. Playlist Export
            else if (pageType === 'playlist') {
                if (metadataRecords.length > 0) {
                    if (selectedFormat === 'json') {
                        dataFolder.file("playlist_metadata.json", JSON.stringify(metadataRecords, null, 2));
                    } else { // csv
                        const header = ["Title", "UUID", "Style", "Model", "URL"];
                        const rows = [header.join(",")];
                        metadataRecords.forEach(r => {
                            rows.push(`"${r.songTitle}","${r.songUUID}","${r.sound}","${r.model}","${r.songURL}"`);
                        });
                        dataFolder.file("playlist_metadata.csv", rows.join("\n"));
                    }
                }
            }
            // 3. Session Export (All options)
            else if (pageType === 'session') {
                if (metadataRecords.length > 0) {
                    // JSON
                    dataFolder.file("session_metadata.json", JSON.stringify(metadataRecords, null, 2));
                    // CSV
                    const header = ["Title", "UUID", "Style", "Model", "URL"];
                    const rows = [header.join(",")];
                    metadataRecords.forEach(r => {
                        rows.push(`"${r.songTitle}","${r.songUUID}","${r.sound}","${r.model}","${r.songURL}"`);
                    });
                    dataFolder.file("session_metadata.csv", rows.join("\n"));
                }
            }

            // generate zip
            setBtn("Compressing...", true);
            const content = await zip.generateAsync({ type: "blob" });
            const aa = document.createElement("a");
            aa.href = URL.createObjectURL(content);
            aa.download = `${rootName}.zip`;
            aa.click();
            URL.revokeObjectURL(aa.href);

        } catch (err) {
            console.error("[sidebar] export failed", err);
            alert("Export failed: " + err.message);
        } finally {
            setBtn(`Export Metadata`, false);
        }
    }

    function extractPageTitle() {
        try {
            // User-provided selector for session sidebar item
            const userSel = '.flex.items-center.gap-2.overflow-hidden.p-2.transition-colors.hover\\:bg-bg-2.data-\\[state\\=open\\]\\:bg-bg-2.cursor-pointer.rounded';
            const sessionNameEl = document.querySelector(userSel);
            if (sessionNameEl) {
                return sessionNameEl.innerText.trim();
            }
        } catch (e) { }

        const displayTitle = document.querySelector('.font-display') || document.querySelector('div[role="textbox"]');
        if (displayTitle) return displayTitle.innerText.trim();

        const h1 = document.querySelector('h1');
        if (h1) return h1.innerText.trim();

        if (document.title && !document.title.includes('Producer.ai')) {
            return document.title;
        }

        return "Producer_Session";
    }

    function analyzePage() {
        const path = window.location.pathname;
        let title = "Untitled";

        // force update detection
        STATE.pageType = 'unknown';

        // 1. identify page type strict
        if (path.includes('/library/my-songs')) {
            STATE.pageType = 'library';
            title = "My Songs";
        } else if (path.includes('/session/')) {
            STATE.pageType = 'session';
        } else if (path.includes('/song/')) {
            STATE.pageType = 'song';
            title = "Song";
        } else if (path.includes('/playlist/')) {
            STATE.pageType = 'playlist';
        } else {
            STATE.pageType = 'other';
        }

        // 2. scrape title (if not already set)
        if (title === "Untitled") {
            // unified strategy (restoring logic that worked for playlists)
            // search for .font-display (headers) or editable titles
            const displayTitle = document.querySelector('.font-display') || document.querySelector('div[role="textbox"]');
            title = extractPageTitle();
        }

        // 3. clean up common prefixes/suffixes & fallbacks
        if (title.startsWith("Producer.ai") || title === "Toolsuite") {
            const prefix = STATE.pageType === 'playlist' ? 'Playlist_' : 'Session_';
            title = prefix + new Date().getTime().toString().slice(-6);
        }

        STATE.pageTitle = title.replace(/[\/\\:*?"<>|]/g, '_');
    }

    function truncate(str, n) {
        return (str.length > n) ? str.substr(0, n - 1) + '...' : str;
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

    initCredits();

    // live update (spa navigation)
    setInterval(() => {
        const currentPath = window.location.pathname;
        if (currentPath !== STATE.lastPath) {
            STATE.lastPath = currentPath;
            analyzePage();
            // if sidebar is open, refresh ui
            const sidebar = document.getElementById('sp-sidebar');
            if (sidebar && sidebar.style.right === '0px') {
                updateUIForPageType();
            }
        }

        // also periodically check for song loading if in focus mode ui
        if (STATE.isOpen) {
            // check for changes in visible count
            const songRows = document.querySelectorAll('div[role="button"][aria-label^="Open details for"]');

            // simple check: if raw count changes drastically, update.
            // (we don't want to run full dedup every 500ms if not needed)
            if (window._lastRawCount !== songRows.length) {
                window._lastRawCount = songRows.length;
                updateUIForPageType();
            }
        }

    }, 1000);

})();
