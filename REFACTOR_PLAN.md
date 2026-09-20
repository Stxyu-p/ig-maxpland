# IG MaxPland — Full Modernization Plan (v3.0.0)

**Objective**: Transform the monolithic 4,098-line userscript into a modular, testable, maintainable architecture while preserving all existing functionality.

**Current Version**: 2.7.2 → **Target**: 3.0.0 "Clean Architecture"

---

## Phase 0: Safety Fixes (P0 — Must Do First)
*Est: 1.5 hr | Blocks: nothing | Risk: Low*

| Task | File/Location | Description |
|------|---------------|-------------|
| 0.1 | `IgBridge.request()` loop | Hoist `accountId` validation out of retry loop (L956, L977, L1017) |
| 0.2 | `downloadResolvedMedia` | Hoist `assertAccount` before download loop (L337) |
| 0.3 | `runInactiveScan` | Hoist `assertAccount` before user loop (L3172) |
| 0.4 | `fetchAllRelationships` | Use `APP_CONFIG.FOLLOWERS_PAGE_SAFETY_LIMIT` / `FOLLOWING_PAGE_SAFETY_LIMIT` directly (L1156) |
| 0.5 | `lostFollowers` username fallback | Add migration logic for pre-v6 snapshots (L2670) |
| 0.6 | `unfollowUser` CSRF | Add cookie refresh hint before throwing AUTH (L1037) |
| 0.7 | `downloadByShortcode` | Add retry 2× with exponential backoff (L3490) |

**Deliverable**: Patch file `patches/00-safety-fixes.patch` + verified working script

---

## Phase 1: Core Module Extraction (P1 — High Leverage)
*Est: 6-8 hr | Blocks: Phase 2 | Risk: Medium*

### 1.1 `IgAuth` Module
**Extracted from**: `IgBridge.resolveCurrentUser`, `IgBridge.getCookie`, `IgBridge.assertAccount`, `IgBridge.isSessionError`, `IgBridge.cooldownUntil`, `IgBridge.wwwClaim`
**New file**: `src/modules/IgAuth.js`
**API**:
```js
IgAuth.getCurrentUser() → {id, username}
IgAuth.validateAccount(accountId) → throws if mismatch
IgAuth.getCookie(name) → string|null
IgAuth.isSessionError(err) → boolean
IgAuth.setWWWClaim(claim) / IgAuth.getWWWClaim()
IgAuth.setCooldown(accountId, untilMs) / IgAuth.getCooldown(accountId)
```

### 1.2 `IgTransport` Module
**Extracted from**: `IgBridge.request`, `IgBridge.fetchRelationshipPage`, `IgBridge.fetchAllRelationships`
**New file**: `src/modules/IgTransport.js`
**Dependencies**: `IgAuth`
**API**:
```js
IgTransport.request(url, options) → data
IgTransport.fetchRelationshipPage(endpoint, userId, cursor, options) → {users, has_more, next_max_id}
IgTransport.fetchAllRelationships(endpoint, userId, safetyLimit, onProgress, speedMode) → array + metadata
```

### 1.3 `IgRelationship` Module
**Extracted from**: `IgBridge.fetchRelationshipPage` (GraphQL fallback), relationship parsing logic in `runRelationshipScan`
**New file**: `src/modules/IgRelationship.js`
**Dependencies**: `IgTransport`, `IgAuth`
**API**:
```js
IgRelationship.computeDiff(followers, following, prevSnapshot) → {notFollowingBack, fans, mutual, lostFollowers}
IgRelationship.detectGhostFollowers(followers) → array
```

### 1.4 `IgMedia` Module
**Extracted from**: `IgBridge.fetchMediaInfo`, `IgBridge.resolveMedia`, `IgBridge.bestImage`, `IgBridge.bestProgressiveVideo`, `IgBridge.shortcodeToMediaId`
**New file**: `src/modules/IgMedia.js`
**Dependencies**: `IgTransport`, `IgAuth`
**API**:
```js
IgMedia.resolve(shortcode) → {item, username, caption, nodes[]}
IgMedia.download(resolved, options) → array of {key, status, files}
```

