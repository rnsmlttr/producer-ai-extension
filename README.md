# Producer.ai Toolsuite

**Release Build v2.0 | Production v4.0**

The **Producer.ai Toolsuite** is a powerful browser extension that transforms your workflow on Producer.ai. It provides a comprehensive set of tools for downloading audio, exporting metadata, and archiving entire sessions.

## 🚀 Key Features

### 1. ★ Full Export Package
The **Full Export Package** is a one-click solution for backing up entire sessions or playlists.
- **Location:** The large gold/orange button at the top of the sidebar.
- **What it does:** Creates a single ZIP file containing:
  - **Audio:** High-quality WAVs (falls back to MP3 if unavailable) for every track.
  - **Lyrics:** Creates individual text files for each song's lyrics/prompt.
  - **Metadata:** A full CSV and JSON dump of all track details (Style, Model, UUID, URL).
  - **Chat Logs:** Captures the entire session chat history (User & Agent) in a readable format.
  - **Cover Art:** Smartly deduplicated into a `/Cover_Art` folder.
  - **Alt Art:** Saves all other generated images found in the session to `/Alt_Art`.

### 2. Audio Downloader
Located in the **AUDIO** tab, this tool gives you granular control over your music downloads.

- **Focus Mode:**
  - **Full Session:** Downloads every track in the current session.
  - **Full Playlist:** Downloads every track in the current playlist.
  - **Current Song:** Downloads only the song you are currently viewing (Song Page only).
  - **All Visible Songs:** Downloads every song currently visible on the page (great for Library browsing).
  - **Selected Songs Only:** Downloads only the specific tracks you have checked.

- **Audio Format:**
  - **WAV (Lossless):** Attempts to download the original uncompressed WAV file.
  - **MP3 (320kbps):** Downloads the standard high-quality MP3.
  - **M4A:** Downloads the M4A format if available.

- **Delivery:**
  - **Individual Files:** Downloads each track as a separate file to your browser's download folder.
  - **Zip Archive:** Packages all tracks into a single ZIP file for easy management.

## 📦 What's New in v4.0
- **Critical Fix:** Solved an issue where downloading WAVs would result in `application/json` files containing signed URLs. The extension now correctly follows these redirects to download the actual audio file.
- **Improved Organization:** "Full Export Package" now separates images into `/Cover_Art` (main song covers) and `/Alt_Art` (unused generations), keeping your folders clean.
- **Smart Deduplication:** If multiple songs share the same cover art (common in sessions), it is only downloaded once to save space.
- **Permission Updates:** added necessary host permissions to handle redirected downloads from CDN/S3.

## 📥 Installation

1. **Download:** Download the latest release or clone this repository.
2. **Open Extensions:** In Chrome (or Edge/Brave), go to `chrome://extensions`.
3. **Enable Developer Mode:** Toggle the switch in the top right corner.
4. **Load Unpacked:** Click the button in the top left.
5. **Select Folder:** Choose the `extension-v.4.0-stable` folder.

## 🛠️ Usage

1. Navigate to [Producer.ai](https://www.producer.ai).
2. **Pin the Extension:** Click the "Extensions" (puzzle piece) icon in your browser toolbar and **Pin** the Producer.ai Toolsuite for easy access.
3. **Open:** Click the Producer.ai icon to toggle the sidebar overlay.
4. Choose your desired tool (Full Export Package, Audio, or Metadata).

## ⚠️ Notes

*   **Authentication**: The extension uses your active browser session. Ensure you are logged in.
*   **Large Batches**: For very large sessions (100+ songs), obtaining the ZIP might take a moment due to browser memory limits.
*   **Permissions**: If downloading multiple files individually, Chrome may ask for permission to download multiple files. **Click "Allow"**.

---
*Created by rnsmlttr*
