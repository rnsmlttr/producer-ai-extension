chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SET_THEME') {
        if (msg.theme === 'default') {
            document.body.removeAttribute('data-pai-theme');
        } else {
            document.body.setAttribute('data-pai-theme', msg.theme);
        }
    } else if (msg.type === 'SCROLL_TO_BOTTOM') {
        const scrollToBottom = () => {
            const distance = 1000;
            const delay = 500;
            let lastScrollHeight = document.body.scrollHeight;
            let checks = 0;

            const timer = setInterval(() => {
                window.scrollBy(0, distance);

                // check if new content loaded
                if (document.body.scrollHeight > lastScrollHeight) {
                    lastScrollHeight = document.body.scrollHeight;
                    checks = 0; // reset check count
                } else {
                    checks++;
                }

                // stop if no new content after 5 checks (2.5 seconds)
                if (checks >= 5) {
                    clearInterval(timer);
                    alert("Reached the bottom or no more items loading.");
                }
            }, delay);
        };
        scrollToBottom();
    } else if (msg.type === 'TOGGLE_SEARCH') {
        toggleSearchToolbar();
    }
});

let searchVisible = false;

function toggleSearchToolbar() {
    let toolbar = document.getElementById('pai-search-bar');
    if (toolbar) {
        toolbar.remove();
        searchVisible = false;
        // reset visibility
        const rows = document.querySelectorAll('div[role="button"][aria-label^="Open details for"]');
        rows.forEach(r => r.style.display = '');
        return;
    }

    searchVisible = true;
    toolbar = document.createElement('div');
    toolbar.id = 'pai-search-bar';
    toolbar.className = 'pai-search-toolbar';
    toolbar.innerHTML = `
        <span style="font-size:14px;">🔍</span>
        <input type="text" id="pai-search-input" class="pai-search-input" placeholder="Search title, tags...">
        
        <select id="pai-bpm-filter" class="pai-filter-select">
            <option value="any">Any BPM</option>
            <option value="slow">Slow (<90)</option>
            <option value="med">Medium (90-120)</option>
            <option value="fast">Fast (120+)</option>
        </select>

        <span id="pai-search-stat" class="pai-search-stat">-- items</span>
        <button id="pai-close-search" class="pai-search-btn">✕</button>
    `;

    document.body.appendChild(toolbar);

    // listeners
    const input = toolbar.querySelector('#pai-search-input');
    const bpmSelect = toolbar.querySelector('#pai-bpm-filter');
    const closeBtn = toolbar.querySelector('#pai-close-search');

    input.focus();

    const runFilter = () => {
        const query = input.value.toLowerCase();
        const bpmMode = bpmSelect.value;
        const rows = Array.from(document.querySelectorAll('div[role="button"][aria-label^="Open details for"]'));
        let visibleCount = 0;

        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            const matchesText = text.includes(query);

            // basic bpm heuristic (looking for "X bpm" string in row)
            let matchesBpm = true;
            if (bpmMode !== 'any') {
                const bpmMatch = text.match(/(\d+)\s*bpm/);
                if (bpmMatch) {
                    const bpm = parseInt(bpmMatch[1]);
                    if (bpmMode === 'slow' && bpm >= 90) matchesBpm = false;
                    if (bpmMode === 'med' && (bpm < 90 || bpm > 120)) matchesBpm = false;
                    if (bpmMode === 'fast' && bpm <= 120) matchesBpm = false;
                }
            }

            if (matchesText && matchesBpm) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        toolbar.querySelector('#pai-search-stat').innerText = `${visibleCount} found`;
    };

    input.addEventListener('input', runFilter);
    bpmSelect.addEventListener('change', runFilter);

    closeBtn.onclick = () => toggleSearchToolbar();

    // initial count
    runFilter();
}