### 1.5 `IgProfile` Module
**Extracted from**: `IgBridge.fetchUserProfileHD`, `IgBridge.fetchUserLastPost`
**New file**: `src/modules/IgProfile.js`
**Dependencies**: `IgTransport`, `IgAuth`
**API**:
```js
IgProfile.getProfileHD(username) → url|null
IgProfile.getLastPost(userId, options) → {has_posts, last_taken_at, total_posts}
```

### 1.6 `IgUnfollow` Module
**Extracted from**: `IgBridge.unfollowUser`
**New file**: `src/modules/IgUnfollow.js`
**Dependencies**: `IgTransport`, `IgAuth`
**API**:
```js
IgUnfollow.execute(userId, accountId, csrf) → boolean
```

---

## Phase 2: State & UI Architecture (P1-P2)
*Est: 5-6 hr | Blocks: Phase 3 | Risk: Medium*

### 2.1 `StateManager` Class
**Replaces**: Global `STATE` object (L1277-1309)
**New file**: `src/core/StateManager.js`
**Features**:
- Private `#state` with typed getters/setters
- Derived/computed properties (e.g., `notFollowingBack` computed from `followers` + `following`)
- Event emitter for reactive UI updates
- Persistence layer (localStorage + IndexedDB sync)
- Undo/redo for critical operations (whitelist toggle, unfollow)

### 2.2 `ProgressController` Singleton
**Consolidates**: Progress UI updates in `runRelationshipScan`, `runBatchUnfollow`, `runInactiveScan`, `runMediaQueue`
**New file**: `src/ui/ProgressController.js`
**API**:
```js
ProgressController.start({title, total, phases})
ProgressController.update({phase, current, total, message, stats})
ProgressController.finish({success, summary})
ProgressController.error(message)
ProgressController.hide(delayMs)
```

### 2.3 `FilterEngine` Class
**Extracted from**: `getFilteredUsers` (L2715), `setFollowStateChip` (L2747)
**New file**: `src/core/FilterEngine.js`
**API**:
```js
const engine = new FilterEngine(stateManager);
engine.setFilter('not_following_back');
engine.setSubFilter('excludeVerified', true);
engine.setSearchQuery('john');
const results = engine.apply(); // returns filtered array
engine.subscribe(callback); // reactive updates
```

### 2.4 Template-Based UI System
**Replaces**: Inline HTML strings in `createUI()` (L1606-2053)
**New files**:
- `src/ui/templates/*.html` (one per tab + shared components)
- `src/ui/TemplateEngine.js` — simple `${var}` interpolation + component registry
- `src/ui/ComponentRegistry.js` — register/render reusable components (stat-card, user-row, pill-btn, etc.)

---

## Phase 3: Consolidation & Dedup (P1-P2)
*Est: 4-5 hr | Can parallel with Phase 2 | Risk: Low*

### 3.1 `MediaDownloader` Class
**Consolidates**: `downloadResolvedMedia`, `downloadByShortcode`, `runFeedAction`, `handleDirectMediaDownload`, `runMediaQueue`
**New file**: `src/features/MediaDownloader.js`
**API**:
```js
const downloader = new MediaDownloader({stateManager, progressController});
downloader.downloadShortcode(shortcode, {allCarousel, skipExisting});
downloader.downloadQueue(shortcodes[], options);
downloader.downloadFromArticle(articleElement, options);
```

### 3.2 `DOMInjector` Class
**Consolidates**: `injectInFeedDownloadButtons`, `injectStoryDownloadTools`, `injectProfileAvatarBadge`, `startPageObserver`
**New file**: `src/features/DOMInjector.js`
**API**:
```js
const injector = new DOMInjector({stateManager, mediaDownloader});
injector.observe('article', (article) => injector.injectFeedButton(article));
injector.observe('section[story]', (section) => injector.injectStoryToolbar(section));
injector.observe('header[profile]', (header) => injector.injectAvatarBadge(header));
injector.destroy(); // cleanup all observers
```

### 3.3 `StoryStealth` Module
**Consolidates**: `installStorySeenInterceptor`, `StoryMediaRegistry`, `resolveCurrentStoryMedia`, `extractMediaFromFiber`, `pickStoryMedia`, `getActiveStorySection`, `findCenterElement`
**New file**: `src/features/StoryStealth.js`
**Features**:
- Single interceptor installation (fetch + XHR + Beacon)
- LRU-bounded `StoryMediaRegistry` (max 200 items)
- Bounded Fiber walker (depth 30, iteration limit)
- Clean API: `StoryStealth.enable()`, `StoryStealth.disable()`, `StoryStealth.getMedia()`

