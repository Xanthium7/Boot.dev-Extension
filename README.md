# LearnGo ⚡

A streamlined local development setup for completing [Boot.dev](https://www.boot.dev) Go courses offline with instant code extraction and automatic test execution.

---

## 🚀 How It Works

1. **Browser Extension (`extension/`):** Detects code editor tabs (`main.go`, `main_test.go`) on active Boot.dev lessons and sends them to your local sync server with a single click or keyboard shortcut.
2. **Local Sync Server (`sync.exe`):** A lightweight background HTTP server listening on `http://127.0.0.1:8383`. When triggered, it:
   - Backs up existing files to `.history/` with timestamps.
   - Writes the new `main.go` and `main_test.go` directly into this project.
   - Automatically runs `.\run-tests-colored.ps1` to test your initial code.
3. **Test Runner (`run-tests-colored.ps1`):** Formats Go test output with clear, colored pass/fail status.

---

## 🛠️ One-Time Setup

### 1. Load the Browser Extension
1. Open your Chromium-based browser (Opera GX, Chrome, Brave, Edge).
2. Navigate to your extensions manager:
   - Opera GX: `opera://extensions`
   - Chrome / Brave / Edge: `chrome://extensions`
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and choose the `extension` folder inside this directory:
   ```text
   d:\Projects\LearnGo\extension
   ```

---

## 📋 Daily Workflow

### 1. Start the Sync Server
Open a terminal in this directory and start `sync.exe`:
```powershell
.\sync.exe
```
> Keep this terminal open while you study. It will log every incoming lesson and display live test results.

### 2. Sync Any Lesson from Boot.dev
1. Navigate to any coding exercise on Boot.dev.
2. Press **`Alt + S`** or click the floating **⚡ Sync to LearnGo** button in the bottom right corner.
3. The lesson files (`main.go` and `main_test.go`) are automatically updated in your workspace.

### 3. Solve & Test Locally
- To run tests manually at any time:
  ```powershell
  .\run-tests-colored.ps1
  ```
  *(or standard Go test command: `go test -v`)*

- For lessons with a runnable program (`main()` function instead of tests):
  ```powershell
  go run main.go
  ```

---

## 📂 Project Structure

```text
LearnGo/
├── main.go                # Current lesson Go source code
├── main_test.go           # Current lesson test suite (if applicable)
├── go.mod                 # Go module file
├── sync.exe               # Local Go sync server
├── run-tests-colored.ps1  # Colored test runner script
├── extension/             # Browser extension (Opera GX / Chrome)
│   ├── manifest.json      # Manifest V3 configuration
│   ├── background.js      # Background service worker (handles local fetch)
│   ├── content.js         # DOM code extractor & injected sync button
│   ├── popup.html         # Extension popup UI
│   └── popup.js           # Extension popup status checker
├── .history/              # Timestamped backups of all synced exercises
└── .gitignore             # Git ignore rules
```

---

## 💡 Troubleshooting & Tips

- **Server Status Check:** Click the extension icon in your browser toolbar to verify the server status (`Online` vs `Offline`).
- **Lesson not syncing?** Make sure `.\sync.exe` is running in your terminal. If you just updated extension files, refresh the extension in `opera://extensions` and refresh the lesson tab with **`Ctrl + R`**.
- **Accidentally overwritten work?** Check the `.history/` folder for timestamped versions of previous files.
