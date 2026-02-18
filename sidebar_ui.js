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

    // --- Core Auth Helper (Single Definition) ---
    function getAuthToken() {
        try {
            const cookies = document.cookie.split('; ');
            const authCookies = cookies.filter(c => c.trim().startsWith('sb-api-auth-token.'));
            if (authCookies.length === 0) return null;
            authCookies.sort();
            const fullValue = authCookies.map(c => c.split('=')[1]).join('');
            const cleanValue = fullValue.replace('base64-', '');
            const sessionData = JSON.parse(atob(cleanValue));
            return sessionData.access_token;
        } catch (e) { return null; }
    }

    // --- Core Audio Fetch Helper (Handles JSON Redirects) ---
    async function fetchAudioBlob(uuid, format, token) {
        // Adjust format for API if needed (e.g. 'original' -> 'wav')
        const fmt = format === 'original' ? 'wav' : format;
        const apiBase = `https://www.producer.ai/__api/${uuid}/download?format=${fmt}`;

        const resp = await fetch(apiBase, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) throw new Error(`API Status ${resp.status}`);

        const type = resp.headers.get('content-type');
        if (type && type.includes('application/json')) {
            // User reported downloading JSON files instead of WAVs. 
            // This handles the signed-URL redirect pattern.
            const data = await resp.json();
            if (data.url) {
                // If it's a signed URL, fetch IT to get the actual blob
                const redirectResp = await fetch(data.url);
                if (!redirectResp.ok) throw new Error(`Redirect Status ${redirectResp.status}`);
                return await redirectResp.blob();
            }
        }
        return await resp.blob();
    }

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
                const candidates = document.querySelectorAll('.flex.items-center.justify-between.cursor-pointer');
                for (const node of candidates) {
                    if (node.className.includes('data-highlighted:bg-bg-2') && node.className.includes('text-fg-1')) {
                        if (node.innerText.toLowerCase().includes('credits')) {
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

    // --- Helper for single file download ---
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
        console.log("ANTIGRAVITY: handleMasterExport V4.0 STARTED"); // VERSION MARKER
        const setBtn = (txt, dis) => { if (btn) { btn.innerText = txt; btn.disabled = dis; } };

        setBtn("Initializing V4.0...", true); // VISIBLE VERSION MARKER

        // CONFIGURATION
        const BATCH_SIZE = 50;
        const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds

        let stats = { total: 0, success: 0, failed: 0 };
        const allMetadata = []; // Accumulate metadata across batches

        try {
            STATE.pageTitle = extractPageTitle(); // Refresh title
            updateUIForPageType();

            const token = getAuthToken();
            if (!token) throw new Error("Not authenticated. Please refresh.");

            // --- 1. IDENTIFY SONGS (Global) ---
            const uniqueSongs = [];
            const seen = new Set();
            const pathname = window.location.pathname;
            const isSongPage = pathname.includes('/song/');

            if (isSongPage) {
                // SONG PAGE: STRICTLY export only the current song.
                // Do NOT scan for other links to avoid "More from" sidebar leaks.
                const segments = pathname.replace(/\/+$/, '').split('/');
                const uuid = segments[segments.indexOf('song') + 1];

                if (uuid) {
                    uniqueSongs.push({ uuid, element: document.body });
                } else {
                    throw new Error("Could not identify Song UUID from URL.");
                }
            } else {
                // LIST PAGES (Session/Playlist): Export all listed songs
                const songRows = Array.from(document.querySelectorAll('div[role="button"][aria-label^="Open details for"]'));
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

                // Fallback for lists if main rows fail
                if (uniqueSongs.length === 0) {
                    const queries = document.querySelectorAll('a[href^="/song/"]');
                    queries.forEach(link => {
                        const href = link.getAttribute('href').replace(/\/+$/, '');
                        const uuid = href.split('/').pop();
                        if (!seen.has(uuid)) {
                            seen.add(uuid);
                            uniqueSongs.push({ uuid, element: link.closest('div') || document.body });
                        }
                    });
                }
            }

            if (uniqueSongs.length === 0) throw new Error("No songs found to export.");
            stats.total = uniqueSongs.length;

            // --- 2. BATCH PROCESSING ---
            const BATCH_SIZE = 50;
            const totalBatches = Math.ceil(uniqueSongs.length / BATCH_SIZE);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const safeSessionTitle = (STATE.pageTitle || "Export").replace(/[^a-z0-9-_]/gi, '_');

            // --- GLOBAL IMAGE DEDUPLICATION ---
            const processedImageUrls = new Set();
            let mainSessionArtUrl = "";

            for (let i = 0; i < totalBatches; i++) {
                const batchNum = i + 1;
                const start = i * BATCH_SIZE;
                const end = Math.min(start + BATCH_SIZE, uniqueSongs.length);
                const batchSongs = uniqueSongs.slice(start, end);

                setBtn(`Batch ${batchNum}/${totalBatches} (${start + 1}-${end})...`, true);

                const zip = new JSZip();
                // Only append Part info if we actually have multiple parts
                let partName = `${safeSessionTitle}_${timestamp}`;
                if (totalBatches > 1) {
                    partName = `${safeSessionTitle}_Part${batchNum}_of_${totalBatches}_${timestamp}`;
                }

                const rootFolder = zip.folder(partName);

                const audioFolder = rootFolder.folder("Audio");
                const lyricsFolder = rootFolder.folder("Lyrics");

                // Folders for Art (Conditioned)
                const coverFolder = rootFolder.folder("Cover_Art");
                const altFolder = rootFolder.folder("Alt_Art");

                // --- BATCH 1 EXTRAS: Images & Chat ---
                if (i === 0) {
                    const chatFolder = rootFolder.folder("Chat_Logs");

                    // 1. Chat Logs
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

                    // 2. Images (Session Scan)
                    // This logic finds ALL images loosely matching generations in the DOM
                    const images = Array.from(document.querySelectorAll('img')).filter(img => {
                        const src = img.src || "";
                        return src.includes('image_') || src.includes('generated') || src.includes('storage.googleapis.com');
                    });
                    const uniqueImgUrls = [...new Set(images.map(i => i.src))];

                    // Main Art Detection (Largest Area)
                    let maxArea = 0;
                    images.forEach(img => {
                        const rect = img.getBoundingClientRect();
                        const area = rect.width * rect.height;
                        if (area > maxArea && area > 10000) {
                            maxArea = area;
                            mainSessionArtUrl = img.src;
                        }
                    });

                    // Fallback Main Art
                    if (!mainSessionArtUrl && uniqueImgUrls.length > 0) mainSessionArtUrl = uniqueImgUrls[0];

                    // --- DOWNLOAD MAIN COVER ART (ONCE) ---
                    if (mainSessionArtUrl) {
                        try {
                            const resp = await fetch(mainSessionArtUrl);
                            if (resp.ok) {
                                const blob = await resp.blob();
                                const type = blob.type.split('/')[1] || 'jpg';
                                coverFolder.file(`Session_Cover.${type}`, blob);
                                processedImageUrls.add(mainSessionArtUrl); // MARK AS PROCESSED
                            }
                        } catch (e) { }
                    }

                    // --- DOWNLOAD ALT ART ---
                    const otherImages = uniqueImgUrls.filter(u => u !== mainSessionArtUrl);
                    let imgCount = 0;
                    for (const url of otherImages) {
                        if (processedImageUrls.has(url)) continue; // Skip if already done (unlikely here but safe)
                        try {
                            const r = await fetch(url);
                            if (r.ok) {
                                const b = await r.blob();
                                const t = b.type.split('/')[1] || 'jpg';
                                altFolder.file(`Alt_Gen_${++imgCount}.${t}`, b);
                                processedImageUrls.add(url);
                            }
                        } catch (e) { }
                    }
                }

                // --- PROCESS SONGS IN BATCH ---
                for (const item of batchSongs) {
                    setBtn(`Batch ${batchNum}: Song ${allMetadata.length + 1}/${uniqueSongs.length}...`, true);

                    // Title Extraction (Legacy List View)
                    let listTitle = "Untitled";
                    // Only use list title if we are NOT on a song page, to avoid cross-contamination
                    if (!isSongPage && item.element && item.element !== document.body) {
                        const aria = item.element.getAttribute('aria-label');
                        if (aria && aria.startsWith("Open details for ")) listTitle = aria.replace("Open details for ", "").trim();
                        else {
                            const h4 = item.element.querySelector('h4');
                            if (h4) listTitle = h4.innerText.trim();
                        }
                    }

                    // Fetch Song Metadata
                    // Fetch Song Metadata
                    const songUrl = `https://www.producer.ai/song/${item.uuid}`;
                    let lyrics = "";
                    let sound = "";
                    let model = "unknown";
                    let deepTitle = "";
                    let neg_prompt = "";
                    let coverUrl = "";

                    try {
                        const resp = await fetch(songUrl, { headers: { 'Authorization': `Bearer ${token}` } });
                        if (resp.ok) {
                            const htmlText = await resp.text();
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(htmlText, 'text/html');

                            // --- 1. HYDRATION DATA (Primary Source) ---
                            // This is the most reliable source for everything
                            const script = doc.getElementById('__NEXT_DATA__');
                            let hydrationData = null;
                            if (script) {
                                try {
                                    const json = JSON.parse(script.innerText);

                                    // 1. Try standard pageProps
                                    if (json.props?.pageProps?.song) hydrationData = json.props.pageProps.song;
                                    else if (json.props?.pageProps?.clip) hydrationData = json.props.pageProps.clip;

                                    // 2. Try SDC Query Cache (Deep Search via UUID)
                                    // This is robust against schema changes (song vs riff vs unknown)
                                    if (!hydrationData && json.props?.sdc?.queryClient?.queries) {
                                        const queries = json.props.sdc.queryClient.queries;
                                        const targetUuid = item.uuid;

                                        // Find query that contains our UUID in its hash OR data
                                        const foundQuery = queries.find(q => {
                                            // Check query key/hash
                                            if (JSON.stringify(q.queryKey).includes(targetUuid)) return true;

                                            // Check data ID
                                            const d = q.state?.data;
                                            if (d) {
                                                // Direct ID match
                                                if (d.id === targetUuid) return true;
                                                // Nested ID match (riff/song/clip wrapper)
                                                if ((d.riff?.id === targetUuid) || (d.song?.id === targetUuid) || (d.clip?.id === targetUuid)) return true;
                                            }
                                            return false;
                                        });

                                        if (foundQuery) {
                                            const d = foundQuery.state.data;
                                            if (d.id === targetUuid) hydrationData = d;
                                            else hydrationData = d.riff || d.song || d.clip || d; // Fallback to whatever object holds the data
                                        }
                                    }

                                    if (hydrationData) {
                                        if (hydrationData.title) deepTitle = hydrationData.title;

                                        // Model Mapping
                                        if (hydrationData.model_display_name) model = hydrationData.model_display_name;
                                        else if (hydrationData.major_model_version) model = `${hydrationData.major_model_version}`;

                                        // Metadata Mapping
                                        // 1. Lyrics / Prompt
                                        if (hydrationData.metadata?.prompt) lyrics = hydrationData.metadata.prompt;
                                        else if (hydrationData.prompt) lyrics = hydrationData.prompt;

                                        // 2. Sound Description (Tags)
                                        if (hydrationData.metadata?.tags) sound = hydrationData.metadata.tags;
                                        else if (hydrationData.tags) sound = hydrationData.tags;
                                        if (!sound && hydrationData.sound) sound = hydrationData.sound;

                                        // 3. Negative Prompt (Strict String)
                                        if (hydrationData.metadata?.negative_prompt) neg_prompt = hydrationData.metadata.negative_prompt;
                                        else if (hydrationData.metadata?.neg_prompt) neg_prompt = hydrationData.metadata.neg_prompt;

                                        // 4. Other Fields
                                        var vibe_input = hydrationData.metadata?.vibe_input || null;
                                        var voice_input = hydrationData.metadata?.voice_input || null;
                                        var strength = hydrationData.metadata?.strength || null;

                                        // 5. Fallback Lyrics
                                        if (!lyrics && hydrationData.lyrics) lyrics = hydrationData.lyrics;
                                    }
                                } catch (e) { console.error("Hydration parse error", e); }
                            }

                            // --- 2. DOM FALLBACKS (If Hydration Failed) ---
                            // CLEANUP: Case-insensitive removal of sidebar
                            const sidebars = doc.querySelectorAll('div, aside, section');
                            sidebars.forEach(el => {
                                if (el.innerText && /More from/i.test(el.innerText)) {
                                    el.remove();
                                }
                            });

                            // Title Fallback
                            if (!deepTitle) {
                                // 1. Primary: Role Textbox (most distinct)
                                const titleEl = doc.querySelector('div[role="textbox"][contenteditable="true"]');
                                if (titleEl && titleEl.innerText.trim()) deepTitle = titleEl.innerText.trim();

                                // 2. Secondary: H1
                                if (!deepTitle) {
                                    const h1 = doc.querySelector('h1');
                                    if (h1) deepTitle = h1.innerText.trim();
                                }
                            }
                            // Filter out generic titles (Robust)
                            if (deepTitle && (/Producer\.?ai/i.test(deepTitle) || /Toolsuite/i.test(deepTitle) || deepTitle === "Song")) {
                                deepTitle = "";
                            }

                            // Metadata Sections Fallback
                            const findSectionContent = (labelText) => {
                                // Strict equality check on text content to avoid partial matches
                                const candidates = Array.from(doc.querySelectorAll('div, span, h2, h3, h4')).filter(el => el.innerText.trim().toLowerCase() === labelText.toLowerCase());
                                for (const header of candidates) {
                                    let sibling = header.nextElementSibling;
                                    // Sometimes the content is in the parent's next sibling
                                    if (!sibling && header.parentElement) {
                                        sibling = header.parentElement.nextElementSibling;
                                    }

                                    if (sibling) {
                                        let html = sibling.innerHTML;
                                        html = html.replace(/<br\s*\/?>/gi, '\n');
                                        html = html.replace(/<\/p>/gi, '\n\n');
                                        const tmp = doc.createElement('div');
                                        tmp.innerHTML = html;
                                        return tmp.textContent.trim();
                                    }
                                }
                                return "";
                            };

                            if (!sound) sound = findSectionContent("Sound");
                            if (!neg_prompt) neg_prompt = findSectionContent("Negative prompt");
                            if (!lyrics) lyrics = findSectionContent("Lyrics");

                            // Model Fallback
                            if (!model || model === "unknown") {
                                // 1. Try "Model" label sibling
                                const scrapedModel = findSectionContent("Model");
                                if (scrapedModel) model = scrapedModel;

                                // 2. Try text search for FUZZ / v3.5 using regex on CLEANED body
                                if (!model || model === "unknown") {
                                    const fullText = doc.body.innerText;
                                    const modelMatch = fullText.match(/(FUZZ-[\w\d.-]+|v\d+(\.\d+)?)/i);
                                    if (modelMatch) model = modelMatch[0];
                                }
                            }

                            // --- 3. COVER ART ---
                            if (deepTitle) {
                                const img = doc.querySelector(`img[alt="${deepTitle.replace(/"/g, '\\"')}"]`);
                                if (img) coverUrl = img.src;
                            }
                            if (!coverUrl) {
                                const mainImg = doc.querySelector('img.aspect-square.object-cover.h-full.w-full[src*="storage.googleapis.com"]');
                                if (mainImg) coverUrl = mainImg.src;
                            }
                        }
                    } catch (e) { console.error("fetch error", e); }

                    const finalTitle = deepTitle || (listTitle !== "Untitled" ? listTitle : "") || "";

                    // Safe Filename Generation (Permissive)
                    // Allow [] () # , etc. Only remove strictly illegal chars
                    let safeName = finalTitle.replace(/[\\/:*?"<>|]/g, '_').trim();

                    // If we still don't have a name, fallback to UUID but mark it
                    if (!safeName) safeName = `Song_${item.uuid}`;



                    // --- DOWNLOAD AUDIO ---
                    try {
                        // Priority: WAV -> MP3
                        try {
                            const blob = await fetchAudioBlob(item.uuid, 'wav', token);
                            audioFolder.file(`${safeName}.wav`, blob);
                            stats.success++;
                        } catch (e) {
                            // Fallback MP3
                            try {
                                const blob = await fetchAudioBlob(item.uuid, 'mp3', token);
                                audioFolder.file(`${safeName}.mp3`, blob);
                                stats.success++;
                            } catch (e2) { stats.failed++; }
                        }
                    } catch (e) { stats.failed++; }

                    // Save Lyrics
                    if (lyrics) lyricsFolder.file(`${safeName}.txt`, lyrics);

                    // Add to Global Metadata
                    allMetadata.push({
                        title: finalTitle,
                        uuid: item.uuid,
                        sound_desc: sound,
                        neg_prompt: neg_prompt,
                        vibe_input: vibe_input || null, // Defined in extraction block or null
                        voice_input: voice_input || null,
                        strength: strength || null,
                        model: model,
                        cover_url: coverUrl,
                        lyrics: lyrics,
                        batch: batchNum
                    });

                    // Save Cover Art (Deduplicated)
                    if (coverUrl && coverFolder) {
                        try {
                            if (!processedImageUrls.has(coverUrl)) {
                                const imgResp = await fetch(coverUrl);
                                if (imgResp.ok) {
                                    const imgBlob = await imgResp.blob();
                                    let ext = "jpg";
                                    if (coverUrl.includes(".png")) ext = "png";
                                    else if (coverUrl.includes(".webp")) ext = "webp";

                                    // It's a unique cover, probably from a playlist item different from the session cover
                                    coverFolder.file(`${safeName}.${ext}`, imgBlob);
                                    processedImageUrls.add(coverUrl);
                                }
                            }
                        } catch (e) { console.error("Failed to fetch cover", e); }
                    }

                    // Small delay per song to be nice to API
                    await new Promise(r => setTimeout(r, 100));
                }

                // --- FINAL BATCH EXTRAS: Full Metadata ---
                if (i === totalBatches - 1) {
                    const metaFolder = rootFolder.folder("Metadata");
                    // Dynamic Filename
                    const metaName = `full_${STATE.pageType || 'session'}_metadata`;

                    // JSON
                    metaFolder.file(`${metaName}.json`, JSON.stringify(allMetadata, null, 2));

                    // CSV
                    // CSV
                    const header = ["title", "uuid", "URL", "sound_desc", "neg_prompt", "vibe_input", "voice_input", "strength", "model", "lyrics", "cover_url", "batch"];
                    const rows = [header.join(",")];

                    allMetadata.forEach(r => {
                        const title = r.title ? String(r.title) : "";
                        const uuid = r.uuid ? String(r.uuid) : "";
                        const url = r.url ? String(r.url) : "";
                        const sound = r.sound_desc ? String(r.sound_desc) : "";
                        const neg = r.neg_prompt ? String(r.neg_prompt) : "";
                        const vibe = r.vibe_input ? String(r.vibe_input) : "";
                        const voice = r.voice_input ? String(r.voice_input) : "";
                        const str = r.strength ? String(r.strength) : "";
                        const model = r.model ? String(r.model) : "";
                        const lyrics = r.lyrics ? String(r.lyrics) : "";
                        const cover = r.cover_url ? String(r.cover_url) : "";
                        const batch = r.batch ? String(r.batch) : "";

                        const row = [
                            `"${title.replace(/"/g, '""')}"`,
                            `"${uuid.replace(/"/g, '""')}"`,
                            `"${url.replace(/"/g, '""')}"`,
                            `"${sound.replace(/"/g, '""')}"`,
                            `"${neg.replace(/"/g, '""')}"`,
                            `"${vibe.replace(/"/g, '""')}"`,
                            `"${voice.replace(/"/g, '""')}"`,
                            `"${str}"`,
                            `"${model.replace(/"/g, '""')}"`,
                            `"${lyrics.replace(/"/g, '""').replace(/\n/g, '\\n')}"`,
                            `"${cover.replace(/"/g, '""')}"`,
                            `"${batch}"`
                        ];
                        rows.push(row.join(","));
                    });

                    metaFolder.file(`${metaName}.csv`, rows.join("\n"));
                }

                // --- DOWNLOAD BATCH ZIP ---
                const content = await zip.generateAsync({ type: "blob" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(content);
                a.download = `${partName}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);

                // --- UTILS ---
                // --- COOLDOWN ---
                if (i < totalBatches - 1) {
                    setBtn(`Cooling down...`, true);
                    await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
                }
            }

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
                    <div style="font-size:11px; color:#aaa; font-weight:600; margin-top:2px;">Release Build v1.0 | Production v4.0</div>
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

    function truncate(text, length) {
        if (text.length <= length) return text;
        return text.substring(0, length) + '...';
    }

    function countSelectedSongs() {
        return document.querySelectorAll('input[type="checkbox"]:checked').length;
    }

    function updateSelectedCountUI() {
        const modeSelect = document.getElementById('sp-dl-mode');
        if (!modeSelect) return;

        const selectedOption = modeSelect.querySelector('option[value="selected"]');
        if (selectedOption) {
            const count = countSelectedSongs();
            selectedOption.innerText = `Selected Songs Only (${count})`;
        }
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

        const mhtmlBtn = document.getElementById('sp-dl-mhtml-btn');
        if (mhtmlBtn) mhtmlBtn.onclick = handleMHTMLBatch;

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

        // Initial update of selected count
        updateSelectedCountUI();
    }

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

        const options = [
            { id: 'session', label: `Full Session (${visibleSongs})`, valid: isSession, suffix: '(Session Page Only)' },
            { id: 'playlist', label: `Full Playlist (${visibleSongs})`, valid: isPlaylist, suffix: '(Playlist Page Only)' },
            { id: 'song', label: `Current Song`, valid: STATE.pageType === 'song', suffix: '(Song Page Only)' },
            { id: 'all', label: `All Visible Songs (${visibleSongs})`, valid: isLibrary, suffix: '(My Songs Page Only)' },
            { id: 'selected', label: `Selected Songs Only (${countSelectedSongs()})`, valid: isLibrary, suffix: '(My Songs Page Only)' }
        ];

        options.sort((a, b) => b.valid - a.valid);

        let optionsHtml = '';
        let firstValidSelected = false;

        options.forEach(opt => {
            if (opt.valid) {
                const selected = !firstValidSelected ? 'selected' : '';
                optionsHtml += `<option value="${opt.id}" ${selected}>${opt.label}</option>`;
                firstValidSelected = true;
            } else {
                let cleanLabel = opt.label.split('(')[0].trim();
                optionsHtml += `<option value="${opt.id}" disabled>${cleanLabel} ${opt.suffix}</option>`;
            }
        });

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
                <div style="font-size:11px; color:#666; margin-bottom:20px;">
                    Exporting <b>JSON & CSV</b> containing:
                    <ul style="padding-left:16px; margin-top:4px;">
                        <li>Title, UUID, URL</li>
                        <li>Sound Description, Model</li>
                        <li>Negative Prompt, Lyrics</li>
                    </ul>
                </div>
            `;
        } else if (isPagePlaylist) {
            contentHtml = `
                <div style="margin-bottom:15px; font-size:12px; color:#aaa;">Playlist Export</div>
                <div style="font-size:11px; color:#666; margin-bottom:20px;">
                    Exporting <b>JSON & CSV</b> for all tracks.
                </div>
            `;
        } else if (isPageSession) {
            contentHtml = `
                <div style="margin-bottom:15px; font-size:12px; color:#aaa;">Full Session Export</div>
                <div style="font-size:11px; color:#666; margin-bottom:20px;">
                    Exporting <b>JSON & CSV</b> for entire session.
                    <br><br>
                    Includes Chat Log (Formatted & Raw).
                </div>
            `;
        } else {
            return `
                <div style="padding:20px; color:#666; text-align:center;">
                    Open a Session, Playlist, or Song to use this tool.
                </div>
                <div style="margin-top:20px; border-top:1px solid #333; padding-top:20px;">
                     <button id="sp-dl-mhtml-btn" style="width:100%; padding:10px; background:#444; color:#fff; border:1px solid #555; border-radius:4px; cursor:pointer; font-size:12px;">
                        SAVE ALL SESSIONS (MHTML)
                    </button>
                    <div style="font-size:10px; color:#666; margin-top:5px; text-align:center;">
                        Automates sidebar scrolling & captures full pages.
                    </div>
                </div>
            `;
        }

        return `
            ${renderPageHeader()}
            ${contentHtml}
            <button id="sp-run-export" style="width:100%; padding:14px; background:#fff; color:#000; font-weight:700; border:none; border-radius:4px; cursor:pointer;">EXPORT METADATA</button>
        `;
    }

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
            } else if (mode === 'selected') {
                // Selected Songs Mode
                // Find all checked checkboxes, get their parent row/song
                const checkedBoxes = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'));
                const seen = new Set();

                checkedBoxes.forEach(box => {
                    // Traverse up to find the song row. Usually row -> cell -> checkbox
                    const row = box.closest('div[role="row"]') || box.closest('div[role="button"]');
                    if (row) {
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
                    }
                });
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

            // 2. Processing
            const token = getAuthToken();
            if (!token) throw new Error("Could not find auth token. Please refresh the page.");

            STATE.pageTitle = extractPageTitle(); // Refresh title
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

                if (mode === 'song') {
                    // Single song mode: Use the robust global extractor
                    title = extractPageTitle();
                } else if (item.element) {
                    // List mode: Extract from row element
                    const aria = item.element.getAttribute('aria-label');
                    if (aria && aria.startsWith("Open details for ")) {
                        title = aria.replace("Open details for ", "").trim();
                    } else {
                        // Fallback: Try H4 (common in list rows)
                        const h4 = item.element.querySelector('h4');
                        if (h4) title = h4.innerText.trim();
                    }
                }

                // Final generic filter
                if (!title || title === "Song" || /Producer\.?ai/i.test(title) || /Toolsuite/i.test(title)) {
                    title = `Song_${item.uuid}`; // Fallback to safe UUID
                }

                const safeName = title.replace(/[\\/:*?"<>|]/g, '_').trim();

                let successForThisSong = false;

                // Try requested format first
                try {
                    const blob = await fetchAudioBlob(item.uuid, (format === 'original' ? 'wav' : format), token);
                    if (delivery === 'zip') folder.file(`${safeName}.${format === 'original' ? 'wav' : format}`, blob);
                    else downloadBlob(blob, `${safeName}.${format === 'original' ? 'wav' : format}`);
                    successForThisSong = true;
                } catch (e) {
                    // console.warn('Primary format failed', e);
                }

                // If original (wav) failed, try mp3 as fallback
                if (!successForThisSong && format === 'original') {
                    try {
                        const blob = await fetchAudioBlob(item.uuid, 'mp3', token);
                        if (delivery === 'zip') folder.file(`${safeName}.mp3`, blob);
                        else downloadBlob(blob, `${safeName}.mp3`);
                        successForThisSong = true;
                    } catch (e) { }
                }

                if (successForThisSong) success++;

                await new Promise(r => setTimeout(r, 100));
            }

            if (delivery === 'zip' && success > 0) {
                setBtn("Compressing...", true);
                const content = await zip.generateAsync({ type: "blob" });
                const a = document.createElement("a");
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

        if (typeof JSZip === 'undefined') { alert("JSZip library not loaded. Please reload the page."); return; }

        const btn = document.getElementById('sp-run-export');
        const setBtn = (text, disabled) => { if (btn) { btn.innerText = text; btn.disabled = disabled; } };

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
                const messageBlocks = Array.from(document.querySelectorAll('.group.w-full'));
                let log = "SESSION CHAT LOG\n=================\n\n";
                let raw = "";

                if (messageBlocks.length > 0) {
                    messageBlocks.forEach(block => {
                        const text = block.innerText;
                        raw += text + "\n\n";
                        const isUser = block.querySelector('.flex-row-reverse') !== null || block.className.includes('justify-end');
                        const sender = isUser ? "USER" : "AGENT";
                        const cleanText = text.replace(/You said:|Agent said:/g, '').trim();
                        log += `[${sender}]\n${cleanText}\n-----------------\n`;

                        const lower = text.toLowerCase();
                        if (lower.includes('[verse') || lower.includes('[chorus')) {
                            const snippet = text.substring(0, 30).replace(/\W/g, '_');
                            lyricsMap.set(`Lyrics_${snippet}`, text);
                        }
                    });
                } else {
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

            const lyricsFolder = dataFolder.folder("lyrics");

            if (lyricsMap.size > 0) {
                lyricsMap.forEach((content, filename) => {
                    lyricsFolder.file(`${filename}.txt`, content);
                });
            }

            if (uniqueSongs.length > 0) {
                const token = getAuthToken();
                let processedCount = 0;
                const metadataRecords = [];

                for (const item of uniqueSongs) {
                    processedCount++;
                    setBtn(`Processing ${processedCount}/${uniqueSongs.length}...`, true);

                    try {
                        let listTitle = "Untitled";
                        if (item.element) {
                            const aria = item.element.getAttribute('aria-label');
                            if (aria && aria.startsWith("Open details for ")) {
                                listTitle = aria.replace("Open details for ", "").trim();
                            }
                            if (listTitle === "Untitled") {
                                const h4 = item.element.querySelector('h4');
                                if (h4) listTitle = h4.innerText.trim();
                            }
                        }

                        const songUrl = `https://www.producer.ai/song/${item.uuid}`;
                        const resp = await fetch(songUrl, { headers: { 'Authorization': `Bearer ${token}` } });
                        let lyrics = "";
                        let sound = "";
                        let model = "unknown";
                        let deepTitle = "";
                        let neg_prompt = "";
                        let coverUrl = "";

                        if (resp.ok) {
                            const htmlText = await resp.text();
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(htmlText, 'text/html');

                            // --- 1. HYDRATION DATA (Primary Source) ---
                            // This is the most reliable source for everything
                            const script = doc.getElementById('__NEXT_DATA__');
                            let hydrationData = null;
                            if (script) {
                                try {
                                    const json = JSON.parse(script.innerText);

                                    // 1. Try standard pageProps
                                    if (json.props?.pageProps?.song) hydrationData = json.props.pageProps.song;
                                    else if (json.props?.pageProps?.clip) hydrationData = json.props.pageProps.clip;

                                    // 2. Try SDC Query Cache (Deep Search via UUID)
                                    // This is robust against schema changes (song vs riff vs unknown)
                                    if (!hydrationData && json.props?.sdc?.queryClient?.queries) {
                                        const queries = json.props.sdc.queryClient.queries;
                                        const targetUuid = item.uuid;

                                        // Find query that contains our UUID in its hash OR data
                                        const foundQuery = queries.find(q => {
                                            // Check query key/hash
                                            if (JSON.stringify(q.queryKey).includes(targetUuid)) return true;
                                            // Check data ID
                                            const d = q.state?.data;
                                            if (d) {
                                                if (d.id === targetUuid) return true;
                                                if ((d.riff?.id === targetUuid) || (d.song?.id === targetUuid) || (d.clip?.id === targetUuid)) return true;
                                            }
                                            return false;
                                        });

                                        if (foundQuery) {
                                            const d = foundQuery.state.data;
                                            if (d.id === targetUuid) hydrationData = d;
                                            else hydrationData = d.riff || d.song || d.clip || d;
                                        }
                                    }

                                    if (hydrationData) {
                                        if (hydrationData.title) deepTitle = hydrationData.title;

                                        // Model Mapping
                                        if (hydrationData.model_display_name) model = hydrationData.model_display_name;
                                        else if (hydrationData.major_model_version) model = `${hydrationData.major_model_version}`;

                                        // Metadata Mapping
                                        // 1. Lyrics / Prompt
                                        if (hydrationData.metadata?.prompt) lyrics = hydrationData.metadata.prompt;
                                        else if (hydrationData.prompt) lyrics = hydrationData.prompt;

                                        // 2. Sound Description
                                        if (hydrationData.metadata?.tags) sound = hydrationData.metadata.tags;
                                        else if (hydrationData.tags) sound = hydrationData.tags;
                                        if (!sound && hydrationData.sound) sound = hydrationData.sound;

                                        // 3. Negative Prompt (Strict)
                                        if (hydrationData.metadata?.negative_prompt) neg_prompt = hydrationData.metadata.negative_prompt;
                                        else if (hydrationData.metadata?.neg_prompt) neg_prompt = hydrationData.metadata.neg_prompt;

                                        // 4. Other Fields
                                        var vibe_input = hydrationData.metadata?.vibe_input || null;
                                        var voice_input = hydrationData.metadata?.voice_input || null;
                                        var strength = hydrationData.metadata?.strength || null;

                                        // 5. Fallback Lyrics
                                        if (!lyrics && hydrationData.lyrics) lyrics = hydrationData.lyrics;
                                    }
                                } catch (e) { console.error("Hydration parse error", e); }
                            }

                            // --- 2. DOM FALLBACKS (If Hydration Failed) ---
                            // CLEANUP: Strict Case-insensitive removal of sidebar
                            const sidebars = doc.querySelectorAll('div, aside, section');
                            sidebars.forEach(el => {
                                if (el.innerText && /More from/i.test(el.innerText)) {
                                    el.remove(); // Nuke the sidebar from our parsed doc
                                }
                            });

                            // Title Fallback
                            if (!deepTitle) {
                                // 1. Primary: Role Textbox (most distinct)
                                const titleEl = doc.querySelector('div[role="textbox"][contenteditable="true"]');
                                if (titleEl && titleEl.innerText.trim()) deepTitle = titleEl.innerText.trim();

                                // 2. Secondary: H1
                                if (!deepTitle) {
                                    const h1 = doc.querySelector('h1');
                                    if (h1) deepTitle = h1.innerText.trim();
                                }
                            }
                            // Filter out generic titles (Robust)
                            if (deepTitle && (/Producer\.?ai/i.test(deepTitle) || /Toolsuite/i.test(deepTitle) || deepTitle === "Song")) {
                                deepTitle = "";
                            }

                            // Metadata Sections Fallback
                            const findSectionContent = (labelText) => {
                                // Strict equality check on text content to avoid partial matches
                                const candidates = Array.from(doc.querySelectorAll('div, span, h2, h3, h4')).filter(el => el.innerText.trim().toLowerCase() === labelText.toLowerCase());
                                for (const header of candidates) {
                                    let sibling = header.nextElementSibling;
                                    // Sometimes the content is in the parent's next sibling
                                    if (!sibling && header.parentElement) {
                                        sibling = header.parentElement.nextElementSibling;
                                    }

                                    if (sibling) {
                                        let html = sibling.innerHTML;
                                        html = html.replace(/<br\s*\/?>/gi, '\n');
                                        html = html.replace(/<\/p>/gi, '\n\n');
                                        const tmp = doc.createElement('div');
                                        tmp.innerHTML = html;
                                        return tmp.textContent.trim();
                                    }
                                }
                                return "";
                            };

                            if (!sound) sound = findSectionContent("Sound");
                            if (!neg_prompt) neg_prompt = findSectionContent("Negative prompt");
                            if (!lyrics) lyrics = findSectionContent("Lyrics");

                            // Model Fallback
                            if (!model || model === "unknown") {
                                // 1. Try "Model" label sibling
                                const scrapedModel = findSectionContent("Model");
                                if (scrapedModel) model = scrapedModel;

                                // 2. Try text search for FUZZ / v3.5 using regex on CLEANED body
                                if (!model || model === "unknown") {
                                    const fullText = doc.body.innerText;
                                    const modelMatch = fullText.match(/(FUZZ-[\w\d.-]+|v\d+(\.\d+)?)/i);
                                    if (modelMatch) model = modelMatch[0];

                                    if (fullText.includes("v3.5")) model = "v3.5";
                                    else if (fullText.includes("v3")) model = "v3";
                                }
                            }

                            // --- 4. COVER ART ---
                            if (deepTitle) {
                                const img = doc.querySelector(`img[alt="${deepTitle.replace(/"/g, '\\"')}"]`);
                                if (img) coverUrl = img.src;
                            }
                            if (!coverUrl) {
                                const mainImg = doc.querySelector('img.aspect-square.object-cover.h-full.w-full');
                                if (mainImg) coverUrl = mainImg.src;
                            }

                        }

                        const finalTitle = deepTitle || listTitle || "Untitled_Song";

                        if (lyrics) {
                            const safeTitle = finalTitle.replace(/[^a-z0-9]/gi, '_').substring(0, 40);
                            lyricsFolder.file(`${safeTitle}_${item.uuid}.txt`, lyrics);
                        }

                        metadataRecords.push({
                            title: finalTitle,
                            uuid: item.uuid,
                            sound_desc: sound,
                            neg_prompt: neg_prompt,
                            vibe_input: vibe_input || null,
                            voice_input: voice_input || null,
                            strength: strength || null,
                            model: model,
                            url: songUrl,
                            cover_url: coverUrl,
                            lyrics: lyrics
                        }); await new Promise(r => setTimeout(r, 200));

                    } catch (errLoop) {
                        console.error("Error processing song", item, errLoop);
                    }
                } // end loop

                // Save Metadata (Strict JSON & CSV)
                if (metadataRecords.length > 0) {
                    // JSON
                    dataFolder.file("metadata.json", JSON.stringify(metadataRecords, null, 2));

                    // CSV (Strict Columns)
                    // CSV (Strict Columns)
                    const header = ["title", "uuid", "URL", "sound_desc", "neg_prompt", "vibe_input", "voice_input", "strength", "model", "lyrics"];
                    const rows = [header.join(",")];

                    metadataRecords.forEach(r => {
                        const title = r.title ? String(r.title) : "";
                        const uuid = r.uuid ? String(r.uuid) : "";
                        const url = r.url ? String(r.url) : "";
                        const sound = r.sound_desc ? String(r.sound_desc) : "";
                        const neg = r.neg_prompt ? String(r.neg_prompt) : "";
                        const vibe = r.vibe_input ? String(r.vibe_input) : "";
                        const voice = r.voice_input ? String(r.voice_input) : "";
                        const str = r.strength ? String(r.strength) : "";
                        const model = r.model ? String(r.model) : "";
                        const lyrics = r.lyrics ? String(r.lyrics) : "";

                        const row = [
                            `"${title.replace(/"/g, '""')}"`,
                            `"${uuid.replace(/"/g, '""')}"`,
                            `"${url.replace(/"/g, '""')}"`,
                            `"${sound.replace(/"/g, '""')}"`,
                            `"${neg.replace(/"/g, '""')}"`,
                            `"${vibe.replace(/"/g, '""')}"`,
                            `"${voice.replace(/"/g, '""')}"`,
                            `"${str}"`,
                            `"${model.replace(/"/g, '""')}"`,
                            `"${lyrics.replace(/"/g, '""').replace(/\n/g, '\\n')}"`
                        ];
                        rows.push(row.join(","));
                    });

                    dataFolder.file("metadata.csv", rows.join("\n"));
                }
            }

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
            setBtn(`EXPORT METADATA`, false);
        }
    }

    async function handleMHTMLBatch(e) {
        if (e) e.preventDefault();
        if (!confirm("This will scroll through your ENTIRE session list and download each session as an MHTML file. This may take a long time. Continue?")) return;

        const btn = document.getElementById('sp-dl-mhtml-btn');
        const setBtn = (t) => { if (btn) btn.innerText = t; };

        setBtn("Locating Sidebar...");

        // 1. Find Scrollable Sidebar
        // More robust heuristic for sidebar
        let container = null;
        const potentialSidebars = document.querySelectorAll('nav, div[class*="sidebar"], aside');
        for (const el of potentialSidebars) {
            if (el.innerText.includes('Sessions') || el.querySelectorAll('a[href^="/session/"]').length > 0) {
                container = el;
                // verify it scrolls
                if (getComputedStyle(el).overflowY === 'auto' || getComputedStyle(el).overflowY === 'scroll') break;
            }
        }

        // Fallback: finding parent of a known link
        if (!container) {
            const link = document.querySelector('a[href^="/session/"]');
            if (link) {
                // traverse up until we find a scroll container
                let p = link.parentElement;
                while (p && p !== document.body) {
                    const style = getComputedStyle(p);
                    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                        container = p;
                        break;
                    }
                    p = p.parentElement;
                }
            }
        }

        if (!container) { alert("Could not locate sidebar container."); setBtn("Save All (MHTML)"); return; }

        setBtn("Scrolling...");

        // 2. Automate Scrolling
        const collectedUrls = new Set();
        let lastScroll = -1;
        let sameScrollCount = 0;

        const scan = () => {
            const links = container.querySelectorAll('a[href^="/session/"]');
            links.forEach(a => collectedUrls.add(a.href));
        };

        // Scroll loop
        while (true) {
            scan();
            setBtn(`Found ${collectedUrls.size} sessions...`);

            lastScroll = container.scrollTop;
            container.scrollTop += 1500; // Aggressive scroll

            await new Promise(r => setTimeout(r, 1000)); // Wait for lazy load

            if (container.scrollTop === lastScroll) {
                sameScrollCount++;
                if (sameScrollCount > 2) break; // End of list
            } else {
                sameScrollCount = 0;
            }
        }

        if (collectedUrls.size === 0) { alert("No sessions found."); setBtn("Save All (MHTML)"); return; }

        // 3. Send to Background
        setBtn(`Processing ${collectedUrls.size} sessions...`);

        chrome.runtime.sendMessage({
            type: "DOWNLOAD_ADVANCED",
            jobType: "mhtml_batch",
            urls: Array.from(collectedUrls)
        }, (resp) => {
            if (resp && resp.success) {
                setBtn("Done!");
                alert(`MHTML Batch Complete! \nProcessed: ${resp.processed}\nErrors: ${resp.errors}`);
            } else {
                setBtn("Failed");
                alert("Batch Failed: " + (resp?.error || "Unknown Error"));
            }
            setTimeout(() => setBtn("Save All (MHTML)"), 3000);
        });
    }

    function extractPageTitle() {
        console.log("ANTIGRAVITY: Extracting Page Title...");

        // 1. Session Page Specific (Editable Input)
        if (window.location.pathname.includes('/session/')) {
            // Look for the main title input
            const titleInput = document.querySelector('input[placeholder="Name your session"]');
            if (titleInput && titleInput.value && titleInput.value.trim()) {
                console.log("ANTIGRAVITY: Found Session Input Title:", titleInput.value);
                return titleInput.value.trim();
            }

            // Fallback: value of any input in the top header area
            const headerInputs = document.querySelectorAll('header input');
            for (const input of headerInputs) {
                if (input.value && input.value.trim() && input.value !== "Name your session") {
                    return input.value.trim();
                }
            }
        }

        // 2. Try editable div (Song Page)
        const titleEl = document.querySelector('div[role="textbox"][contenteditable="true"]');
        if (titleEl && titleEl.innerText.trim()) {
            const t = titleEl.innerText.trim();
            if (t !== "Song" && t !== "Producerai Toolsuite") {
                console.log("ANTIGRAVITY: Found Editable Title:", t);
                return t;
            }
        }

        // 3. Try H1
        const h1 = document.querySelector('h1');
        if (h1 && h1.innerText.trim()) {
            const t = h1.innerText.trim();
            if (t !== "Song" && t !== "Producerai Toolsuite") {
                // Avoid "Create" or generic H1s
                if (!["Create", "Home", "Library"].includes(t)) {
                    console.log("ANTIGRAVITY: Found H1 Title:", t);
                    return t;
                }
            }
        }

        // 4. Hydration Fallback (most robust for Songs)
        try {
            const script = document.getElementById('__NEXT_DATA__');
            if (script) {
                const json = JSON.parse(script.innerText);
                let songTitle = null;

                // 1. Standard props
                if (json.props?.pageProps?.song?.title) songTitle = json.props.pageProps.song.title;
                else if (json.props?.pageProps?.clip?.title) songTitle = json.props.pageProps.clip.title;

                // 2. SDC Cache (Deep UUID Search) - simplified for extractPageTitle
                const pathSegments = window.location.pathname.split('/');
                const uuidIndex = pathSegments.indexOf('song') + 1;
                const currentUuid = (uuidIndex > 0 && uuidIndex < pathSegments.length) ? pathSegments[uuidIndex] : null;

                if (!songTitle && currentUuid && json.props?.sdc?.queryClient?.queries) {
                    const queries = json.props.sdc.queryClient.queries;
                    const foundQuery = queries.find(q => {
                        if (JSON.stringify(q.queryKey).includes(currentUuid)) return true;
                        return false;
                    });
                    if (foundQuery) {
                        const d = foundQuery.state.data;
                        if (d) {
                            if (d.title) songTitle = d.title;
                            else if (d.song?.title) songTitle = d.song.title;
                        }
                    }
                }

                if (songTitle && songTitle !== "Song" && songTitle !== "Producerai Toolsuite") {
                    console.log("ANTIGRAVITY: Found Hydration Title:", songTitle);
                    return songTitle;
                }
            }
        } catch (e) { }

        // 5. Session Name fallback (Legacy / Other selectors)
        try {
            const userSel = '.flex.items-center.gap-2.overflow-hidden.p-2.transition-colors.hover\\:bg-bg-2.data-\\[state\\=open\\]\\:bg-bg-2.cursor-pointer.rounded';
            const sessionNameEl = document.querySelector(userSel);
            if (sessionNameEl) return sessionNameEl.innerText.trim();
        } catch (e) { }

        return "Untitled";
    }

    function analyzePage() {
        const path = window.location.pathname;
        let title = "Untitled";

        STATE.pageType = 'unknown';

        if (path.includes('/library/my-songs')) {
            STATE.pageType = 'library';
            title = "My Songs";
        } else if (path.includes('/session/')) {
            STATE.pageType = 'session';
        } else if (path.includes('/song/')) {
            STATE.pageType = 'song';
            // title = "Song"; // DELETED to allow extraction
        } else if (path.includes('/playlist/')) {
            STATE.pageType = 'playlist';
        } else {
            STATE.pageType = 'other';
        }

        if (title === "Untitled") {
            title = extractPageTitle();
        }

        if (title.startsWith("Producer.ai") || title === "Toolsuite") {
            const prefix = STATE.pageType === 'playlist' ? 'Playlist_' : 'Session_';
            title = prefix + new Date().getTime().toString().slice(-6);
        }

        STATE.pageTitle = title.replace(/[\/\\:*?"<>|]/g, '_');
    }

    // --- INITIALIZATION ---
    analyzePage();
    updateUIForPageType();
    initCredits();

    // Polling for URL changes (SPA Navigation)
    // Polling for URL changes (SPA Navigation)
    setInterval(() => {
        const currentPath = window.location.pathname;
        const titleBad = !STATE.pageTitle || STATE.pageTitle === "Untitled" || STATE.pageTitle === "Song";

        // If path changed OR title is still bad (loading race condition), re-analyze
        if (currentPath !== STATE.lastPath || titleBad) {

            // Only update lastPath if it actually changed
            if (currentPath !== STATE.lastPath) STATE.lastPath = currentPath;

            const oldTitle = STATE.pageTitle;
            analyzePage();

            // If title changed or path changed, update UI
            if (currentPath !== STATE.lastPath || STATE.pageTitle !== oldTitle) {
                const sidebar = document.getElementById('sp-sidebar');
                if (sidebar && sidebar.style.right === '0px') {
                    updateUIForPageType();
                }
            }
        }

        // Always update selected count if sidebar is open
        const sidebar = document.getElementById('sp-sidebar');
        if (sidebar && sidebar.style.right === '0px') {
            updateSelectedCountUI();
        }

        // Detect new songs loading in lists
        if (STATE.isOpen) {
            const songRows = document.querySelectorAll('div[role="button"][aria-label^="Open details for"]');
            if (window._lastRawCount !== songRows.length) {
                window._lastRawCount = songRows.length;
                updateUIForPageType();
            }
        }
    }, 1000);

})();
