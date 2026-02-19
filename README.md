# Producer.ai Toolsuite

<<<<<<< HEAD
**Release Build v2.0 | Production v4.0**

The **Producer.ai Toolsuite** is a powerful browser extension that attempts to answer the issues present in the Prod website. It provides a comprehensive set of tools for downloading audio, exporting metadata, and archiving entire sessions.
=======
**Release Build v1.0 | Production v4.0**

The **Producer.ai Toolsuite** is a powerful browser extension that transforms your workflow on Producer.ai. It provides a comprehensive set of tools for downloading audio, exporting metadata, and archiving entire sessions.
>>>>>>> 69d987a (Bump version to 4.1.0: Fix Smart Folder, Audio Export Folder Support, and Filename Sanitization)

## 🚀 Key Features

### 1. ★ Full Export Package
The **Full Export Package** is a one-click solution for backing up entire sessions or playlists.
<<<<<<< HEAD
- **Location:** The large gold button at the top of the sidebar.
- **What it does:** Creates a single ZIP file containing:
  - **Audio:** High-quality WAVs (falls back to MP3 if unavailable) for every track.
  - **Lyrics:** Creates individual text files for each song's lyrics.
  - **Metadata:** A full CSV and JSON dump of all track details (Style, Model, UUID, URL).
  - **Cover Art:** Smartly deduplicated into a `/Cover_Art` folder.
  - **Alt Art:** Saves all other generated images found in the session to `/Alt_Art`.
  - *In Progress* **Chat Logs:** Captures the entire session chat history (User & Agent) in a readable format.
=======
- **Location:** The large gold/orange button at the top of the sidebar.
- **What it does:** Creates a single ZIP file containing:
  - **Audio:** High-quality WAVs (falls back to MP3 if unavailable) for every track.
  - **Lyrics:** Creates individual text files for each song's lyrics/prompt.
  - **Metadata:** A full CSV and JSON dump of all track details (Style, Model, UUID, URL).
  - **Chat Logs:** Captures the entire session chat history (User & Agent) in a readable format.
  - **Cover Art:** Smartly deduplicated into a `/Cover_Art` folder.
  - **Alt Art:** Saves all other generated images found in the session to `/Alt_Art`.
>>>>>>> 69d987a (Bump version to 4.1.0: Fix Smart Folder, Audio Export Folder Support, and Filename Sanitization)

### 2. Audio Downloader
Located in the **AUDIO** tab, this tool gives you granular control over your music downloads.

- **Focus Mode:**
<<<<<<< HEAD
  - **Full Session:** Downloads every track found in the current session (ignores duped UUIDs).
  - **Full Playlist:** Downloads every track in the current playlist.
  - **Current Song:** Downloads only the song you are currently viewing (Song Page only).
  - **All Visible Songs:** Downloads every song currently visible on the page (Library Page Only).
  - *Known Issue* **Selected Songs Only:** Downloads only the specific tracks you have checke (Library Page Only).

- **Audio Format:**
  - **WAV (Lossless):** Downloads the original uncompressed WAV file.
  - **MP3 (320kbps):** Downloads the standard high-quality MP3.
  - **M4A (Lossy):** Downloads the M4A format used for quick storage & audio streaming on-site.
=======
  - **Full Session:** Downloads every track in the current session.
  - **Full Playlist:** Downloads every track in the current playlist.
  - **Current Song:** Downloads only the song you are currently viewing (Song Page only).
  - **All Visible Songs:** Downloads every song currently visible on the page (great for Library browsing).
  - **Selected Songs Only:** Downloads only the specific tracks you have checked.

- **Audio Format:**
  - **WAV (Lossless):** Attempts to download the original uncompressed WAV file.
  - **MP3 (320kbps):** Downloads the standard high-quality MP3.
  - **M4A:** Downloads the M4A format if available.
>>>>>>> 69d987a (Bump version to 4.1.0: Fix Smart Folder, Audio Export Folder Support, and Filename Sanitization)

- **Delivery:**
  - **Individual Files:** Downloads each track as a separate file to your browser's download folder.
  - **Zip Archive:** Packages all tracks into a single ZIP file for easy management.

## 📦 What's New in v4.0
- **Critical Fix:** Solved an issue where downloading WAVs would result in `application/json` files containing signed URLs. The extension now correctly follows these redirects to download the actual audio file.
- **Improved Organization:** "Full Export Package" now separates images into `/Cover_Art` (main song covers) and `/Alt_Art` (unused generations), keeping your folders clean.
<<<<<<< HEAD
- **Smart Art Deduplication:** If multiple songs share the same cover art (common in sessions), it is only downloaded once to save space.
=======
- **Smart Deduplication:** If multiple songs share the same cover art (common in sessions), it is only downloaded once to save space.
>>>>>>> 69d987a (Bump version to 4.1.0: Fix Smart Folder, Audio Export Folder Support, and Filename Sanitization)
- **Permission Updates:** added necessary host permissions to handle redirected downloads from CDN/S3.

## 📥 Installation

<<<<<<< HEAD
1. **Download:** Download & unpack the [latest release](https://github.com/rnsmlttr/producer-ai-extension/releases/tag/v4.0) or clone this repository.
2. **Open Extensions:** In Chrome (Edge/Brave), go to `chrome://extensions`.
=======
1. **Download:** Download the latest release or clone this repository.
2. **Open Extensions:** In Chrome (or Edge/Brave), go to `chrome://extensions`.
>>>>>>> 69d987a (Bump version to 4.1.0: Fix Smart Folder, Audio Export Folder Support, and Filename Sanitization)
3. **Enable Developer Mode:** Toggle the switch in the top right corner.
4. **Load Unpacked:** Click the button in the top left.
5. **Select Folder:** Choose the `extension-v.4.0-stable` folder.

## 🛠️ Usage

1. Navigate to [Producer.ai](https://www.producer.ai).
<<<<<<< HEAD
2. **Find & Pin the Extension:** Click the "Extensions" (puzzle piece) icon in your browser toolbar and **Pin** the Producer.ai Toolsuite for easy access.
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
`xcrun safari-web-extension-converter /path/to/producerai/extension` 
```

3. Follow the prompts to build and run the extension in Safari.
=======
2. **Pin the Extension:** Click the "Extensions" (puzzle piece) icon in your browser toolbar and **Pin** the Producer.ai Toolsuite for easy access.
3. **Open:** Click the Producer.ai icon to toggle the sidebar overlay.
4. Choose your desired tool (Full Export Package, Audio, or Metadata).
>>>>>>> 69d987a (Bump version to 4.1.0: Fix Smart Folder, Audio Export Folder Support, and Filename Sanitization)

## ⚠️ Notes

*   **Authentication**: The extension uses your active browser session. Ensure you are logged in.
<<<<<<< HEAD
*   **Large Batches**: For batches of 50+ the ZIPs will be auto split into multiple zips. For very large groups (100+), obtaining the ZIP might take a moment due to browser memory limits.
*   **Permissions**: If downloading multiple files individually, Chrome may ask for permission to download multiple files. **Click "Allow"**.
*   **Rate Limiting**: A small safety delay is built-in between downloads to ensure stability & protect from anti-botting.
=======
*   **Large Batches**: For very large sessions (100+ songs), obtaining the ZIP might take a moment due to browser memory limits.
*   **Permissions**: If downloading multiple files individually, Chrome may ask for permission to download multiple files. **Click "Allow"**.
>>>>>>> 69d987a (Bump version to 4.1.0: Fix Smart Folder, Audio Export Folder Support, and Filename Sanitization)

---
*Created by rnsmlttr*
