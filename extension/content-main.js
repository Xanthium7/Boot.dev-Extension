// Runs in the MAIN execution world (page context) with direct access to CodeMirror internals
(function() {
    if (window.__bootdevSyncMainInstalled) return;
    window.__bootdevSyncMainInstalled = true;

    function getCodeFromCodeMirror() {
        const editors = Array.from(document.querySelectorAll('.cm-editor'));
        if (editors.length === 0) return null;

        let editor = editors.find(ed => {
            const rect = ed.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(ed).display !== 'none';
        }) || editors[0];

        if (!editor) return null;

        // Try standard CodeMirror 6 view instances
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
                    if (typeof text === 'string') return text;
                }
            } catch (e) {}
        }

        // Try React fiber props if available
        try {
            const fiberKey = Object.keys(editor).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
            if (fiberKey) {
                let curr = editor[fiberKey];
                let depth = 0;
                while (curr && depth < 25) {
                    const props = curr.memoizedProps;
                    if (props) {
                        if (typeof props.value === 'string' && props.value.length > 0) return props.value;
                        if (typeof props.code === 'string' && props.code.length > 0) return props.code;
                        if (typeof props.initialValue === 'string' && props.initialValue.length > 0) return props.initialValue;
                    }
                    curr = curr.return;
                    depth++;
                }
            }
        } catch (e) {}

        return null;
    }

    // Listen for requests from the content script
    window.addEventListener('BOOTDEV_SYNC_REQUEST', (e) => {
        const reqId = e.detail?.reqId;
        const code = getCodeFromCodeMirror();
        window.dispatchEvent(new CustomEvent('BOOTDEV_SYNC_RESPONSE', {
            detail: { reqId, code, available: code !== null }
        }));
    });
})();