### 3.4 `CleanFeed` Module
**Consolidates**: `applyCleanFeedMode`, `cleanFeedObserver`
**New file**: `src/features/CleanFeed.js`
**Features**:
- Scoped observation (feed container only)
- IntersectionObserver for new articles
- No layout collapse (visibility + height 0)

---

## Phase 4: Utilities & Helpers (P2-P3)
*Est: 2-3 hr | Can parallel | Risk: Very Low*

### 4.1 `Utils` Namespace
**Extracts**: `escapeHtml`, `csvCell`, `safeFilename`, `extensionFromUrl`, `formatTime`, `sleep`
**New file**: `src/utils/Utils.js`

### 4.2 `IGSelectors` Namespace
**Extracts**: `shortcodeFromArticle`, `getActiveStoryUsername`, `pickStoryMedia`, `extractMediaFromFiber`, `findCenterElement`, `getActiveStorySection`
**New file**: `src/utils/IGSelectors.js`

### 4.3 `DOMUtils` Namespace
**Extracts**: `findCenterElement`, `getActiveStorySection`, event delegation helpers
**New file**: `src/utils/DOMUtils.js`

---

## Phase 5: Event System & Cleanup (P2-P3)
*Est: 2-3 hr | Risk: Low*

### 5.1 Event Delegation System
**Replaces**: 50+ individual `addEventListener` calls in `bindUIEvents`
**New file**: `src/ui/EventDelegator.js`
**Pattern**: Single listener on modal/overlay + `data-action` attributes
```html
<button data-action="unfollow" data-id="123">...</button>
```
```js
EventDelegator.on('click', '[data-action="unfollow"]', handler);
```

### 5.2 Memory Leak Fixes
- `StoryMediaRegistry` → LRU cache
- XHR interceptor → `WeakMap`
- MutationObservers → proper `disconnect()` in `destroy()`
- Event listeners → `AbortController` + `{once: true}` where possible

### 5.3 Dead Code Removal
- Remove `downloadCurrentStoryMedia` / `downloadCurrentStoryCover` (marked skipped)
- Remove `APP_CONFIG.DEFAULT_AVATAR_PATTERNS` (unused)
- Remove `GM_xmlhttpRequest` grant
- Remove `@connect fbcdn.net`
- Remove `STATE.scanIncomplete` flag → state machine

---

## Phase 6: Build & Distribution (P3)
*Est: 1-2 hr | Risk: Low*

### 6.1 Build Script
**New file**: `build.js` (Node.js)
- Concatenates modules in dependency order
- Injects `NATIVE_IG_CSS` as string
- Wraps in IIFE + `'use strict'`
- Generates `@version` from `package.json`
- Outputs `dist/ig_maxpland.user.js`

### 6.2 Development Workflow
- `npm run dev` — watch + rebuild on change
- `npm run build` — production build
- `npm run lint` — eslint (no framework, just style)
- `npm run test` — unit tests for pure functions (FilterEngine, Utils, IgAuth)

---

## Phase 7: Testing & Verification (P3)
*Est: 3-4 hr | Risk: Medium*

### 7.1 Unit Tests (Jest + jsdom)
- `FilterEngine` — all filter combinations
- `Utils` — edge cases (XSS, filenames, CSV)
- `IgAuth` — cookie parsing, account validation
- `StateManager` — derived properties, persistence

### 7.2 Integration Smoke Tests (Manual Checklist)
- [ ] Launch modal via Alt+Shift+M
- [ ] Scan followers + following (mode A, B, C)
- [ ] Switch tabs, filters, search
- [ ] Whitelist add/remove (star button)
- [ ] Single unfollow + batch unfollow
- [ ] Export CSV/JSON
- [ ] Media download from feed + queue + vault
- [ ] Story stealth toggle (seen blocked)
- [ ] Clean feed toggle (ads hidden)
- [ ] Profile avatar HD download
- [ ] Health dashboard sparkline
- [ ] Inactive radar scan
- [ ] Whitelist backup/restore
- [ ] Settings persist across reload

