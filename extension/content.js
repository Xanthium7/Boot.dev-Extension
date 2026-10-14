const BTN_ID = 'bootdev-learngo-sync-btn';
const TOAST_ID = 'bootdev-learngo-toast';

function getEditorCode() {
    const editor = document.querySelector('.cm-editor');
    if (!editor) return null;

    try {
        if (editor.cmView && editor.cmView.view && editor.cmView.view.state) {
            return editor.cmView.view.state.doc.toString();
        }
    } catch (e) {}

    const lines = editor.querySelectorAll('.cm-line');
    if (lines && lines.length > 0) {
        return Array.from(lines).map(l => l.textContent).join('\n');
    }

    const content = editor.querySelector('.cm-content');
    return content ? (content.innerText || content.textContent || '') : '';
}

function findGoTabs() {
    const tabs = [];
    const seenEls = new Set();

    // Strategy 1: Find text nodes ending with .go and get their clickable ancestor
    try {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const val = (node.nodeValue || '').trim();
            if (val === 'main.go' || val === 'main_test.go' || (val.endsWith('.go') && val.length < 35 && !val.includes('/'))) {
                const clickable = node.parentElement.closest('button, [role="tab"], div[class*="cursor-pointer"], a') || node.parentElement;
                if (clickable && !seenEls.has(clickable)) {
                    seenEls.add(clickable);
                    tabs.push({ name: val, el: clickable });
                }
            }
        }
    } catch (e) {
        console.warn('[Sync-Content] TreeWalker error:', e);
    }

    // Strategy 2: Fallback to role="tab" elements
    if (tabs.length === 0) {
        const roleTabs = Array.from(document.querySelectorAll('button[role="tab"], [role="tab"]'))
            .filter(b => (b.textContent || '').includes('.go'));
        for (const t of roleTabs) {
            const rawText = t.textContent.trim();
            const match = rawText.match(/[\w_.-]+\.go/);
            const filename = match ? match[0] : rawText;
            if (!seenEls.has(t)) {
                seenEls.add(t);
                tabs.push({ name: filename, el: t });
            }
        }
    }

    return tabs;
}

async function extractAllFiles() {
    const tabs = findGoTabs();
    const files = {};

    if (tabs.length === 0) {
        // Single file exercise
        const code = getEditorCode();
        if (code !== null && code !== undefined) {
            files['main.go'] = code;
        }
        return files;
    }

    // Multiple file exercise with tabs
    const activeTab = tabs.find(t =>
        t.el.getAttribute('aria-selected') === 'true' ||
        t.el.classList.contains('active') ||
        t.el.classList.contains('bg-gray-800') ||
        t.el.classList.contains('text-white')
    ) || tabs[0];

    for (const tab of tabs) {
        try {
            tab.el.click();
        } catch (e) {}

        await new Promise(r => setTimeout(r, 120));

        const code = getEditorCode();
        if (code !== null && code !== undefined) {
            files[tab.name] = code;
        }
    }

    // Restore active tab
    if (activeTab && activeTab.el) {
        try {
            activeTab.el.click();
        } catch (e) {}
    }

    return files;
}

function safeCopyToClipboard(text) {
    // Hidden textarea fallback that works regardless of window focus
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

    // Modern async clipboard API as secondary fallback
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

    // Safety watchdog: reset button if anything hangs over 5s
    const watchdog = setTimeout(() => {
        if (btn) {
            btn.innerHTML = originalText;
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            btn.style.background = 'linear-gradient(135deg, #d97706, #f59e0b)';
        }
    }, 5000);

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

        // Delegate network request to background worker (bypasses CSP & Mixed Content)
        let syncSuccess = false;
        try {
            const bgResponse = await Promise.race([
                chrome.runtime.sendMessage({ action: 'sendSync', payload }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Background timeout')), 3500))
            ]);

            if (bgResponse && bgResponse.ok) {
                syncSuccess = true;
            }
        } catch (e) {
            console.warn('[Sync-Content] Background sync failed, falling back:', e);
        }

        if (syncSuccess) {
            showToast(`✓ Synced ${fileCount} file(s) (${fileNames.join(', ')}) to LearnGo & ran tests!`, 'success');
            if (btn) {
                btn.innerHTML = `<span>✓ Synced!</span>`;
                btn.style.background = 'linear-gradient(135deg, #059669, #10b981)';
            }
            return { ok: true, count: fileCount };
        } else {
            // Fallback: Copy JSON payload to clipboard for manual .\\sync.ps1 run
            safeCopyToClipboard(JSON.stringify(payload, null, 2));
            showToast(`📋 Copied ${fileCount} file(s) to clipboard! Run .\\sync.ps1 in terminal`, 'info');
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

// Listen for messages from extension popup
chrome.runtime?.onMessage?.addListener((request, sender, sendResponse) => {
    if (request.action === 'sync') {
        triggerSync().then((result) => sendResponse(result || { ok: true }));
        return true;
    }
});

const observer = new MutationObserver(() => injectSyncButton());
observer.observe(document.body, { childList: true, subtree: true });
setTimeout(injectSyncButton, 1000);
