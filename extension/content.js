const BTN_ID = 'bootdev-learngo-sync-btn';
const TOAST_ID = 'bootdev-learngo-toast';

function mergeLineBatches(existingLines, newLines) {
    if (!existingLines || existingLines.length === 0) return newLines.slice();
    if (!newLines || newLines.length === 0) return existingLines.slice();

    const maxOverlap = Math.min(existingLines.length, newLines.length);
    for (let overlap = maxOverlap; overlap >= 1; overlap--) {
        let match = true;
        for (let i = 0; i < overlap; i++) {
            if (existingLines[existingLines.length - overlap + i] !== newLines[i]) {
                match = false;
                break;
            }
        }
        if (match) {
            return existingLines.concat(newLines.slice(overlap));
        }
    }

    return existingLines.concat(newLines);
}

async function getEditorCode() {
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

    // Case 1: No scrollbar needed or entire document fits in visible height
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 15) {
        const lines = editor.querySelectorAll('.cm-line');
        if (lines && lines.length > 0) {
            return Array.from(lines).map(l => l.textContent).join('\n');
        }
        const content = editor.querySelector('.cm-content');
        return content ? (content.innerText || content.textContent || '') : '';
    }

    // Case 2: Document is virtualized (longer than screen) - Perform an automated fast scroll sweep
    const initialScrollTop = scroller.scrollTop;
    let collectedLines = [];

    // Scroll to top first
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 60));

    let visibleLines = Array.from(editor.querySelectorAll('.cm-line')).map(l => l.textContent);
    collectedLines = mergeLineBatches(collectedLines, visibleLines);

    // Step down through the document in chunks of 70% viewport height
    const step = Math.max(120, Math.floor(scroller.clientHeight * 0.7));
    const totalHeight = scroller.scrollHeight;
    let currentScroll = 0;

    while (currentScroll < totalHeight) {
        currentScroll += step;
        scroller.scrollTop = currentScroll;
        scroller.dispatchEvent(new Event('scroll'));
        await new Promise(r => setTimeout(r, 45));

        const batch = Array.from(editor.querySelectorAll('.cm-line')).map(l => l.textContent);
        collectedLines = mergeLineBatches(collectedLines, batch);

        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 5) {
            // Reached the very bottom
            break;
        }
    }

    // Scroll to the absolute bottom to ensure any trailing lines are captured
    scroller.scrollTop = scroller.scrollHeight;
    scroller.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 45));

    const finalBatch = Array.from(editor.querySelectorAll('.cm-line')).map(l => l.textContent);
    collectedLines = mergeLineBatches(collectedLines, finalBatch);

    // Restore original scroll position
    scroller.scrollTop = initialScrollTop;
    scroller.dispatchEvent(new Event('scroll'));

    return collectedLines.join('\n');
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

async function waitForEditorChange(oldCode, maxWaitMs = 800) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 200));

    while (Date.now() - start < maxWaitMs) {
        const currentCode = await getEditorCode();
        if (currentCode && currentCode !== oldCode) {
            return currentCode;
        }
        await new Promise(r => setTimeout(r, 60));
    }
    return await getEditorCode();
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

    let lastKnownCode = initialCode;

    // Read other tabs
    for (const tab of tabs) {
        if (tab === initialActiveTab && files[tab.name]) {
            continue;
        }

        clickElement(tab.el);
        const newCode = await waitForEditorChange(lastKnownCode, 900);
        if (newCode !== null && newCode !== undefined) {
            files[tab.name] = newCode;
            lastKnownCode = newCode;
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