---

## File Structure (Target)

```
ig-maxpland/
├── src/
│   ├── core/
│   │   ├── StateManager.js
│   │   ├── FilterEngine.js
│   │   └── EventBus.js
│   ├── modules/
│   │   ├── IgAuth.js
│   │   ├── IgTransport.js
│   │   ├── IgRelationship.js
│   │   ├── IgMedia.js
│   │   ├── IgProfile.js
│   │   └── IgUnfollow.js
│   ├── features/
│   │   ├── MediaDownloader.js
│   │   ├── DOMInjector.js
│   │   ├── StoryStealth.js
│   │   ├── CleanFeed.js
│   │   └── InactiveRadar.js
│   ├── ui/
│   │   ├── ProgressController.js
│   │   ├── TemplateEngine.js
│   │   ├── ComponentRegistry.js
│   │   ├── EventDelegator.js
│   │   └── templates/
│   │       ├── modal.html
│   │       ├── tab-relationship.html
│   │       ├── tab-health.html
│   │       ├── tab-features.html
│   │       ├── tab-settings.html
│   │       ├── tab-vault.html
│   │       └── components/
│   │           ├── stat-card.html
│   │           ├── user-row.html
│   │           ├── pill-btn.html
│   │           └── ...
│   └── utils/
│       ├── Utils.js
│       ├── IGSelectors.js
│       └── DOMUtils.js
├── patches/
│   └── 00-safety-fixes.patch
├── build.js
├── package.json
├── dist/
│   └── ig_maxpland.user.js (generated)
└── REFACTOR_PLAN.md (this file)
```

---

## Dependency Graph

```
IgAuth (leaf)
    ↑
IgTransport ← IgAuth
    ↑
IgRelationship, IgMedia, IgProfile, IgUnfollow ← IgTransport + IgAuth
    ↑
StateManager (uses all modules)
    ↑
FilterEngine, ProgressController, MediaDownloader, DOMInjector, StoryStealth, CleanFeed, InactiveRadar
    ↑
UI Components (templates + EventDelegator)
    ↑
Main Entry Point (init.js)
```

---

## Rollback Strategy

Each phase produces a working `dist/ig_maxpland.user.js`:
1. **Phase 0** → `dist/v2.7.3-safe.user.js` (drop-in replacement)
2. **Phase 1** → `dist/v2.8.0-modular.user.js` (same UI, modular internals)
3. **Phase 2-3** → `dist/v2.9.0-arch.user.js` (new State/Progress/Filter)
4. **Phase 4-5** → `dist/v3.0.0-rc.user.js` (cleanup + event delegation)
5. **Phase 6-7** → `dist/v3.0.0.user.js` (build system + tests)

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Lines of code (main entry) | < 200 (from 4098) |
| Module count | 15+ focused modules |
| Cyclomatic complexity (avg) | < 10 per function |
| Zero `var` usage | ✓ |
| Zero inline HTML > 50 lines | ✓ |
| Unit test coverage (core) | > 80% |
| Manual smoke test | 100% pass |
| Bundle size (minified) | < 180 KB (currently ~243 KB) |
| Memory growth (1hr session) | < 10 MB |

---

## Execution Order

```
Week 1: Phase 0 → Phase 1.1-1.6 (parallelizable)
Week 2: Phase 2.1-2.4 → Phase 3.1-3.4 (parallelizable)
Week 3: Phase 4 → Phase 5 → Phase 6 → Phase 7
```

---

## Notes for Implementer (MIKA)

- **Never break user-facing behavior** — every refactor must pass smoke tests
- **Preserve `ponytail:` comments** — they document intentional simplifications
- **Keep GM APIs at boundary** — modules receive `GM_download`, `GM_notification` as injected deps
- **No external deps** — vanilla JS only, no build-time transpilation needed for userscript
- **Test in Tampermonkey** — not Node.js (DOM APIs, GM APIs, unsafeWindow)
- **One PR per phase** — atomic, reviewable, revertible

---

## Start Signal

**Ready to begin Phase 0**. First deliverable: `patches/00-safety-fixes.patch` applied to current `ig_maxpland.user.js` producing `ig_maxpland_v2.7.3-safe.user.js`.

Shall I proceed?