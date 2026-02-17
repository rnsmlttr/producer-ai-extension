# Producer.ai Toolsuite

**Release Build v1.0 | Production v3.9**

The **Producer.ai Toolsuite** is a powerful browser extension that transforms your workflow on Producer.ai. It provides a comprehensive set of tools for downloading audio, exporting metadata, and archiving entire sessions.

## 🚀 Key Features

### 1. ★ Master Export
The **Master Export** is a one-click solution for backing up entire sessions or playlists.
- **Location:** The large gold/orange button at the top of the sidebar.
- **What it does:** Creates a single ZIP file containing:
  - **Audio:** High-quality MP3s (or WAVs if available) for every track.
  - **Lyrics:** Creates individual text files for each song's lyrics/prompt.
  - **Metadata:** A full CSV and JSON dump of all track details (Style, Model, UUID, URL).
  - **Chat Logs:** Captures the entire session chat history (User & Agent) in a readable format.
  - **Images:** Scrapes and saves all generated album art and images.

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

### 3. Metadata Exporter
Located in the **METADATA** tab, this tool is for data hoarders and archivists.

- **Formats:**
  - **JSON:** A structured data format perfect for developers or database imports.
  - **CSV:** A spreadsheet-compatible format (Excel, Google Sheets).
  - **Text:** A simple, human-readable text summary (Song Page only).

- **Scope:**
  - **Playlist/Session:** Exports a full table of all tracks.
  - **Single Song:** Exports detailed metadata for a specific track.

## 📥 Installation

1. Download or clone this repository.
2. Open Chrome (or Edge/Brave) and navigate to `chrome://extensions`.
3. Enable **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"** in the top left.
5. Select the folder containing this extension.

## 🛠️ Usage

1. Navigate to [Producer.ai](https://www.producer.ai).
2. Look for the **sidebar handle** on the right side of the screen.
3. Click the handle or the extension icon to open the **Producer.ai Toolsuite**.
4. Choose your desired tool (Master Export, Audio, or Metadata).

## ⚠️ Notes

*   **Authentication**: The extension uses your active browser session. Ensure you are logged in.
*   **Permissions**: If downloading multiple files individually, Chrome may ask for permission to download multiple files. **Click "Allow"**.
*   **Rate Limiting**: A small safety delay is built-in to prevent server overload.

---
*Created by rnsmlttr*
