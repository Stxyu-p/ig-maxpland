# Changelog

All notable changes to IG MaxPland are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.0] - 2026-10-07

### Added
- **Lost 30d (churn history)**: each completed scan now writes a compact churn row (lost / rejoined / renamed, capped at 1,000 each) into a dedicated `churn` object store. The new Relationships pill lists everyone lost across every retained cycle with the date each loss was detected. Rows are ~1 KB of ids and names, so the 30-cycle view reads ~30 KB instead of the ~15 MB that re-diffing 30 full snapshots would cost. History is a bonus: a vault failure is logged and never fails the scan.

### Changed
- **Daily ceiling now rolls over at local midnight**: the write budget was keyed by the UTC date, so in UTC+7 it reset at 07:00 and effectively handed out two quota windows per local day. Counters now carry a `tz: 'local'` marker, and a legacy UTC counter is adopted rather than silently reset during the upgrade.
- **Snapshot/churn store version 7** (new `churn` store alongside `snapshots`); existing snapshots are untouched and keep working.

### Fixed
- **Resume deadlock**: a checkpoint parked at the page-safety limit made every later scan resume, immediately trip the limit, fail, and keep the poisoned checkpoint forever, with no way to clear it from the UI. Checkpoints at the cap, older than 24h, or belonging to another account are now dropped, and a new **Start fresh** control discards the checkpoint and stops the current scan on demand.

### Validation
- 64/64 invariant checks passing against production bundle bytes, verified again in real Chrome against the built bundle.

## [3.1.0] - 2026-10-07

### Added
- **Daily Unfollow Ceiling**: write actions stop at 180/day by default (90 / 180 / 300 / off in Settings). The ceiling is enforced at the action boundary, so the batch path and the row path cannot disagree, and a batch keeps its remaining selections pending for after the ceiling is raised.
- **Snapshot Retention**: the IndexedDB snapshot store now keeps the newest 30 complete snapshots per account and prunes the rest in the same transaction, so a long-lived install no longer grows without bound.

### Changed
- **Scan Resume Checkpointing**: the resume checkpoint is written every 5th page (or 20s) and forced on abort or failure, instead of rewriting the entire accumulated list to localStorage on every page. A 12k-user scan previously rewrote ~1 MB every few seconds and silently lost resume once the storage quota tripped.
- **Keystroke Coalescing**: relationship search now coalesces keystrokes into one render, instead of filtering the whole pool and rebuilding the row list per character.

### Fixed
- **Init Containment**: every page injector (stealth interceptor, clean feed, feed tools, story bar, profile badge, menu listener) runs in its own contained step, and the page observer starts before them. One failing injector can no longer take down the toolbar, the badge, and the observer for the whole page load.

### Validation
- 58/58 invariant checks passing against production bundle bytes.

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
