const BTN_ID = 'bootdev-learngo-sync-btn';
const TOAST_ID = 'bootdev-learngo-toast';

// Ask the background script to run directly in the page's MAIN world via chrome.scripting
async function getCodeFromMainWorld(timeoutMs = 300) {
    try {
        const bgPromise = new Promise((resolve) => {
            if (!chrome.runtime?.sendMessage) return resolve(null);
            chrome.runtime.sendMessage({ action: 'getMainWorldCode' }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                } else {
                    resolve(response?.code || null);
                }
            });
        });

        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
        const res = await Promise.race([bgPromise, timeoutPromise]);
        if (typeof res === 'string' && res.length > 0) {
            return res;
        }
    } catch (e) {}

    // Fallback: CustomEvent communication with content-main.js
    return new Promise((resolve) => {
        const reqId = Math.random().toString(36).slice(2);
        let resolved = false;

        const handler = (e) => {
            if (e.detail?.reqId === reqId) {
                window.removeEventListener('BOOTDEV_SYNC_RESPONSE', handler);
                resolved = true;
                resolve(e.detail.code);
            }
        };

        window.addEventListener('BOOTDEV_SYNC_RESPONSE', handler);
        window.dispatchEvent(new CustomEvent('BOOTDEV_SYNC_REQUEST', { detail: { reqId } }));

        setTimeout(() => {
            if (!resolved) {
                window.removeEventListener('BOOTDEV_SYNC_RESPONSE', handler);
                resolve(null);
            }
        }, 120);
    });
}

// Fallback: pixel-accurate vertical matching between gutter line numbers and visible lines
async function getEditorCodeDOM() {
    const editors = Array.from(document.querySelectorAll('.cm-editor'));
    if (editors.length === 0) return null;

    let editor = editors[0];
    if (editors.length > 1) {
        const visible = editors.find(ed => {
            const rect = ed.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(ed).display !== 'none';
        });
        if (visible) editor = visible;
    }

    const scroller = editor.querySelector('.cm-scroller');

    // Case 1: Entire document fits in visible height
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 15) {
        const lines = editor.querySelectorAll('.cm-line');
        if (lines && lines.length > 0) {
            return Array.from(lines).map(l => l.textContent).join('\n');
        }
        const content = editor.querySelector('.cm-content');
        return content ? (content.innerText || content.textContent || '') : '';
    }

    // Case 2: Document is virtualized — use line numbers physically aligned with .cm-line elements
    const initialScrollTop = scroller.scrollTop;
    const lineMap = new Map(); // lineNumber (int) -> string text
    const maxPossibleLine = Math.ceil(scroller.scrollHeight / 14) + 15;

    function captureVisibleLines() {
        // Collect visible, non-hidden numbered gutter elements
        const gutterEls = Array.from(editor.querySelectorAll('.cm-lineNumbers .cm-gutterElement'));
        const rawGutters = [];

        for (const el of gutterEls) {
            // Must have physical height and not be hidden (skips CodeMirror measurement dummy elements)
            if (el.offsetHeight <= 0) continue;
            const style = window.getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none') continue;

            const text = el.textContent.trim();
            const num = parseInt(text, 10);
            if (isNaN(num) || num <= 0 || String(num) !== text) continue;

            // Must not exceed physical document height capacity
            if (num > maxPossibleLine) continue;

            rawGutters.push({
                num: num,
                top: el.getBoundingClientRect().top
            });
        }

        if (rawGutters.length === 0) return;

        // Sort vertically top-to-bottom
        rawGutters.sort((a, b) => a.top - b.top);

        // Filter out any anomalous line jumps
        const numberedGutters = [];
        for (const g of rawGutters) {
            if (numberedGutters.length > 0) {
                const prev = numberedGutters[numberedGutters.length - 1];
                if (g.num <= prev.num || g.num > prev.num + 3) continue;
            }
            numberedGutters.push(g);
        }

        if (numberedGutters.length === 0) return;

        // Collect all visible .cm-line elements
        const lineEls = Array.from(editor.querySelectorAll('.cm-line')).map(el => ({
            text: el.textContent,
            top: el.getBoundingClientRect().top
        }));

        if (lineEls.length === 0) return;

        // Match each gutter line number to the physically aligned .cm-line (within 8px tolerance)
        for (const g of numberedGutters) {
            let bestLine = null;
            let minDiff = 8;

            for (const l of lineEls) {
                const diff = Math.abs(g.top - l.top);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestLine = l;
                }
            }

            if (bestLine) {
                lineMap.set(g.num, bestLine.text);
            }
        }
    }

    // Scroll to top first
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 100));
    captureVisibleLines();

    // Small scroll steps (~40% of viewport height) to guarantee continuous overlap
    const step = Math.max(100, Math.floor(scroller.clientHeight * 0.45));
    const totalHeight = scroller.scrollHeight;
    let currentScroll = 0;

    while (currentScroll < totalHeight) {
        currentScroll += step;
        scroller.scrollTop = currentScroll;
        scroller.dispatchEvent(new Event('scroll'));
        await new Promise(r => setTimeout(r, 70));
        captureVisibleLines();

        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
            break;
        }
    }

    // Scroll to absolute bottom
    scroller.scrollTop = scroller.scrollHeight;
    scroller.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 90));
    captureVisibleLines();

    // Restore original scroll position
    scroller.scrollTop = initialScrollTop;
    scroller.dispatchEvent(new Event('scroll'));

    if (lineMap.size === 0) return '';
    const maxLine = Math.max(...lineMap.keys());
    const result = [];
    for (let i = 1; i <= maxLine; i++) {
        result.push(lineMap.get(i) ?? '');
    }

    // Trim trailing blank lines
    while (result.length > 0 && result[result.length - 1].trim() === '') {
        result.pop();
    }

    return result.join('\n');
}

