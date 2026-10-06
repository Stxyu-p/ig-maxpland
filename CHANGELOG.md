# Changelog

All notable changes to IG MaxPland are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.1] - 2026-10-06

### Added
- **Multi-Tier Rate Limit Resilience**: Split rate-limit handling into soft (HTTP 429 backoff) and hard tiers; gracefully pauses with checkpointed state instead of aborting scans.
- **Action Pacing Engine**: Randomized 15–30s human-like delay pacing per unfollow operation to eliminate account action flags.
- **Keypress Optimization**: Optimized relationship search index; eliminated redundant set reconstruction on every keystroke (67.9 ms → 1.6 ms latency).

### Fixed
- **Dead Code Pruning**: Removed 190 KB of dead code across 17 unreferenced module subtrees; unified single-source build pipeline outputting directly to `dist/ig_maxpland_en.user.js`.
- **Persistent Hard Block**: Hard action block latches to `localStorage` across page reloads with confirmation modal for unlocking via Settings.
- **Line Ending Drift**: Normalized CRLF line endings across build output to guarantee byte-for-byte distribution consistency.

### Validation
- 51/51 invariant checks passing against production bundle bytes.

## [3.0.0] - 2026-10-01

### Added
- **Architecture Rewrite**: Pure vanilla JavaScript runtime with zero external dependencies and zero telemetry.
- **Relationship Scanner**: In-memory scan for non-followers, mutuals, fans, and whitelisted profiles with real-time heartbeat progress.
- **Clean HD Media Downloader**: Direct full-resolution media extraction for profile avatars, posts, and reels with sanitized metadata filenames.
- **Local-Only Storage**: All relationship states and whitelists persist exclusively in browser local storage (`GM_setValue`).
