# Release Notes v4.1.0

## 🌟 New Features
- **Smart Folder Organization**: The "Smart (Auto-Name)" option now correctly names the exported Zip file and its internal folder using only the **Clean Session Title** (e.g., `My Session.zip`). Timestamps are removed for cleaner organization.
- **Audio Export Folder Support**:
  - Unlocked the ability for "Individual Files" to be saved directly into a named folder (e.g., `Downloads/My Session/Song.wav`) instead of cluttering the root Downloads folder.
  - This utilizes the extension's background script to manage downloads securely.

## 🛠 Improvements & Fixes
- **Filename Sanitization**: Relaxed the file naming rules to allow special characters like `#`, `—`, `(`, `)` which are common in song titles, while still blocking illegal system characters (`/`, `:`, `?`, etc.).
- **UI Responsiveness**: Fixed an issue where the "Focus Mode" dropdown would show stale options (like "Full Playlist") when ensuring navigating between different page types (e.g., Playlist -> Song).
- **Code Cleanup**: Removed internal debug logging for a cleaner production build.

## 📦 Installation
1. Download the source code.
2. Load unpacked in `chrome://extensions`.