// Main getEditorCode function: tries in-memory first, falls back to DOM
async function getEditorCode() {
    try {
        const memoryCode = await getCodeFromMainWorld(250);
        if (typeof memoryCode === 'string' && memoryCode.length > 0) {
            return memoryCode;
        }
    } catch (e) {}

    return await getEditorCodeDOM();
}

function clickElement(el) {
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, view: window };
    try {
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
    } catch (e) {}
    if (typeof el.click === 'function') {
        try {
            el.click();
        } catch (e) {}
    }
}

function findGoTabs() {
    const tabs = [];
    const seen = new Set();

    const tabEls = Array.from(document.querySelectorAll('button[role="tab"], [role="tab"], button, div[role="tab"]'))
        .filter(el => {
            const text = (el.textContent || '').trim();
            return text.includes('.go');
        });

    for (const el of tabEls) {
        const btn = el.closest('button, [role="tab"]') || el;
        if (!seen.has(btn)) {
            const rawText = btn.textContent.trim();
            const match = rawText.match(/[\w_.-]+\.go/);
            if (match) {
                seen.add(btn);
                tabs.push({ name: match[0], el: btn });
            }
        }
    }

    if (tabs.length === 0) {
        try {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                const val = (node.nodeValue || '').trim();
                const match = val.match(/[\w_.-]+\.go/);
                if (match && val.length < 35 && !val.includes('/')) {
                    const clickable = node.parentElement.closest('button, [role="tab"], div[class*="cursor-pointer"], a') || node.parentElement;
                    if (clickable && !seen.has(clickable)) {
                        seen.add(clickable);
                        tabs.push({ name: match[0], el: clickable });
                    }
                }
            }
        } catch (e) {}
    }

    return tabs;
}

async function extractAllFiles() {
    const tabs = findGoTabs();
    const files = {};

    if (tabs.length === 0) {
        const code = await getEditorCode();
        if (code !== null && code !== undefined) {
            files['main.go'] = code;
        }
        return files;
    }

    const initialActiveTab = tabs.find(t =>
        t.el.getAttribute('aria-selected') === 'true' ||
        t.el.classList.contains('active') ||
        t.el.classList.contains('bg-gray-800') ||
        t.el.classList.contains('text-white')
    ) || tabs[0];

    // Read active tab
    const initialCode = await getEditorCode();
    if (initialCode) {
        files[initialActiveTab.name] = initialCode;
    }

    // Read other tabs
    for (const tab of tabs) {
        if (tab === initialActiveTab && files[tab.name]) {
            continue;
        }

        clickElement(tab.el);
        // Wait for tab click to trigger and CodeMirror to swap document
        await new Promise(r => setTimeout(r, 300));

        let newCode = await getEditorCode();
        // If code hasn't changed from the initial tab yet, give it another brief wait
        if (newCode === files[initialActiveTab.name]) {
            await new Promise(r => setTimeout(r, 200));
            newCode = await getEditorCode();
        }

        if (newCode !== null && newCode !== undefined) {
            files[tab.name] = newCode;
        }
    }

    // Restore active tab
    if (initialActiveTab && initialActiveTab.el) {
        clickElement(initialActiveTab.el);
        await new Promise(r => setTimeout(r, 200));
    }

    return files;
}

function safeCopyToClipboard(text) {
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (success) return true;
    } catch (e) {}

    try {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).catch(() => {});
            return true;
        }
    } catch (e) {}

    return false;
}

function showToast(message, type = 'info') {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
        toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 24px;
            z-index: 999999;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
            transition: opacity 0.25s ease, transform 0.25s ease;
            display: flex;
            align-items: center;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(toast);
    }

    if (type === 'success') {
        toast.style.background = '#065f46';
        toast.style.color = '#ecfdf5';
        toast.style.border = '1px solid #10b981';
    } else if (type === 'warn') {
        toast.style.background = '#78350f';
        toast.style.color = '#fef3c7';
        toast.style.border = '1px solid #f59e0b';
    } else {
        toast.style.background = '#1e293b';
        toast.style.color = '#f1f5f9';
        toast.style.border = '1px solid #3b82f6';
    }

    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
    }, 3500);
}

