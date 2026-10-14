async function checkServer() {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');

    try {
        const resp = await fetch('http://127.0.0.1:8383/', { 
            method: 'GET',
            signal: AbortSignal.timeout(2000)
        });
        if (resp.ok) {
            dot.className = 'status-dot online';
            text.textContent = 'Server: Online (port 8383)';
            return;
        }
    } catch (e) {}

    dot.className = 'status-dot';
    text.textContent = 'Server: Offline (Clipboard mode)';
}

const syncBtn = document.getElementById('sync-btn');
syncBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('boot.dev')) {
        alert('Please open a Boot.dev lesson page first!');
        return;
    }

    syncBtn.innerHTML = `<span>⏳ Syncing...</span>`;
    syncBtn.style.opacity = '0.8';
    syncBtn.style.pointerEvents = 'none';

    try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'sync' });
        if (response && response.ok) {
            syncBtn.innerHTML = `<span>✓ Synced!</span>`;
            syncBtn.style.background = 'linear-gradient(135deg, #059669, #10b981)';
            setTimeout(() => window.close(), 700);
        } else {
            syncBtn.innerHTML = `<span>⚡ Sync This Lesson</span>`;
            syncBtn.style.opacity = '1';
            syncBtn.style.pointerEvents = 'auto';
        }
    } catch (e) {
        syncBtn.innerHTML = `<span>⚡ Sync This Lesson</span>`;
        syncBtn.style.opacity = '1';
        syncBtn.style.pointerEvents = 'auto';
        alert('Could not communicate with the Boot.dev page.\n\nPlease refresh the Boot.dev tab (Ctrl + R) to activate the extension!');
    }
});

checkServer();
