# Release Notes

## [v4.1.2] - 2026-02-19

### Changed
- **Profile Page Support:** Added "All Visible" download option for User Profile pages (e.g. `/username`).
- **Rebranding:** Removed "(Clean)" from extension name in manifest.
- **Version Bump:** Updated to v4.1.2.

## [v4.1.1] - 2026-02-18

### Changed
- **UI Update:** "Full Export Package" button replaced with a header and two distinct valid buttons: **WAV** and **MP3**.
- **UI Update:** "AUDIO" tab renamed to "Download (Audio Only)".
- **UI Update:** "METADATA" tab renamed to "Download (Metadata Only)".
- **Refinement:** Simplifed button labels ("WAV (Source)" -> "WAV", etc).
- **Maintenance:** Internal code scrubbing and comment cleanup.
- **Fix:** Ensured consistent URL format (`https://www.producer.ai/song/[uuid]`) for metadata exports.

## [v4.1.0] - 2026-02-18

### Added
- **Smart Folder Export:** "Smart (Auto-Name)" option in Organization dropdown. Uses clean session title as folder name.
- **Dual Format Export:** Prepared logic for WAV/MP3 split (UI implemented in v4.1.1).
- **Relaxed Sanitization:** Filenames now support special characters (`#`, `—`, etc) while still filtered for OS safety.
- **Individual File Folders:** "Individual Files" download option now saves files into a named folder in Downloads (e.g. `Downloads/SessionName/Song.wav`).
- **Sidebar Version Display:** Added "Release Build v4.1.0" to sidebar header.

### Fixed
- **Dropdown Stale State:** Fixed issue where dropdown options (Full Session vs Full Playlist) would not update when navigating between pages.
- **MHTML Export:** Fixed `URL.createObjectURL` error and "Tabs cannot be edited" error.

## [v4.0.0] - 2026-02-17
- Major release with sidebar UI, metadata scraping, and batch downloading.
