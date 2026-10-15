// Background Service Worker for Boot.dev -> LearnGo Sync
const SYNC_URL = 'http://127.0.0.1:8383/sync';
const HEALTH_URL = 'http://127.0.0.1:8383/';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sendSync') {
        const payload = request.payload;

        // Perform fetch from extension origin (bypasses page CSP, Mixed Content, and PNA)
        fetch(SYNC_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(4000)
        })
        .then(async (response) => {
            if (response.ok) {
                const data = await response.json().catch(() => ({}));
                sendResponse({ ok: true, data: data });
            } else {
                sendResponse({ ok: false, error: `Server returned status ${response.status}` });
            }
        })
        .catch((err) => {
            console.warn('[Sync-Background] Fetch error:', err);
            sendResponse({ ok: false, error: err.message || 'Connection failed' });
        });

        // Keep message channel open for async response
        return true;
    }

    if (request.action === 'getMainWorldCode') {
        const tabId = sender.tab?.id;
        if (!tabId) {
            sendResponse({ code: null });
            return;
        }
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            func: () => {
                const editors = Array.from(document.querySelectorAll('.cm-editor'));
                if (editors.length === 0) return null;

                let editor = editors.find(ed => {
                    const rect = ed.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(ed).display !== 'none';
                }) || editors[0];

                if (!editor) return null;

                const candidates = [
                    editor.cmView?.view,
                    editor.cmView,
                    editor.querySelector('.cm-content')?.cmView?.view,
                    editor.querySelector('.cm-content')?.cmView,
                    editor.querySelector('.cm-scroller')?.cmView?.view,
                    editor.querySelector('.cm-scroller')?.cmView,
                    editor.editorView
                ];

                for (const c of candidates) {
                    try {
                        if (c && c.state && c.state.doc && typeof c.state.doc.toString === 'function') {
                            const text = c.state.doc.toString();
                            if (typeof text === 'string' && text.length > 0) return text;
                        }
                    } catch (e) {}
                }
                return null;
            }
        })
        .then((results) => {
            const code = results?.[0]?.result || null;
            sendResponse({ code: code });
        })
        .catch(() => {
            sendResponse({ code: null });
        });

        return true;
    }

    if (request.action === 'checkServer') {
        fetch(HEALTH_URL, {
            method: 'GET',
            signal: AbortSignal.timeout(2000)
        })
        .then((resp) => {
            sendResponse({ online: resp.ok });
        })
        .catch(() => {
            sendResponse({ online: false });
        });

        return true;
    }
});