async function triggerSync() {
    const btn = document.getElementById(BTN_ID);
    const originalText = `
        <svg style="width: 16px; height: 16px; fill: currentColor;" viewBox="0 0 24 24">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        <span>Sync to LearnGo</span>
        <span style="opacity: 0.6; font-size: 11px; margin-left: 2px;">Alt+S</span>
    `;

    if (btn) {
        btn.innerHTML = `<span>⏳ Extracting...</span>`;
        btn.style.opacity = '0.85';
        btn.style.pointerEvents = 'none';
    }

    const watchdog = setTimeout(() => {
        if (btn) {
            btn.innerHTML = originalText;
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            btn.style.background = 'linear-gradient(135deg, #d97706, #f59e0b)';
        }
    }, 8000);

    try {
        const files = await extractAllFiles();
        const fileNames = Object.keys(files);
        const fileCount = fileNames.length;

        if (fileCount === 0) {
            showToast('⚠️ No Go code found on this page (is it a quiz card?)', 'warn');
            return { ok: false, error: 'No code found' };
        }

        const title = document.querySelector('h1')?.textContent?.trim() || document.title;
        const payload = {
            title: title,
            url: window.location.href,
            files: files
        };

        let syncSuccess = false;
        try {
            const bgResponse = await Promise.race([
                chrome.runtime.sendMessage({ action: 'sendSync', payload }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Background timeout')), 4000))
            ]);

            if (bgResponse && bgResponse.ok) {
                syncSuccess = true;
            }
        } catch (e) {
            console.warn('[Sync-Content] Background sync failed, falling back:', e);
        }

        const lineSummary = Object.entries(files).map(([name, code]) => `${name} (${code.split('\n').length} lines)`).join(', ');

        if (syncSuccess) {
            showToast(`✓ Synced: ${lineSummary}`, 'success');
            if (btn) {
                btn.innerHTML = `<span>✓ Synced!</span>`;
                btn.style.background = 'linear-gradient(135deg, #059669, #10b981)';
            }
            return { ok: true, count: fileCount };
        } else {
            safeCopyToClipboard(JSON.stringify(payload, null, 2));
            showToast(`📋 Copied: ${lineSummary} to clipboard!`, 'info');
            if (btn) {
                btn.innerHTML = `<span>📋 Copied to Clipboard</span>`;
                btn.style.background = 'linear-gradient(135deg, #2563eb, #3b82f6)';
            }
            return { ok: true, fallback: true };
        }
    } catch (err) {
        console.error('[Sync-Content] Sync error:', err);
        showToast(`Extraction error: ${err.message}`, 'warn');
        if (btn) {
            btn.innerHTML = `<span>⚠️ Error</span>`;
        }
        return { ok: false, error: err.message };
    } finally {
        clearTimeout(watchdog);
        setTimeout(() => {
            if (btn) {
                btn.innerHTML = originalText;
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
                btn.style.background = 'linear-gradient(135deg, #d97706, #f59e0b)';
            }
        }, 2200);
    }
}

function injectSyncButton() {
    const hasEditor = document.querySelector('.cm-editor');
    let btn = document.getElementById(BTN_ID);

    if (!hasEditor) {
        if (btn) btn.style.display = 'none';
        return;
    }

    if (btn) {
        btn.style.display = 'flex';
        return;
    }

    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.title = 'Sync code files to LearnGo (Alt + S)';
    btn.innerHTML = `
        <svg style="width: 16px; height: 16px; fill: currentColor;" viewBox="0 0 24 24">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        <span>Sync to LearnGo</span>
        <span style="opacity: 0.6; font-size: 11px; margin-left: 2px;">Alt+S</span>
    `;
    btn.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 18px;
        border-radius: 9999px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: linear-gradient(135deg, #d97706, #f59e0b);
        color: #111827;
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        user-select: none;
    `;

    btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = '0 10px 20px -5px rgba(245, 158, 11, 0.5)';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.4)';
    });

    btn.addEventListener('click', triggerSync);
    document.body.appendChild(btn);
}

// Keyboard shortcut: Alt + S
window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        triggerSync();
    }
});

chrome.runtime?.onMessage?.addListener((request, sender, sendResponse) => {
    if (request.action === 'sync') {
        triggerSync().then((result) => sendResponse(result || { ok: true }));
        return true;
    }
});

const observer = new MutationObserver(() => injectSyncButton());
observer.observe(document.body, { childList: true, subtree: true });
setTimeout(injectSyncButton, 1000);
