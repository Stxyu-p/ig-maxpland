# IG MaxPland

> **Instagram Relationship Scanner & Full-Spectrum HD Media Downloader**  
> A lightweight, zero-dependency, anti-bloat Tampermonkey userscript for Instagram Web.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.5.0-emerald.svg)](ig_maxpland_en.user.js)
[![Platform](https://img.shields.io/badge/platform-Tampermonkey%20%7C%20Violentmonkey-orange.svg)](#installation)

---

## ✨ Features

### 🔍 1. Relationship Scanner & Analyzer
- **Not Following Back**: Identify users you follow who do not follow you back.
- **Fans**: Users following you whom you don't follow back.
- **Mutual Following**: Two-way connections.
- **Lost Followers**: Historical comparison using local snapshots to identify unfollowers since your last scan.
- **Ghost Accounts**: Flag suspected bot or inactive accounts (no avatar, long numeric IDs).
- **Sub-Filters**: Hide verified users, private accounts, whitelisted accounts, or no-avatar accounts with one click.
- **Exporting**: Export filtered lists directly to **CSV** or **JSON**, or copy usernames to clipboard.

### 🛡️ 2. Whitelist Manager
- Protect friends, family, and favorite accounts from ever being unfollowed.
- One-click Star/Unstar toggle in the list.
- **Backup & Restore**: Export your whitelist map to a local JSON file and restore it anytime.

### ⚡ 3. Safe Unfollow Automation
- Select accounts individually or select all on the current page.
- **Safe Rate-Limiting**: Random 3–5 second delay between unfollow requests to stay under Instagram's radar and avoid account action blocks.
- **Manual Pause / Stop**: Abort anytime with an instant stop button.

### 📥 4. In-Feed Post Downloader (HD)
- Injected seamlessly next to the native bookmark/save icon on feed posts and reels.
- **Dynamic Recognition**: Detects whether the post is a high-resolution Photo (`.jpg`) or Video (`.mp4`).
- **Carousel Downloader**: Download all slides in multi-image/video albums directly to your downloads folder.
- **Quick Double-Click**: Double-click the download button on any post for instant one-click download.
- **Open in New Tab**: Directly open the raw high-resolution media CDN URL.

### 📱 5. Story Tools
- Floating toolbar on active Instagram Stories.
- Download current story video or photo in original resolution.
- Extract story thumbnail.
- Open story stream in a new tab.

### 👤 6. HD Profile Picture (Avatar)
- Adds an **"HD Profile Pic"** badge directly beside usernames on Instagram profile pages.
- Fetches and downloads uncompressed, full-resolution profile avatars with a single click.

### 🗄️ 7. Media Vault
- Embedded local history in IndexedDB (`IG_MAXPLAND_VAULT`).
- Tracks downloaded posts and provides links to revisit them.
- Batch queue: Paste a list of Instagram URLs / shortcodes to download in sequence.

---

## 🚀 Installation

1. Install a userscript manager in your browser:
   - [Tampermonkey](https://www.tampermonkey.net/) (Recommended)
   - [Violentmonkey](https://violentmonkey.github.io/)
2. Click to install:
   - **English (Public Release)**: [ig_maxpland_en.user.js](https://raw.githubusercontent.com/ChokechaiXD/ig-maxpland/main/ig_maxpland_en.user.js)
   - **Thai (Local Version)**: [ig_maxpland.user.js](https://raw.githubusercontent.com/ChokechaiXD/ig-maxpland/main/ig_maxpland.user.js)
3. Navigate to [instagram.com](https://www.instagram.com/) and refresh the page!

---

## ⌨️ Shortcuts & Controls

| Shortcut / Action | Description |
| :--- | :--- |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd> | Open / Close MaxPland Studio |
| **Floating Circle** (Bottom-right) | Click to open Studio, or click and drag anywhere on screen |
| **Double-Click** (Post Download Button) | Instant one-click direct download |

---

## 🔒 Privacy & Security

- **100% Client-Side**: Operates entirely within your browser context.
- **No Third-Party Servers**: Requests go directly between your browser and Instagram's official API endpoints.
- **Zero Analytics / Telemetry**: No tracking scripts, no phone-home servers.
- **Zero External Dependencies**: Pure Vanilla JavaScript with zero external scripts (`@require` is not used).

---

## 📄 License

Released under the [MIT License](LICENSE).
Copyright (c) 2026 P Choke & SORA.
