# Producer.ai Toolsuite

**Release Build v4.1.2**

The **Producer.ai Toolsuite** is a powerful browser extension that transforms your workflow on Producer.ai. It provides a comprehensive set of tools for downloading audio, exporting metadata, and archiving entire sessions.

## 🚀 Key Features

### 1. ★ Full Export Package
- **Location:** The large gold button at the top of the sidebar.
- **What it does:** Creates a single ZIP file containing:
  - **Audio:** High-quality WAVs (falls back to MP3 if unavailable) for every track.
  - **Lyrics:** Creates individual text files for each song's lyrics.
  - **Metadata:** A full CSV and JSON dump of all track details (Style, Model, UUID, URL).
  - **Chat Logs:** Captures the entire session chat history (User & Agent) in a readable format.
  - **Cover Art:** Smartly deduplicated into a `/Cover_Art` folder.
  - **Alt Art:** Saves all other generated images found in the session to `/Alt_Art`.

### 2. Audio Downloader
Located in the **AUDIO** tab, this tool gives you granular control over your music downloads.

- **Focus Mode:**
  - **Full Session:** Downloads every track found in the current session (ignores duped UUIDs).
  - **Full Playlist:** Downloads every track in the current playlist.
  - **Current Song:** Downloads only the song you are currently viewing (Song Page only).
  - **All Visible Songs:** Downloads every song currently visible on the page (Library Page Only).
  - **Selected Songs Only:** Downloads only the specific tracks you have checked (Library Page Only).

- **Audio Format:**
  - **WAV (Lossless):** Downloads the original uncompressed WAV file.
  - **MP3 (320kbps):** Downloads the standard high-quality MP3.
  - **M4A (Lossy):** Downloads the M4A format used for quick storage & audio streaming on-site.

- **Delivery:**
  - **Individual Files:** Downloads each track as a separate file to your browser's download folder.
    - *New in v4.1:* Now saves to `Downloads/Session Name/` folder!
  - **Zip Archive:** Packages all tracks into a single ZIP file for easy management.

## 📦 What's New in v4.1.1
- **Dual Export Buttons:** Explicit "WAV" and "MP3" buttons for the full export package.
- **Clarified UI:** Renamed tabs to "Download (Audio Only)" and "Download (Metadata Only)" for better clarity.
- **Metadata Fixes:** Corrected URL generation for Songs, Playlists, and Sessions in CSV/JSON exports.
- **Code Hygiene:** Removed internal logging and cleanup.

### v4.1.0 Highlights
- **Smart Folder Organization:** "Smart (Auto-Name)" option now uses clean session titles.
- **Improved Audio Export:** Individual files are now organized into named folders.
- **Relaxed Sanitization:** Filenames now support characters like `#` and `—`.

## 📥 Installation

1. **Download:** Download & unpack the [latest release](https://github.com/rnsmlttr/producer-ai-extension/releases/latest) or clone this repository.
2. **Open Extensions:** In Chrome (Edge/Brave), go to `chrome://extensions`.
3. **Enable Developer Mode:** Toggle the switch in the top right corner.
4. **Load Unpacked:** Click the button in the top left.
5. **Select Folder:** Choose the `ProducerAI-extension-stable` folder.

## 🛠️ Usage

1. Navigate to [Producer.ai](https://www.producer.ai).
2. **Pin the Extension:** Click the "Extensions" (puzzle piece) icon in your browser toolbar and **Pin** the Producer.ai Toolsuite for easy access.
3. **Open:** Click the Producer.ai icon to toggle the sidebar overlay.
4. Choose your desired tool (Full Export, Audio, or Metadata).

## 🌐 Browser Compatibility

### Chrome / Edge / Brave
Follow the standard [Installation](#-installation) instructions above.

### Firefox
1. **Important**: Rename `manifest_firefox.json` to `manifest.json`. (You may want to backup the original `manifest.json` first).
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
3. Click **"Load Temporary Add-on..."**.
4. Select the `manifest.json` file.

### Safari (macOS)
1. You will need Xcode installed.
2. Run the following command in Terminal:

```bash
xcrun safari-web-extension-converter /path/to/producerai/extension
```

3. Follow the prompts to build and run the extension in Safari.

## ⚠️ Notes

*   **Authentication**: The extension uses your active browser session. Ensure you are logged in.
*   **Large Batches**: For very large sessions (100+ songs), obtaining the ZIP might take a moment due to browser memory limits.
*   **Permissions**: If downloading multiple files individually, Chrome may ask for permission to download multiple files. **Click "Allow"**.
*   **Rate Limiting**: A small safety delay is built-in between downloads to ensure stability.

---
*Created by rnsmlttr*
