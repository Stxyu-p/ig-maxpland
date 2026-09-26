// ==UserScript==
// @name         IG MaxPland
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  Instagram Relationship Scanner & Comprehensive Media Downloader (Clean Architecture v3.0.0)
// @author       P Choke & SORA
// @match        https://*.instagram.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=instagram.com
// @grant        GM_download
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @connect      instagram.com
// @connect      cdninstagram.com
// @run-at       document-start
// @homepageURL  https://github.com/Stxyu-p/ig-maxpland
// @supportURL   https://github.com/Stxyu-p/ig-maxpland/issues
// @updateURL    https://raw.githubusercontent.com/Stxyu-p/ig-maxpland/main/ig_maxpland_en.user.js
// @downloadURL  https://raw.githubusercontent.com/Stxyu-p/ig-maxpland/main/ig_maxpland_en.user.js
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    /* ==========================================================================
       APPLICATION RUNTIME - Global English (modules live in src/, covered by phase1-5)
       ========================================================================== */

    /* ==========================================================================
       APPLICATION RUNTIME & UI GLUE (Global English)
       ========================================================================== */


    /* ==========================================================================
       1. CONSTANTS & DESIGN TOKENS (Anti-Slop / Clean Minimal Precision)
       ========================================================================== */

    const APP_CONFIG = {
        APP_NAME: 'IG MaxPland',
        DB_NAME: 'IG_MAXPLAND_VAULT',
        DB_VERSION: 6,
        PAGE_SIZE: 50,
        INSTAGRAM_WEB_APP_ID: '936619743392459',
        FOLLOWING_PAGE_SAFETY_LIMIT: 60,
        FOLLOWERS_PAGE_SAFETY_LIMIT: 250,
        // Sweet spot (2026-09-24, same study as PACE_PRESETS): write actions restrict
        // accounts far faster than reads — 15-30 s randomized per unfollow replaces
        // the old 4.5-7.5 s (~500-800 actions/hour was well above safe guidance).
        UNFOLLOW_DELAY_MIN: 15000,
        UNFOLLOW_DELAY_MAX: 30000,
    };
    const HARD_BLOCK_KEY = 'maxpland_hard_block';
    const WRITE_BUDGET_KEY = 'maxpland_write_budget';

    const ICONS = {
        LOGO: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>`,
        CLOSE: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
        USERS: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        DOWNLOAD: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        DOWNLOAD_ALL: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/></svg>`,
        THUMBNAIL: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
        STAR: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        STAR_FILLED: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        SEARCH: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
        EXTERNAL: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
        STOP: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
        UNFOLLOW: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="11" x2="23" y2="11"/></svg>`,
        COPY: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
        VERIFIED: `<svg width="13" height="13" viewBox="0 0 24 24" fill="#38bdf8"><path d="M12 2l2.4 2.4 3.4-.4 1.4 3.1 3.2 1.3-.4 3.4 2.4 2.4-2.4 2.4.4 3.4-3.2 1.3-1.4 3.1-3.4-.4L12 22l-2.4-2.4-3.4.4-1.4-3.1-3.2-1.3.4-3.4L-2 12l2.4-2.4-.4-3.4 3.2-1.3 1.4-3.1 3.4.4L12 2zm-1.5 13.5l5.5-5.5-1.4-1.4-4.1 4.1-2.1-2.1-1.4 1.4 3.5 3.5z"/></svg>`,
        LOCK: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        BACKUP: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
        RESTORE: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        AVATAR: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>`,
        EYE: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
        SHIELD: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        ANALYTICS: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`,
        FEATURES: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
        SETTINGS: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
        CLOCK: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
    };

    const NATIVE_IG_CSS = `
        :root {
            --mp-bg-root: #0b0d10;
            --mp-bg-surface: #12151b;
            --mp-bg-panel: #171b23;
            --mp-bg-card: #1e232d;
            --mp-bg-elevated: #252b37;
            --mp-bg-hover: #2b3240;
            --mp-border-subtle: rgba(255, 255, 255, 0.08);
            --mp-border-card: #2e3544;
            --mp-border-active: rgba(255, 255, 255, 0.25);
            --mp-text-primary: #f8fafc;
            --mp-text-secondary: #94a3b8;
            --mp-text-muted: #64748b;
            --mp-blue: #0284c7;
            --mp-blue-hover: #0369a1;
            --mp-rose: #f43f5e;
            --mp-rose-bg: rgba(244, 63, 94, 0.14);
            --mp-emerald: #10b981;
            --mp-emerald-bg: rgba(16, 185, 129, 0.14);
            --mp-amber: #f59e0b;
            --mp-amber-bg: rgba(245, 158, 11, 0.14);
            --mp-cyan: #0ea5e9;
            --mp-cyan-bg: rgba(14, 165, 233, 0.14);
            --mp-shadow-modal: 0 12px 32px rgba(0, 0, 0, 0.6), 0 32px 80px rgba(0, 0, 0, 0.85);
            --mp-shadow-card: 0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        #maxpland-studio-modal {
            position: fixed; inset: 50% auto auto 50%; transform: translate(-50%, -50%); z-index: 100000;
            width: min(1040px, 95vw); height: min(780px, 90dvh); max-height: 90dvh;
            display: grid; grid-template-columns: 190px minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr) auto;
            grid-template-areas: 'header header' 'nav progress' 'nav main' 'footer footer';
            background: var(--mp-bg-surface); color: var(--mp-text-primary); border: 1px solid var(--mp-border-subtle);
            border-radius: 12px; overflow: hidden; box-shadow: var(--mp-shadow-modal);
            font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            text-align: left; color-scheme: dark;
        }
        #maxpland-studio-modal, #maxpland-studio-modal * { box-sizing: border-box; }
        #maxpland-studio-modal button, #maxpland-studio-modal input, #maxpland-studio-modal textarea { font: inherit; }
        #maxpland-studio-modal button { cursor: pointer; }
        #maxpland-studio-modal button:disabled { cursor: not-allowed; opacity: .5; }
        #maxpland-studio-modal :focus-visible, #maxpland-trigger-btn:focus-visible { outline: 2px solid var(--mp-blue); outline-offset: 2px; }

        #maxpland-studio-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); z-index: 99999; backdrop-filter: blur(2px); }

        /* Mini Floating Draggable Launcher */
        #maxpland-trigger-btn {
            position: fixed; right: 24px; bottom: 24px; z-index: 99998;
            width: 44px; height: 44px; border-radius: 50%; padding: 0;
            display: grid; place-items: center;
            appearance: none; -webkit-appearance: none;
            border: 1.5px solid #0284c7; background: #171b23; color: #38bdf8;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 12px rgba(2, 132, 199, 0.35);
            cursor: grab; user-select: none; touch-action: none;
            transition: border-color .15s ease, box-shadow .15s ease, transform .12s ease;
        }
        #maxpland-trigger-btn:hover {
            border-color: #38bdf8; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6), 0 0 16px rgba(56, 189, 248, 0.5);
            transform: scale(1.05);
        }
        #maxpland-trigger-btn:active { cursor: grabbing; transform: scale(0.98); }

        /* Header */
        .maxpland-header {
            grid-area: header; height: 52px; border-bottom: 1px solid var(--mp-border-subtle);
            display: flex; align-items: center; justify-content: space-between; padding: 0 18px;
            background: var(--mp-bg-surface);
        }
        .maxpland-brand { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 14px; }
        .maxpland-user-pill {
            font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px;
            background: var(--mp-bg-panel); color: #38bdf8; border: 1px solid var(--mp-border-card);
            display: inline-flex; align-items: center; gap: 5px;
        }
        .maxpland-close-btn {
            background: none; border: 1px solid transparent; color: var(--mp-text-secondary);
            padding: 6px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
            transition: background-color .15s, color .15s;
        }
        .maxpland-close-btn:hover { background: var(--mp-bg-hover); color: var(--mp-text-primary); border-color: var(--mp-border-subtle); }

        /* Sidebar Navigation */
        .maxpland-tabs {
            grid-area: nav; border-right: 1px solid var(--mp-border-subtle); padding: 14px 10px;
            display: flex; flex-direction: column; gap: 6px; background: var(--mp-bg-panel);
        }
        .maxpland-tab-btn {
            display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid transparent; background: none;
            color: var(--mp-text-secondary); border-radius: 8px; text-align: left; font-weight: 600; font-size: 13px;
            transition: background-color .15s, color .15s, border-color .15s;
        }
        .maxpland-tab-btn:hover { background: var(--mp-bg-hover); color: var(--mp-text-primary); }
        .maxpland-tab-btn.active {
            background: var(--mp-bg-card); color: var(--mp-text-primary);
            border-color: var(--mp-border-card);
        }

        /* Scan Progress & Action Strip */
        .maxpland-progress-container {
            grid-area: progress; display: none; padding: 12px 18px; background: var(--mp-bg-panel);
            border-bottom: 1px solid var(--mp-border-subtle);
        }
        .maxpland-scan-row {
            display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 12.5px;
        }
        .maxpland-scan-phase { font-weight: 600; color: #38bdf8; display: flex; align-items: center; gap: 6px; }
        .maxpland-scan-meta {
            font-variant-numeric: tabular-nums; color: var(--mp-text-secondary); font-size: 12px; display: flex; align-items: center; gap: 12px;
        }
        .maxpland-progress-track {
            height: 6px; background: #0b0d10; border-radius: 3px; overflow: hidden; border: 1px solid var(--mp-border-subtle);
        }
        .maxpland-progress-bar {
            height: 100%; width: 0; background: linear-gradient(90deg, var(--mp-blue), #6366f1);
            transition: width .2s ease-out; border-radius: 3px;
        }
        .maxpland-scan-notice {
            font-size: 11.5px; color: #fbbf24; margin-top: 6px; display: none; font-weight: 500;
        }

        /* Main Content Body */
        .maxpland-body { grid-area: main; overflow-y: auto; padding: 18px 20px; background: var(--mp-bg-surface); position: relative; }
        .maxpland-tab-content { display: none; }
        .maxpland-tab-content.active { display: block; }

        /* Stat Cards */
        .maxpland-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px; }
        .maxpland-stat-card {
            background: var(--mp-bg-card); border: 1px solid var(--mp-border-card); border-radius: 8px;
            padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; box-shadow: var(--mp-shadow-card);
            position: relative; overflow: hidden; cursor: pointer; transition: border-color .15s, transform .12s;
        }
        .maxpland-stat-card:hover { border-color: var(--mp-border-active); transform: translateY(-1px); }
        .maxpland-stat-card::before {
            content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
        }
        .maxpland-stat-card.card-not-following::before { background: var(--mp-rose); }
        .maxpland-stat-card.card-fans::before { background: var(--mp-cyan); }
        .maxpland-stat-card.card-mutual::before { background: var(--mp-emerald); }
        .maxpland-stat-card.card-lost::before { background: var(--mp-amber); }
        .maxpland-stat-card.card-ghost::before { background: #a855f7; }

        .maxpland-stat-label { font-size: 11px; color: var(--mp-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .4px; }
        .maxpland-stat-value {
            font-size: 24px; font-weight: 800; color: var(--mp-text-primary); line-height: 1.1;
            font-variant-numeric: tabular-nums;
        }
        .maxpland-stat-hint { font-size: 11px; color: var(--mp-text-secondary); }

        /* Toolbars & Filters */
        .maxpland-toolbar {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            margin-bottom: 12px; flex-wrap: wrap;
        }
        .maxpland-filter-group { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
        .maxpland-pill-btn {
            padding: 5px 12px; border-radius: 6px; border: 1px solid var(--mp-border-card);
            background: var(--mp-bg-panel); color: var(--mp-text-secondary); font-size: 12px; font-weight: 600;
            display: inline-flex; align-items: center; gap: 6px; transition: all .15s;
        }
        .maxpland-pill-btn:hover { background: var(--mp-bg-hover); color: var(--mp-text-primary); border-color: var(--mp-border-active); }
        .maxpland-pill-btn.active {
            background: var(--mp-text-primary); color: var(--mp-bg-root); border-color: var(--mp-text-primary);
        }
        .maxpland-pill-count {
            font-size: 10.5px; opacity: .85; font-variant-numeric: tabular-nums;
        }

        /* Sub-filter chips */
        .maxpland-subfilters {
            display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; font-size: 11.5px; color: var(--mp-text-secondary);
        }
        .maxpland-export-actions {
            display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;
        }
        .maxpland-chip-toggle {
            display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 5px;
            background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card); cursor: pointer; user-select: none;
            transition: all .12s;
        }
        .maxpland-chip-toggle:hover { border-color: var(--mp-border-active); color: var(--mp-text-primary); }
        .maxpland-chip-toggle.active {
            background: #1e293b; border-color: #38bdf8; color: #38bdf8;
        }

        /* Search Input */
        .maxpland-search-box {
            display: flex; align-items: center; gap: 8px; background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card);
            border-radius: 6px; padding: 6px 10px; color: var(--mp-text-muted); min-width: 220px;
        }
        .maxpland-search-box:focus-within { border-color: var(--mp-blue); color: var(--mp-text-primary); }
        .maxpland-search-box input {
            background: none; border: none; outline: none; color: var(--mp-text-primary); font-size: 12px; width: 100%;
        }

        /* Action Buttons */
        .maxpland-btn-primary {
            background: var(--mp-blue); color: #fff; border: 1px solid transparent; border-radius: 6px;
            padding: 7px 14px; font-weight: 600; font-size: 12.5px; display: inline-flex; align-items: center; gap: 7px;
            transition: background-color .15s;
        }
        .maxpland-btn-primary:hover { background: var(--mp-blue-hover); }
        .maxpland-btn-secondary {
            background: var(--mp-bg-card); color: var(--mp-text-primary); border: 1px solid var(--mp-border-card);
            border-radius: 6px; padding: 7px 12px; font-weight: 600; font-size: 12.5px; display: inline-flex; align-items: center; gap: 7px;
            transition: background-color .15s, border-color .15s;
        }
        .maxpland-btn-secondary:hover { background: var(--mp-bg-hover); border-color: var(--mp-border-active); }
        .maxpland-btn-danger {
            background: var(--mp-rose-bg); color: #fda4af; border: 1px solid rgba(244, 63, 94, 0.3);
            border-radius: 6px; padding: 5px 11px; font-weight: 600; font-size: 11.5px; display: inline-flex; align-items: center; gap: 5px;
            transition: background-color .15s;
        }
        .maxpland-btn-danger:hover { background: rgba(244, 63, 94, 0.28); }

        /* Floating / Sticky Bulk Action Bar */
        .maxpland-bulk-bar {
            display: none; align-items: center; justify-content: space-between; padding: 8px 14px;
            background: #1e293b; border: 1px solid #38bdf8; border-radius: 8px; margin-bottom: 12px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4); animation: mpFadeIn .15s ease-out;
        }
        .maxpland-bulk-info { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 12.5px; color: #f8fafc; }
        .maxpland-bulk-actions { display: flex; align-items: center; gap: 8px; }

        /* User List */
        .maxpland-user-list {
            background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card); border-radius: 8px;
            overflow: hidden; max-height: 420px; overflow-y: auto; position: relative;
        }
        .maxpland-user-row {
            display: flex; align-items: center; justify-content: space-between; padding: 8px 14px;
            border-bottom: 1px solid var(--mp-border-subtle); gap: 12px; transition: background-color .12s;
        }
        .maxpland-user-row:last-child { border-bottom: none; }
        .maxpland-user-row:hover { background: var(--mp-bg-hover); }
        .maxpland-user-left { display: flex; align-items: center; gap: 11px; min-width: 0; }
        
        .maxpland-checkbox {
            appearance: none; -webkit-appearance: none; width: 16px; height: 16px; border: 1.5px solid var(--mp-border-card);
            border-radius: 4px; background: var(--mp-bg-card); cursor: pointer; display: grid; place-items: center;
            flex: 0 0 16px; transition: all .12s;
        }
        .maxpland-checkbox:checked {
            background: var(--mp-blue); border-color: var(--mp-blue);
        }
        .maxpland-checkbox:checked::after {
            content: ''; width: 4px; height: 8px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg) translate(-1px, -1px);
        }
        .maxpland-checkbox:disabled { cursor: not-allowed; opacity: .3; }

        .maxpland-avatar {
            width: 36px; height: 36px; border-radius: 50%; object-fit: cover;
            background: var(--mp-bg-elevated); border: 1px solid var(--mp-border-subtle);
            display: grid; place-items: center; font-weight: 700; flex: 0 0 36px; color: var(--mp-text-secondary);
        }
        .maxpland-user-names { display: flex; flex-direction: column; min-width: 0; }
        .maxpland-username-wrap { display: flex; align-items: center; gap: 6px; }
        .maxpland-username {
            font-weight: 650; font-size: 13px; color: var(--mp-text-primary); text-decoration: none;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .maxpland-username:hover { text-decoration: underline; color: #38bdf8; }
        .maxpland-fullname { font-size: 11.5px; color: var(--mp-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .maxpland-status-tag {
            font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px;
        }
        .maxpland-status-tag.not_following { background: var(--mp-rose-bg); color: #fda4af; border: 1px solid rgba(244, 63, 94, 0.25); }
        .maxpland-status-tag.fan { background: var(--mp-cyan-bg); color: #7dd3fc; border: 1px solid rgba(14, 165, 233, 0.25); }
        .maxpland-status-tag.mutual { background: var(--mp-emerald-bg); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.25); }
        .maxpland-status-tag.lost { background: var(--mp-amber-bg); color: #fde68a; border: 1px solid rgba(245, 158, 11, 0.25); }
        .maxpland-status-tag.ghost { background: rgba(168, 85, 247, 0.14); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.25); }

        .maxpland-user-actions { display: flex; align-items: center; gap: 6px; }
        .maxpland-icon-action {
            background: none; border: none; cursor: pointer; padding: 6px; color: var(--mp-text-muted);
            border-radius: 5px; display: flex; align-items: center; justify-content: center;
            transition: color .15s, background-color .15s;
        }
        .maxpland-icon-action:hover { color: var(--mp-text-primary); background: var(--mp-bg-elevated); }
        .maxpland-row-unfollow-btn {
            background: var(--mp-bg-elevated); color: #fda4af; border: 1px solid rgba(244, 63, 94, 0.2);
            border-radius: 5px; padding: 4px 8px; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;
            transition: all .12s;
        }
        .maxpland-row-unfollow-btn:hover { background: var(--mp-rose-bg); border-color: rgba(244, 63, 94, 0.4); color: #fff; }

        /* Toast Notification */
        .maxpland-toast {
            position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #1e293b; color: #f8fafc; border: 1px solid #38bdf8;
            padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 600;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 100005; pointer-events: none;
            opacity: 0; transition: opacity .2s ease, transform .2s ease;
        }
        .maxpland-toast.show { opacity: 1; transform: translate(-50%, -6px); }

        /* Footer */
        .maxpland-footer {
            grid-area: footer; height: 38px; border-top: 1px solid var(--mp-border-subtle); background: var(--mp-bg-surface);
            padding: 0 18px; display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: var(--mp-text-muted);
        }
        .maxpland-footer kbd {
            background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card); border-radius: 4px;
            padding: 2px 5px; font-size: 10px; font-family: ui-monospace, monospace; color: var(--mp-text-secondary);
        }

        /* In-feed Native Action Bar Integration (Zero Vertical Space Waste) */
        .maxpland-action-wrap {
            display: inline-flex;
            align-items: center;
            position: relative;
            z-index: 50;
        }
        .maxpland-action-btn {
            background: none;
            border: none;
            padding: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: inherit;
            border-radius: 50%;
            transition: transform .12s ease, opacity .12s ease, color .12s ease;
            line-height: 1;
        }
        .maxpland-action-btn:hover {
            opacity: 0.75;
            transform: scale(1.08);
            color: #38bdf8;
        }
        .maxpland-action-btn:active {
            transform: scale(0.95);
        }
        .maxpland-action-btn svg {
            width: 24px;
            height: 24px;
        }
        .maxpland-action-btn.loading {
            animation: mpPulse 1s infinite alternate;
            pointer-events: none;
            opacity: 0.5;
        }

        /* Native-integrated Glassmorphism Popover Menu */
        .maxpland-action-menu {
            position: absolute;
            bottom: calc(100% + 8px);
            right: 0;
            background: rgba(18, 21, 27, 0.96);
            backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 10px;
            padding: 6px;
            display: none;
            flex-direction: column;
            gap: 2px;
            min-width: 200px;
            box-shadow: 0 10px 32px rgba(0, 0, 0, 0.75);
            z-index: 1000;
            animation: mpFadeIn .14s ease-out;
        }
        .maxpland-action-menu.show {
            display: flex;
        }
        .maxpland-menu-item {
            background: none;
            border: none;
            color: #f8fafc;
            padding: 7px 11px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 9px;
            text-align: left;
            transition: background-color .12s, color .12s;
            white-space: nowrap;
        }
        .maxpland-menu-item:hover {
            background: #0284c7;
            color: #ffffff;
        }
        .maxpland-menu-item svg {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
        }
        .maxpland-menu-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.08);
            margin: 3px 0;
        }

        @keyframes mpPulse {
            from { transform: scale(1); opacity: 0.6; }
            to { transform: scale(1.15); opacity: 1; color: #38bdf8; }
        }

        /* Floating Story Tools */
        .maxpland-story-tools {
            position: fixed; top: 18px; right: 80px; z-index: 10001;
            display: flex; align-items: center; gap: 6px; background: rgba(18, 21, 27, 0.85);
            backdrop-filter: blur(8px); border: 1px solid var(--mp-border-subtle); border-radius: 20px; padding: 4px 10px;
        }
        .maxpland-story-btn {
            background: none; border: none; color: #f8fafc; font-size: 12px; font-weight: 600; cursor: pointer;
            display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 12px;
            transition: background .15s;
        }
        .maxpland-story-btn:hover { background: rgba(255,255,255,0.12); color: #38bdf8; }

        /* Profile Avatar HD Download Badge */
        .maxpland-avatar-badge {
            display: inline-flex; align-items: center; gap: 5px; margin-left: 10px;
            background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card); border-radius: 6px;
            padding: 4px 10px; font-size: 11.5px; font-weight: 600; color: #38bdf8; cursor: pointer;
            transition: all .12s; vertical-align: middle;
        }
        .maxpland-avatar-badge:hover { background: var(--mp-bg-hover); border-color: #38bdf8; }

        @keyframes mpFadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Feature Cards & Switch Controllers */
        .maxpland-feature-card {
            display: flex; align-items: center; justify-content: space-between; gap: 16px;
            padding: 14px 16px; background: var(--mp-bg-card); border: 1px solid var(--mp-border-card);
            border-radius: 8px; margin-bottom: 10px; transition: border-color .15s;
        }
        .maxpland-feature-card:hover { border-color: var(--mp-border-active); }
        .maxpland-feature-info { flex: 1; }
        .maxpland-feature-title { font-size: 13.5px; font-weight: 600; color: var(--mp-text-primary); display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .maxpland-feature-desc { font-size: 11.5px; color: var(--mp-text-secondary); line-height: 1.45; }
        .maxpland-badge-emerald { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: var(--mp-emerald-bg); color: var(--mp-emerald); font-weight: 700; text-transform: uppercase; }

        /* Modern Toggle Switch */
        .maxpland-switch { position: relative; display: inline-block; width: 42px; height: 22px; flex-shrink: 0; }
        .maxpland-switch input { opacity: 0; width: 0; height: 0; }
        .maxpland-slider {
            position: absolute; cursor: pointer; inset: 0; background-color: var(--mp-bg-hover);
            transition: .2s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 22px; border: 1px solid var(--mp-border-card);
        }
        .maxpland-slider:before {
            position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px;
            background-color: var(--mp-text-secondary); transition: .2s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 50%;
        }
        .maxpland-switch input:checked + .maxpland-slider { background-color: var(--mp-blue); border-color: var(--mp-blue); }
        .maxpland-switch input:checked + .maxpland-slider:before { transform: translateX(20px); background-color: #fff; }

        /* Settings Panels */
        .maxpland-settings-group {
            background: var(--mp-bg-card); border: 1px solid var(--mp-border-card); border-radius: 8px;
            padding: 14px 16px; margin-bottom: 12px;
        }
        .maxpland-settings-group-title { font-size: 13px; font-weight: 700; color: var(--mp-text-primary); margin: 0 0 10px; display: flex; align-items: center; gap: 6px; }
        .maxpland-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 0; border-top: 1px solid var(--mp-border-subtle); }
        .maxpland-settings-row:first-of-type { border-top: none; padding-top: 0; }
        .maxpland-select {
            background: var(--mp-bg-panel); color: var(--mp-text-primary); border: 1px solid var(--mp-border-card);
            border-radius: 6px; padding: 5px 10px; font-size: 12px; outline: none; cursor: pointer;
        }

        /* Health Dashboard Elements */
        .maxpland-health-hero {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 14px;
        }
        .maxpland-health-card {
            background: var(--mp-bg-card); border: 1px solid var(--mp-border-card); border-radius: 8px; padding: 14px 16px;
        }
        .maxpland-health-title { font-size: 11px; font-weight: 700; color: var(--mp-text-muted); text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px; }
        .maxpland-health-val { font-size: 22px; font-weight: 800; color: var(--mp-text-primary); font-variant-numeric: tabular-nums; }
        .maxpland-health-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 8px; border-radius: 5px; font-weight: 600; margin-top: 6px; }
        .maxpland-chart-box {
            background: var(--mp-bg-card); border: 1px solid var(--mp-border-card); border-radius: 8px; padding: 16px; margin-bottom: 14px;
        }
        .maxpland-sparkline { width: 100%; height: 130px; overflow: visible; }
    `;

    /* ==========================================================================
       2. DATABASE LAYER (IndexedDB with Whitelist Backup & Restore)
       ========================================================================== */

    class MaxPlandVault {
        static db = null;
        static opening = null;

        static async init() {
            if (this.db) return this.db;
            if (this.opening) return this.opening;
            this.opening = new Promise((resolve, reject) => {
                const req = indexedDB.open(APP_CONFIG.DB_NAME, APP_CONFIG.DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('snapshots')) {
                        db.createObjectStore('snapshots', { keyPath: 'timestamp' });
                    }
                    if (!db.objectStoreNames.contains('whitelist')) {
                        db.createObjectStore('whitelist', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('media_vault')) {
                        const vault = db.createObjectStore('media_vault', { keyPath: 'key' });
                        vault.createIndex('downloaded_at', 'downloaded_at', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('user_activity')) {
                        db.createObjectStore('user_activity', { keyPath: 'id' });
                    }
                };
                req.onsuccess = (e) => {
                    this.db = e.target.result;
                    this.db.onversionchange = () => { this.db.close(); this.db = null; };
                    resolve(this.db);
                };
                req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
            }).finally(() => { this.opening = null; });
            return this.opening;
        }

        static async getWhitelist() {
            const db = await this.init();
            return new Promise((resolve) => {
                const tx = db.transaction('whitelist', 'readonly');
                const store = tx.objectStore('whitelist');
                const req = store.getAll();
                req.onsuccess = () => resolve(new Map((req.result || []).map(item => [String(item.id), item])));
                req.onerror = () => resolve(new Map());
            });
        }

        static async toggleWhitelist(user) {
            const db = await this.init();
            const uid = String(user.pk || user.pk_id || user.id || '');
            if (!uid) throw new Error('Missing user ID');
            return new Promise((resolve, reject) => {
                const tx = db.transaction('whitelist', 'readwrite');
                const store = tx.objectStore('whitelist');
                let added = false;
                const req = store.get(uid);
                req.onsuccess = () => {
                    added = !req.result;
                    if (added) {
                        store.put({
                            id: uid,
                            username: user.username,
                            full_name: user.full_name || '',
                            profile_pic_url: user.profile_pic_url || '',
                            is_verified: Boolean(user.is_verified),
                            is_private: Boolean(user.is_private),
                            added_at: Date.now()
                        });
                    } else {
                        store.delete(uid);
                    }
                };
                tx.oncomplete = () => resolve(added);
                tx.onerror = () => reject(tx.error);
            });
        }

        static async importWhitelist(usersList) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('whitelist', 'readwrite');
                const store = tx.objectStore('whitelist');
                let count = 0;
                for (const u of usersList) {
                    const uid = String(u.id || u.pk || u.pk_id || '');
                    if (uid) {
                        store.put({
                            id: uid,
                            username: u.username || 'unknown',
                            full_name: u.full_name || '',
                            profile_pic_url: u.profile_pic_url || '',
                            is_verified: Boolean(u.is_verified),
                            is_private: Boolean(u.is_private),
                            added_at: u.added_at || Date.now()
                        });
                        count++;
                    }
                }
                tx.oncomplete = () => resolve(count);
                tx.onerror = () => reject(tx.error);
            });
        }

        static async saveSnapshot(followers, following, accountId = null, signal = null) {
            if (followers.completed !== true || following.completed !== true) throw new Error('Cannot save snapshot from incomplete scan data');
            const db = await this.init();
            IgBridge.assertAccount(accountId);
            if (signal?.aborted) throw new DOMException('Scan aborted by user', 'AbortError');
            return new Promise((resolve, reject) => {
                const tx = db.transaction('snapshots', 'readwrite');
                const abort = () => { try { tx.abort(); } catch (_) {} };
                signal?.addEventListener('abort', abort, { once: true });
                const cleanup = () => signal?.removeEventListener('abort', abort);
                const store = tx.objectStore('snapshots');
                const snap = {
                    timestamp: Date.now(),
                    complete: true,
                    account_id: accountId ? String(accountId) : null,
                    follower_count: followers.length,
                    following_count: following.length,
                    follower_ids: followers.map(u => String(u.pk || u.pk_id || u.id)),
                    following_ids: following.map(u => String(u.pk || u.pk_id || u.id)),
                    // ponytail: separate id->username maps (not one fat blob) so lost-follower
                    // rows can show real names without any extra API call; add an index when queried.
                    follower_usernames: Object.fromEntries(followers.map(u => [String(u.pk || u.pk_id || u.id), String(u.username || '')]).filter(pair => pair[1])),
                    following_usernames: Object.fromEntries(following.map(u => [String(u.pk || u.pk_id || u.id), String(u.username || '')]).filter(pair => pair[1]))
                };
                store.put(snap);
                tx.oncomplete = () => { cleanup(); resolve(snap); };
                tx.onerror = () => { cleanup(); reject(tx.error || new Error('Snapshot write failed')); };
                tx.onabort = () => { cleanup(); reject(signal?.aborted ? new DOMException('Scan aborted by user', 'AbortError') : tx.error || new Error('Snapshot transaction aborted')); };
            });
        }

        static async getLatestSnapshot(accountId = null) {
            const db = await this.init();
            return new Promise((resolve) => {
                const tx = db.transaction('snapshots', 'readonly');
                const store = tx.objectStore('snapshots');
                const req = store.openCursor(null, 'prev');
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (!cursor) { resolve(null); return; }
                    if (cursor.value.complete === true && (!accountId || String(cursor.value.account_id) === String(accountId))) {
                        resolve(cursor.value);
                    } else {
                        cursor.continue();
                    }
                };
                req.onerror = () => resolve(null);
            });
        }

        static async markMediaDownloaded(record) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('media_vault', 'readwrite');
                const store = tx.objectStore('media_vault');
                store.put({ ...record, downloaded_at: Date.now() });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }

        static async hasMedia(key) {
            const db = await this.init();
            return new Promise((resolve) => {
                const tx = db.transaction('media_vault', 'readonly');
                const req = tx.objectStore('media_vault').get(key);
                req.onsuccess = () => resolve(Boolean(req.result));
                req.onerror = () => resolve(false);
            });
        }

        static async getMediaVault(limit = 100) {
            const db = await this.init();
            return new Promise((resolve) => {
                const tx = db.transaction('media_vault', 'readonly');
                const store = tx.objectStore('media_vault');
                const index = store.index('downloaded_at');
                const results = [];
                const req = index.openCursor(null, 'prev');
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor && results.length < limit) {
                        results.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(results);
                    }
                };
                req.onerror = () => resolve([]);
            });
        }

        static async getAllSnapshots(accountId = null, limit = 20) {
            const db = await this.init();
            return new Promise((resolve) => {
                const tx = db.transaction('snapshots', 'readonly');
                const store = tx.objectStore('snapshots');
                const req = store.openCursor(null, 'prev');
                const list = [];
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor && list.length < limit) {
                        if (cursor.value.complete === true && (!accountId || String(cursor.value.account_id) === String(accountId))) {
                            list.push(cursor.value);
                        }
                        cursor.continue();
                    } else {
                        resolve(list);
                    }
                };
                req.onerror = () => resolve([]);
            });
        }

        static async getUserActivity(userId) {
            const db = await this.init();
            return new Promise((resolve) => {
                const tx = db.transaction('user_activity', 'readonly');
                const req = tx.objectStore('user_activity').get(String(userId));
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        }

        static async saveUserActivity(record) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('user_activity', 'readwrite');
                tx.objectStore('user_activity').put(record);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }

        static async clearActivityCache() {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('user_activity', 'readwrite');
                tx.objectStore('user_activity').clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }
    }

    /* ==========================================================================
       3. API TRANSPORT ENGINE (Fetch + GM_xhr fallback + CSRF + Unfollow)
       ========================================================================== */

    class IgBridge {
        static currentUserId = null;
        static currentUsername = null;
        static wwwClaim = null;

        static getAppId() {
            return APP_CONFIG.INSTAGRAM_WEB_APP_ID || '936619743392459';
        }

        static getCookie(name) {
            const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
            return match ? decodeURIComponent(match[3]) : null;
        }

        static async resolveCurrentUser() {
            // Level 1: Standard authentication cookie 'ds_user_id'
            const cookieId = this.getCookie('ds_user_id');
            if (!cookieId) { this.currentUserId = null; this.currentUsername = null; return { id: null, username: null }; }
            if (cookieId) {
                if (this.currentUserId !== cookieId) {
                    this.currentUsername = null;
                }
                this.currentUserId = cookieId;
            }

            // Level 2: window globals (_sharedData, __initialData) with viewer validation
            try {
                const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                const sharedViewer = page._sharedData?.config?.viewer;
                const sharedViewerId = page._sharedData?.config?.viewerId || sharedViewer?.id;
                if (sharedViewerId) {
                    const svIdStr = String(sharedViewerId);
                    if (!this.currentUserId) this.currentUserId = svIdStr;
                    if (this.currentUserId === svIdStr && sharedViewer?.username) {
                        this.currentUsername = sharedViewer.username;
                    }
                }

                const initialViewer = page.__initialData?.data?.viewer;
                if (initialViewer?.id) {
                    const ivIdStr = String(initialViewer.id);
                    if (!this.currentUserId) this.currentUserId = ivIdStr;
                    if (this.currentUserId === ivIdStr && initialViewer.username) {
                        this.currentUsername = initialViewer.username;
                    }
                }
            } catch (_) {}

            // Level 3: Scan inline JSON script tags strictly tied to currentUserId
            try {
                const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])');
                for (const s of scripts) {
                    const txt = s.textContent || '';
                    if (!this.currentUserId) {
                        const m = txt.match(/"(?:viewerId|actorID|userId)":\s*"(\d+)"/) 
                               || txt.match(/"viewer":\s*\{\s*"id":\s*"(\d+)"/);
                        if (m && m[1]) this.currentUserId = m[1];
                    }

                    if (this.currentUserId && !this.currentUsername && txt.includes('username')) {
                        const uid = this.currentUserId;
                        // Match username in tight proximity to user ID (JSON object level)
                        const m1 = txt.match(new RegExp(`"id"\\s*:\\s*"${uid}"[^{}]{0,300}"username"\\s*:\\s*"([a-zA-Z0-9._]+)"`));
                        const m2 = txt.match(new RegExp(`"username"\\s*:\\s*"([a-zA-Z0-9._]+)"[^{}]{0,300}"id"\\s*:\\s*"${uid}"`));
                        const m3 = txt.match(new RegExp(`"(?:viewerId|actorID)"\\s*:\\s*"${uid}"[^{}]{0,300}"username"\\s*:\\s*"([a-zA-Z0-9._]+)"`));
                        const m4 = txt.match(new RegExp(`"username"\\s*:\\s*"([a-zA-Z0-9._]+)"[^{}]{0,300}"(?:viewerId|actorID)"\\s*:\\s*"${uid}"`));
                        const found = m1?.[1] || m2?.[1] || m3?.[1] || m4?.[1];
                        if (found && !['null', 'undefined'].includes(found)) {
                            this.currentUsername = found;
                            break;
                        }
                    }
                }
            } catch (_) {}

            // Level 4: Navigation Bar ONLY (strictly desktop sidebar or mobile nav bar, NEVER feed/posts)
            if (!this.currentUsername) {
                try {
                    const navContainer = document.querySelector('nav, [role="navigation"], aside');
                    if (navContainer) {
                        const navAnchors = Array.from(navContainer.querySelectorAll('a[href^="/"]'));
                        const reserved = new Set([
                            '', 'explore', 'reels', 'direct', 'stories', 'your_activity', 
                            'settings', 'accounts', 'api', 'legal', 'about', 'p', 'reel', 'tv'
                        ]);

                        // 4a. Profile link with explicit aria-label or SVG Profile icon in nav
                        const profileLink = navAnchors.find(a => {
                            const svg = a.querySelector('svg[aria-label="Profile"], svg[aria-label="โปรไฟล์"]');
                            const aria = a.getAttribute('aria-label') || '';
                            return Boolean(svg || aria.includes('Profile') || aria.includes('โปรไฟล์'));
                        });

                        if (profileLink) {
                            const parts = (profileLink.getAttribute('href') || '').replace(/^\/|\/$/g, '').split('/');
                            if (parts.length === 1 && !reserved.has(parts[0].toLowerCase())) {
                                this.currentUsername = parts[0];
                            }
                        }

                        // 4b. Nav link that contains an avatar img inside the navigation container
                        if (!this.currentUsername) {
                            for (const a of navAnchors) {
                                const parts = (a.getAttribute('href') || '').replace(/^\/|\/$/g, '').split('/');
                                if (parts.length === 1 && !reserved.has(parts[0].toLowerCase())) {
                                    if (a.querySelector('img')) {
                                        this.currentUsername = parts[0];
                                        break;
                                    }
                                }
                            }
                        }
                    }
                } catch (_) {}
            }

            return { id: this.currentUserId, username: this.currentUsername };
        }

        static cooldownUntil = 0;
        static cooldownAccount = null;
        static hardBlockAccount = null;
        static hardBlockAt = 0;

        // Hard block survives reload: the whole point is that the user cannot escape it
        // by refreshing the page mid-block and firing another request.
        static restoreHardBlock() {
            try {
                const raw = localStorage.getItem(HARD_BLOCK_KEY);
                if (!raw) return;
                const saved = JSON.parse(raw);
                if (saved?.account) { this.hardBlockAccount = String(saved.account); this.hardBlockAt = Number(saved.at) || Date.now(); }
            } catch (_) {}
        }

        static clearHardBlock() {
            this.hardBlockAccount = null;
            this.hardBlockAt = 0;
            try { localStorage.removeItem(HARD_BLOCK_KEY); } catch (_) {}
        }

        // Story viewer analytics: who viewed MY story media (private web endpoint).
        static async fetchStoryViewers(mediaId) {
            if (!/^\d+$/.test(String(mediaId || ''))) throw new Error('Invalid story media id');
            const data = await this.request(`/api/v1/media/${String(mediaId)}/list_reel_media_viewer/`);
            if (data?.status === 'ok' || Array.isArray(data?.users)) return Array.isArray(data.users) ? data.users : [];
            return [];
        }

        static error(message, code, status = 0) {
            return Object.assign(new Error(message), { code, status });
        }

        static assertAccount(accountId) {
            if (!accountId || this.getCookie('ds_user_id') !== String(accountId)) {
                throw this.error('Account changed or logged out. Please refresh and restart.', 'ACCOUNT_CHANGED');
            }
        }

        static isSessionError(err) {
            return ['AUTH', 'CHECKPOINT', 'RATE_LIMIT', 'ACCOUNT_CHANGED', 'BLOCKED'].includes(err?.code);
        }

        static async request(url, options = {}) {
            const target = new URL(url, 'https://www.instagram.com');
            if (target.protocol !== 'https:' || !['www.instagram.com', 'instagram.com'].includes(target.hostname) || target.port || target.username || target.password) {
                throw this.error('Unsupported API origin', 'ORIGIN');
            }
            const accountId = options.accountId || this.getCookie('ds_user_id');
            this.assertAccount(accountId);
            if (this.hardBlockAccount === accountId) {
                const hours = Math.max(0, Math.ceil((6 * 3600 * 1000 - (Date.now() - this.hardBlockAt)) / 3600000));
                throw this.error(`Instagram blocked this account. Requests are refused until you clear it in Settings${hours > 0 ? ` (at least ${hours}h after the block)` : ''}.`, 'BLOCKED');
            }
            if (this.cooldownAccount === accountId && Date.now() < this.cooldownUntil) {
                const seconds = Math.ceil((this.cooldownUntil - Date.now()) / 1000);
                throw this.error(`Instagram rate limit reached. Please wait ${seconds} seconds.`, 'RATE_LIMIT', 429);
            }
            const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            const fetchFn = typeof page.fetch === 'function' ? page.fetch.bind(page) : fetch;
            const method = String(options.method || 'GET').toUpperCase();
            const csrf = this.getCookie('csrftoken');
            // ponytail: align headers with real Instagram Web client (no X-Requested-With, add X-ASBD-ID and X-IG-WWW-Claim)
            const headers = {
                'X-IG-App-ID': this.getAppId(),
                'X-ASBD-ID': '129477',
                'X-IG-WWW-Claim': this.wwwClaim || '0',
                'Accept': '*/*',
                ...(csrf ? { 'X-CSRFToken': csrf } : {}),
                ...options.headers
            };
            const attempts = method === 'GET' ? 3 : 1;
            for (let attempt = 0; attempt < attempts; attempt++) {
                this.assertAccount(accountId);
                if (options.signal?.aborted) throw new DOMException('Operation aborted by user', 'AbortError');
                const controller = new AbortController();
                const abort = () => controller.abort();
                options.signal?.addEventListener('abort', abort, { once: true });
                let timedOut = false;
                const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
                try {
                    const res = await fetchFn(target.href, { method, headers, credentials: 'include',
                        body: options.body ?? options.data, signal: controller.signal });
                    const newClaim = res.headers?.get('x-ig-www-claim');
                    if (newClaim) this.wwwClaim = newClaim;
                    const text = await res.text();
                    this.assertAccount(accountId);
                    if (options.signal?.aborted) throw new DOMException('Operation aborted by user', 'AbortError');
                    let data = null;
                    try { data = JSON.parse(text); } catch (_) {}
                    const message = String(data?.message || data?.error_type || '');
                    const redirected = res.url || '';
                    if (/challenge|checkpoint|consent_required/i.test(message + redirected) || data?.challenge || data?.checkpoint_url) {
                        throw this.error('Instagram requires checkpoint verification. Solve it at instagram.com -> Settings -> Account Status, then retry.', 'CHECKPOINT', res.status);
                    }
                    if (res.status === 401 || /login_required|\/accounts\/login/i.test(message + redirected)) {
                        throw this.error('Session expired. Please log into Instagram and refresh.', 'AUTH', res.status);
                    }
                    if (res.status === 429 || /feedback_required|please wait|try again later|rate.limit/i.test(message)) {
                        // Two different failures shared one 60s floor. A soft limit lifts in
                        // minutes; an account-bound block recovers in 6+ hours AND every retry
                        // during the block extends it (instagrapi source + Meta rate-limit docs).
                        // Retrying a hard block on a 60s timer is what turns a nuisance into a
                        // durable lockout, so hard never auto-retries.
                        const hard = /feedback_required|sentry_block/i.test(message) || data?.error_type === 'rate_limit_error';
                        if (hard) {
                            this.hardBlockAccount = accountId;
                            this.hardBlockAt = Date.now();
                            try { localStorage.setItem(HARD_BLOCK_KEY, JSON.stringify({ account: accountId, at: this.hardBlockAt })); } catch (_) {}
                            showToast('⛔ Instagram has blocked this account. Stop for 6+ hours — do not retry.', 12000);
                            throw this.error('Instagram blocked this account (feedback_required). Stop all requests for 6+ hours, then clear the block from MaxPland Settings.', 'BLOCKED', res.status);
                        }
                        const retry = res.headers?.get('Retry-After');
                        const delay = retry && /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
                        this.cooldownUntil = Date.now() + Math.max(10 * 60 * 1000, Number.isFinite(delay) ? delay : 0);
                        this.cooldownAccount = accountId;
                        // Surface the cooldown once at the moment it starts (all flows: scan/unfollow/media).
                        showToast(`⏳ Instagram soft rate limit — waiting ${Math.max(1, Math.ceil((this.cooldownUntil - Date.now()) / 1000))}s before the next request`, 4000);
                        throw this.error('Instagram soft rate limit. Waiting before the next request.', 'RATE_LIMIT', res.status);
                    }
                    if (res.status === 403) throw this.error('Instagram forbidden (403). Check account status on web.', 'AUTH', 403);
                    if (/^\s*</.test(text)) throw this.error('Instagram returned HTML instead of JSON. Check login status.', 'HTML_RESPONSE', res.status);
                    if (!res.ok) throw this.error(`Instagram responded with HTTP ${res.status}`, 'HTTP', res.status);
                    if (!data || typeof data !== 'object') throw this.error('Instagram returned invalid payload format', 'PAYLOAD', res.status);
                    if (data.status === 'fail' || data.errors?.length) throw this.error('Instagram rejected data request', 'API', res.status);
                    return data;
                } catch (err) {
                    if (options.signal?.aborted) throw new DOMException('Operation aborted by user', 'AbortError');
                    this.assertAccount(accountId);
                    if (timedOut) throw this.error('Instagram request timed out after 30s. Please retry.', 'TIMEOUT');
                    const transient = err.status >= 500 || (!err.code && err.name === 'TypeError');
                    if (!transient || attempt + 1 >= attempts) throw err;
                } finally {
                    clearTimeout(timeout);
                    options.signal?.removeEventListener('abort', abort);
                }
                await sleep(3000 * (attempt + 1)); // 3/6/9 s: a fast retry storm reads as a bot
            }
        }

        static async unfollowUser(userId) {
            const uid = String(userId || '');
            if (!/^\d+$/.test(uid)) throw new Error('Invalid User ID to unfollow');
            const user = STATE.following.find(u => String(u.id || u.pk_id || u.pk || '') === uid);
            if (isProtectedUser(uid, user?.username)) throw new Error('This account is in the Whitelist');
            const accountId = STATE.relationshipAccountId || this.getCookie('ds_user_id');
            this.assertAccount(accountId);
            const csrf = this.getCookie('csrftoken');
            if (!csrf) throw this.error('CSRF token missing. Please refresh Instagram.', 'AUTH');

            // Single route. The 3-route ladder tripled the write request count during
            // exactly the conditions where request count costs most, and route 0 is
            // verified working. A 404/405 here means the endpoint moved: stop and
            // report rather than firing two more writes at a possibly unhappy account.
            const route = { url: `/web/friendships/${uid}/unfollow/`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
            const res = await this.request(route.url, {
                method: 'POST',
                accountId,
                headers: route.headers,
                body: undefined
            });
            if (res?.friendship_status?.following === false || (res?.status === 'ok' && res.friendship_status === undefined)) {
                return true;
            }
            throw this.error('Instagram did not confirm the unfollow. Check the profile before retrying', 'UNCONFIRMED');
        }

        static async fetchRelationshipPage(endpoint, userId, cursor = null, options = {}) {
            const uid = String(userId || '');
            if (!/^\d+$/.test(uid) || !['followers', 'following'].includes(endpoint)) throw new Error('Invalid relationship target');
            this.assertAccount(uid);
            const count = Math.min(50, Math.max(1, Number(APP_CONFIG.PAGE_SIZE) || 50));
            if (options.transport === 'graphql') {
                // Compatibility route used by Instaloader's Profile.get_followers/get_followees.
                if (!window.__mpGqlTransportWarned) {
                    window.__mpGqlTransportWarned = true;
                    console.warn('[MaxPland] Legacy GraphQL relationship transport active (query_hash can rotate; REST remains primary)');
                }
                const hash = endpoint === 'followers' ? '37479f2b8209594dde7facb0d904896a' : '58712303d941c6855d4e888c5f0cd22f';
                const variables = { id: uid, first: count, ...(cursor ? { after: cursor } : {}) };
                const qs = new URLSearchParams({ query_hash: hash, variables: JSON.stringify(variables) });
                const data = await this.request(`/graphql/query/?${qs}`, { ...options, accountId: uid });
                const connection = data?.data?.user?.[endpoint === 'followers' ? 'edge_followed_by' : 'edge_follow'];
                if (!Array.isArray(connection?.edges) || typeof connection.page_info?.has_next_page !== 'boolean') throw new Error('Invalid GraphQL relationship page');
                return { users: connection.edges.map(edge => edge?.node),
                    has_more: connection.page_info.has_next_page,
                    next_max_id: connection.page_info.has_next_page ? connection.page_info.end_cursor : null };
            }
            const qs = new URLSearchParams({ count: String(count), search_surface: 'follow_list_page' });
            if (cursor) qs.set('max_id', cursor);
            return this.request(`/api/v1/friendships/${uid}/${endpoint}/?${qs}`, { ...options, accountId: uid });
        }

        static async fetchAllRelationships(endpoint, userId, pageSafetyLimit = 250, onProgress, speedMode = 'A') {
            const all = [];
            all.completed = false;
            all.lastError = null;
            all.pagesFetched = 0;
            const seenUsers = new Set(), seenCursors = new Set();
            let cursor = null, transport = 'rest';
            // Scan resume: a stopped/paused scan persists cursor+users per page; cleared on completion.
            const RESUME_KEY = `mp_scan_resume_${endpoint}`;
            let savedResume = null;
            try { savedResume = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null'); } catch (_) {}
            if (savedResume && String(savedResume.userId) === String(userId) && Array.isArray(savedResume.users) && savedResume.cursor) {
                for (const u of savedResume.users) {
                    if (!seenUsers.has(String(u.id))) { seenUsers.add(String(u.id)); all.push(u); }
                }
                cursor = String(savedResume.cursor);
                transport = savedResume.transport === 'graphql' ? 'graphql' : 'rest';
                all.pagesFetched = Number(savedResume.pagesFetched) || 0;
                onProgress?.(all.length, all.pagesFetched, `Resumed saved scan at page ${all.pagesFetched} (${all.length.toLocaleString()} users kept)`);
            }
            const signal = STATE.scanController?.signal;
            const limit = Math.max(1, Math.min(250, Number(pageSafetyLimit) || 250));
            const fetchStats = { requestMs: 0, waitMs: 0 };
            // Sweet spot (2026-09-24): field studies (instaloader RateController practice,
            // Bellingcat toolkit guidance) + own incident log — sustained metronome
            // pagination at 2-3 s/page tripped IG automation detection; serial single
            // streams with randomized intervals and burst-then-rest patterns did not.
            // Combined request rate is what detection sees: never fetch lists concurrently.
            const PACE_PRESETS = {
                A: { page: [6000, 12000], restEvery: 30, rest: [60000, 120000] },
                B: { page: [3000, 6000], restEvery: 40, rest: [45000, 90000] },
                C: { page: [1500, 3000], restEvery: 50, rest: [30000, 60000] }
            };
            const PACE = PACE_PRESETS[speedMode] || PACE_PRESETS.A;
            try {
                while (!STATE.stopScanFlag) {
                    while (STATE.scanPaused && !STATE.stopScanFlag) await sleep(250);
                    if (STATE.stopScanFlag) break;
                    this.assertAccount(String(userId));
                    let data;
                    try {
                        const t0 = performance.now();
                        data = await this.fetchRelationshipPage(endpoint, userId, cursor, { transport, signal });
                        fetchStats.requestMs += performance.now() - t0;
                    } catch (err) {
                        // Only first-page endpoint incompatibility can switch routes. Never mix cursors,
                        // bypass session challenges, or repeat a rejected request unchanged.
                        if (all.pagesFetched || transport !== 'rest' || err.code !== 'HTTP' || ![400,404].includes(err.status)) throw err;
                        transport = 'graphql';
                        onProgress?.(0, 0, 'Switching to fallback query endpoint...');
                        if (STATE.stopScanFlag) break;
                        const t1 = performance.now();
                        data = await this.fetchRelationshipPage(endpoint, userId, null, { transport, signal });
                        fetchStats.requestMs += performance.now() - t1;
                    }
                    this.assertAccount(String(userId));
                    if (STATE.stopScanFlag) break;
                    if (!Array.isArray(data?.users)) throw new Error('Invalid relationship page');
                    const next = data.next_max_id == null ? '' : String(data.next_max_id);
                    if ((data.has_more === true || data.more_available === true) && !next) throw new Error('Missing relationship cursor');
                    if (next && (data.has_more === false || data.more_available === false)) throw new Error('Conflicting relationship cursor');
                    if (!data.users.length && next) throw new Error('Empty relationship page with cursor');
                    const before = all.length;
                    for (const user of data.users) {
                        const id = String(user?.id || user?.pk_id || user?.pk || '');
                        if (!/^\d+$/.test(id)) continue;
                        if (!seenUsers.has(id)) {
                            seenUsers.add(id);
                            all.push({
                                id,
                                username: user.username || '',
                                full_name: user.full_name || '',
                                profile_pic_url: user.profile_pic_url || '',
                                is_verified: Boolean(user.is_verified),
                                is_private: Boolean(user.is_private),
                                has_anonymous_profile_picture: Boolean(user.has_anonymous_profile_picture)
                            });
                        }
                    }
                    all.pagesFetched++;
                    onProgress?.(all.length, all.pagesFetched, null);
                    this.assertAccount(String(userId));
                    if (STATE.stopScanFlag) break;
                    if (!next) { all.completed = true; try { localStorage.removeItem(RESUME_KEY); } catch (_) {} break; }
                    if (seenCursors.has(next)) throw new Error('Repeated relationship cursor');
                    if (before === all.length) throw new Error('Relationship pagination made no progress');
                    if (all.pagesFetched >= limit) throw new Error(`Safety page limit reached (${limit} pages)`);
                    seenCursors.add(next);
                    cursor = next;
                    try {
                        localStorage.setItem(RESUME_KEY, JSON.stringify({ userId: String(userId), cursor, transport, pagesFetched: all.pagesFetched, users: all }));
                    } catch (_) { /* quota exceeded: resume survives only while storage allows */ }
                    // Yield between pages: jittered per-mode delay + periodic long rest
                    // (honor Stop/pause throughout). PAGE_SIZE/headers/transports untouched.
                    const pause = PACE.page[0] + Math.floor(Math.random() * (PACE.page[1] - PACE.page[0]));
                    const tw = performance.now();
                    for (let ms = 0; ms < pause && !STATE.stopScanFlag && !signal?.aborted; ms += 250) await sleep(250);
                    if (PACE.restEvery && next && all.pagesFetched % PACE.restEvery === 0 && !STATE.stopScanFlag && !signal?.aborted) {
                        const rest = PACE.rest[0] + Math.floor(Math.random() * (PACE.rest[1] - PACE.rest[0]));
                        onProgress?.(all.length, all.pagesFetched, `Breathing rest ${Math.round(rest / 1000)}s — keeps request rate under the detection radar...`);
                        for (let ms = 0; ms < rest && !STATE.stopScanFlag && !signal?.aborted; ms += 250) await sleep(250);
                    }
                    fetchStats.waitMs += performance.now() - tw;
                    if (STATE.stopScanFlag || signal?.aborted) break;
                }
            } catch (err) {
                all.lastError = err;
                onProgress?.(all.length, all.pagesFetched, err.message);
            }
            all.fetchStats = fetchStats;
            return all;
        }

        static shortcodeToMediaId(shortcode) {
            if (!/^[A-Za-z0-9_-]+$/.test(String(shortcode || ''))) throw new Error('Invalid shortcode');
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
            let value = 0n;
            for (const ch of String(shortcode || '')) {
                const index = alphabet.indexOf(ch);
                if (index < 0) throw new Error('Invalid shortcode');
                value = value * 64n + BigInt(index);
            }
            return value.toString();
        }

        static async fetchMediaInfo(shortcode) {
            const raw = String(shortcode || '').trim();
            const mediaId = /^\d+$/.test(raw) ? raw : this.shortcodeToMediaId(raw);
            const data = await this.request(`/api/v1/media/${mediaId}/info/`);
            const item = (data.items || [])[0];
            if (!item) throw new Error('Could not fetch media data from Instagram API');
            return item;
        }

        static bestImage(item) {
            const c = item?.image_versions2?.candidates || [];
            return [...c].sort((a,b) => ((b.width||0)*(b.height||0))-((a.width||0)*(a.height||0)))[0]?.url || null;
        }

        static bestProgressiveVideo(item) {
            const v = item?.video_versions || [];
            return [...v].sort((a,b) => ((b.width||0)*(b.height||0))-((a.width||0)*(a.height||0)))[0]?.url || null;
        }

        static async resolveMedia(shortcode) {
            const item = await this.fetchMediaInfo(shortcode);
            const nodes = Array.isArray(item.carousel_media) && item.carousel_media.length ? item.carousel_media : [item];
            return {
                item, shortcode,
                username: item?.user?.username || '',
                caption: item?.caption?.text || '',
                nodes: nodes.map((node, index) => ({
                    index,
                    id: String(node.pk || node.id || item.pk || item.id || shortcode),
                    mediaType: node.media_type === 2 ? 'video' : 'image',
                    imageUrl: this.bestImage(node),
                    progressiveVideoUrl: this.bestProgressiveVideo(node)
                }))
            };
        }

        static async fetchUserProfileHD(username) {
            try {
                const data = await this.request(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
                const user = data?.data?.user;
                if (user) {
                    return user.profile_pic_url_hd || user.profile_pic_url || null;
                }
            } catch (_) {}
            return null;
        }

        static async fetchUserLastPost(userId, options = {}) {
            const uid = String(userId || '');
            if (!/^\d+$/.test(uid)) throw new Error('Invalid user ID');
            const accountId = STATE.relationshipAccountId || this.getCookie('ds_user_id');
            this.assertAccount(accountId);
            const data = await this.request(`/api/v1/feed/user/${uid}/?count=1`, { ...options, accountId });
            const item = (data?.items || [])[0];
            return {
                has_posts: Boolean(item),
                last_taken_at: item?.taken_at || null,
                total_posts: data?.num_results ?? (item ? 1 : 0)
            };
        }
    }

    /* ==========================================================================
       4. CONTROLLER & STATE
       ========================================================================== */

    const DEFAULT_PREFS = {
        stealthStory: true,
        cleanFeed: true,
        quickDownloadFeed: true,
        quickDownloadStory: true,
        inactiveThresholdDays: 180,
        scanSpeed: 'A'
    };

    function loadPrefs() {
        try {
            const raw = localStorage.getItem('maxpland_prefs');
            if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
        } catch (_) {}
        return { ...DEFAULT_PREFS };
    }

    function savePrefs(prefs) {
        try {
            localStorage.setItem('maxpland_prefs', JSON.stringify(prefs));
        } catch (_) {}
    }

    // ponytail: display-only counter. There is deliberately no cap here — the 15-30s
    // randomized delay is the actual safety control, and a per-day ceiling would only
    // force a 1,200-account cleanup into a multi-day wait without reducing request
    // rate. Remove when the user asks for a ceiling again.
    function getWriteBudget() {
        const day = new Date().toISOString().slice(0, 10);
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(WRITE_BUDGET_KEY)); } catch (_) {}
        if (!saved || saved.day !== day) saved = { day, daily: 0 };
        return saved;
    }
    function noteWrite() {
        const b = getWriteBudget();
        b.daily++;
        try { localStorage.setItem(WRITE_BUDGET_KEY, JSON.stringify(b)); } catch (_) {}
    }
    function resetWriteBudget() {
        try { localStorage.removeItem(WRITE_BUDGET_KEY); } catch (_) {}
    }
    function formatBudget() {
        return `${getWriteBudget().daily.toLocaleString()} unfollowed today`;
    }

    const STATE = {
        currentUser: { id: null, username: null },
        followers: [],
        following: [],
        notFollowingBack: [],
        fans: [],
        mutual: [],
        lostFollowers: [],
        ghostFollowers: [],
        inactiveFollowing: [],
        isScanningInactive: false,
        stopInactiveScanFlag: false,
        whitelist: new Map(),
        selectedIds: new Set(),
        isScanning: false,
        stopScanFlag: false,
        isUnfollowing: false,
        stopUnfollowFlag: false,
        lastUnfollowAt: 0,
        activeTab: 'relationship',
        relationshipFilter: 'not_following_back',
        searchQuery: '',
        relationshipLimit: 100,
        subFilters: {
            excludeVerified: false,
            excludePrivate: false,
            excludeNoAvatar: false,
            excludeWhitelist: false,
            onlyFollowing: false,
            onlyNotFollowed: false
        },
        scanStartTime: 0,
        prefs: loadPrefs()
    };

    // STEALTH STORY SEEN INTERCEPTOR (Ponytail: multi-channel stealth — fetch, XHR, sendBeacon masked)
    let stealthSeenCount = 0;
    function isStorySeenRequest(url, body) {
        if (!STATE.prefs?.stealthStory) return false;
        const urlStr = String(url || '');
        const bodyStr = typeof body === 'string' ? body : (body ? JSON.stringify(body) : '');

        // Safety Guard: never block read queries (drawing story rings, viewing profiles, feed)
        const isRead = /web_profile_info|users\/web_profile|PolarisProfile|ProfilePage|[A-Za-z0-9_]*Query\b/i.test(urlStr) ||
                       /operationName["']?\s*[:=]\s*["']?[A-Za-z0-9_]*Query\b/i.test(bodyStr);
        if (isRead) return false;

        // 1. REST endpoint: /stories/reel/seen or /api/v1/stories/reel/seen
        if (/\/(?:api\/v1\/)?stories\/reel\/seen/i.test(urlStr)) return true;

        // 2. viewSeenAt timestamp in query or body
        if (/viewSeenAt/i.test(urlStr) || /viewSeenAt/i.test(bodyStr)) return true;

        // 3. GraphQL seen mutations
        if (/reels?_?media_?seen|Stor(?:y|ies)Seen/i.test(urlStr) || /reels?_?media_?seen|Stor(?:y|ies)Seen/i.test(bodyStr)) return true;

        return false;
    }

    // ponytail: StoryMediaRegistry caches reels_media and GraphQL story payloads intercepted at document-start
    // skipped: IndexedDB persistent cross-session media blob cache, add when offline reel playback is required
    const StoryMediaRegistry = {
        items: new Map(),
        cacheItem(item) {
            if (!item || typeof item !== 'object') return;
            const id = String(item.pk || item.id || '').split('_')[0];
            const isVideo = Boolean(item.video_versions && item.video_versions.length > 0) || item.media_type === 2 || Boolean(item.is_video);
            const videoVersions = Array.isArray(item.video_versions) ? [...item.video_versions] : [];
            const imageCandidates = Array.isArray(item.image_versions2?.candidates) ? [...item.image_versions2.candidates] : [];
            videoVersions.sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
            imageCandidates.sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));

            const videoUrl = videoVersions[0]?.url || item.video_url || item.videoUrl || null;
            const imageUrl = imageCandidates[0]?.url || item.display_url || item.src || null;
            const username = item.user?.username || item.owner?.username || '';

            const entry = { id, isVideo, videoUrl, imageUrl, username };
            if (id) this.items.set(id, entry);
        },
        parseAndCache(json) {
            if (!json || typeof json !== 'object') return;
            try {
                if (Array.isArray(json.reels_media)) {
                    for (const reel of json.reels_media) {
                        if (Array.isArray(reel?.items)) {
                            for (const it of reel.items) this.cacheItem(it);
                        }
                    }
                }
                if (json.reels && typeof json.reels === 'object') {
                    for (const k in json.reels) {
                        const reel = json.reels[k];
                        if (Array.isArray(reel?.items)) {
                            for (const it of reel.items) this.cacheItem(it);
                        }
                    }
                }
                if (Array.isArray(json.items)) {
                    for (const it of json.items) this.cacheItem(it);
                }
                if (json.data && typeof json.data === 'object') {
                    this.parseAndCache(json.data);
                }
            } catch (_) {}
        },
        scanDomScripts() {
            try {
                const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                const doc = win.document || document;
                for (const s of doc.querySelectorAll('script[type="application/json"]')) {
                    const text = s.textContent || '';
                    if (text.includes('video_versions') || text.includes('image_versions2')) {
                        try {
                            const data = JSON.parse(text);
                            this.parseAndCache(data);
                        } catch (_) {}
                    }
                }
            } catch (_) {}
        }
    };

    function installStorySeenInterceptor() {
        try {
            const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            const hookSym = Symbol.for('mp_seen_hooked');
            if (win[hookSym]) return;
            win[hookSym] = true;

            const FAKE_JSON = JSON.stringify({ status: 'ok' });
            const isStoryDataUrl = (u) => Boolean(u && typeof u === 'string' && (/reels?_?media|graphql\/query|\/api\/v1\/media\//i.test(u)));

            // 1. Intercept fetch
            if (typeof win.fetch === 'function') {
                const rawFetch = win.fetch;
                const stealthFetch = function(resource, init = {}) {
                    let url = '';
                    let body = init?.body || null;

                    if (typeof resource === 'string') {
                        url = resource;
                    } else if (resource && typeof resource.url === 'string') {
                        url = resource.url;
                    }

                    if (isStorySeenRequest(url, body)) {
                        stealthSeenCount++;
                        console.info(`[MaxPland Stealth] Blocked story seen ping #${stealthSeenCount}:`, url);
                        return Promise.resolve(new Response(FAKE_JSON, {
                            status: 200,
                            statusText: 'OK',
                            headers: { 'Content-Type': 'application/json' }
                        }));
                    }
                    const resPromise = rawFetch.apply(this, arguments);
                    try {
                        if (isStoryDataUrl(url)) {
                            resPromise.then(res => {
                                try {
                                    if (typeof res?.clone === 'function') {
                                        res.clone().json().then(data => StoryMediaRegistry.parseAndCache(data)).catch(() => {});
                                    }
                                } catch (_) {}
                            }).catch(() => {});
                        }
                    } catch (_) {}
                    return resPromise;
                };

                try {
                    Object.defineProperty(stealthFetch, 'name', { value: rawFetch.name || 'fetch' });
                    Object.defineProperty(stealthFetch, 'length', { value: rawFetch.length || 1 });
                    const origToString = Function.prototype.toString;
                    stealthFetch.toString = function() {
                        return this === stealthFetch ? origToString.call(rawFetch) : origToString.call(this);
                    };
                } catch (_) {}

                win.fetch = stealthFetch;
            }

            // 2. Intercept XMLHttpRequest
            if (win.XMLHttpRequest && win.XMLHttpRequest.prototype) {
                const rawOpen = win.XMLHttpRequest.prototype.open;
                const rawSend = win.XMLHttpRequest.prototype.send;

                win.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                    try {
                        this.__mpSeenUrl = typeof url === 'string' ? url : String(url || '');
                    } catch (_) {}
                    return rawOpen.apply(this, [method, url, ...rest]);
                };

                win.XMLHttpRequest.prototype.send = function(body) {
                    try {
                        const url = this.__mpSeenUrl || '';
                        if (isStorySeenRequest(url, body)) {
                            stealthSeenCount++;
                            console.info(`[MaxPland Stealth] Blocked XHR story seen ping #${stealthSeenCount}:`, url);
                            const xhr = this;
                            const define = (prop, val) => {
                                try { Object.defineProperty(xhr, prop, { value: val, configurable: true }); } catch (_) {}
                            };
                            define('readyState', 4);
                            define('status', 200);
                            define('statusText', 'OK');
                            define('responseText', FAKE_JSON);
                            define('response', FAKE_JSON);
                            setTimeout(() => {
                                try {
                                    if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
                                    xhr.dispatchEvent(new Event('readystatechange'));
                                    xhr.dispatchEvent(new Event('load'));
                                    xhr.dispatchEvent(new Event('loadend'));
                                } catch (_) {}
                            }, 0);
                            return;
                        }
                        if (isStoryDataUrl(url)) {
                            const self = this;
                            const origOnLoad = self.onload;
                            self.onload = function(...args) {
                                try {
                                    if (self.status === 200 && self.responseText) {
                                        const data = JSON.parse(self.responseText);
                                        StoryMediaRegistry.parseAndCache(data);
                                    }
                                } catch (_) {}
                                if (typeof origOnLoad === 'function') return origOnLoad.apply(this, args);
                            };
                        }
                    } catch (_) {}
                    return rawSend.apply(this, arguments);
                };
            }

            // 3. Intercept navigator.sendBeacon
            if (win.navigator && typeof win.navigator.sendBeacon === 'function') {
                const rawSendBeacon = win.navigator.sendBeacon.bind(win.navigator);
                win.navigator.sendBeacon = function(url, data) {
                    try {
                        if (isStorySeenRequest(url, data)) {
                            stealthSeenCount++;
                            console.info(`[MaxPland Stealth] Blocked Beacon story seen ping #${stealthSeenCount}:`, url);
                            return true;
                        }
                    } catch (_) {}
                    return rawSendBeacon(url, data);
                };
            }
        } catch (_) {}
    }
    installStorySeenInterceptor();

    // CLEAN FEED MODE CONTROLLER
    let cleanFeedObserver = null;
    function applyCleanFeedMode() {
        const isEnabled = Boolean(STATE.prefs?.cleanFeed);
        let styleTag = document.getElementById('maxpland-clean-feed-style');

        if (!isEnabled) {
            if (styleTag) styleTag.remove();
            if (cleanFeedObserver) {
                cleanFeedObserver.disconnect();
                cleanFeedObserver = null;
            }
            document.querySelectorAll('article[data-mp-hidden-ad="true"]').forEach(el => {
                delete el.dataset.mpHiddenAd;
            });
            return;
        }

        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'maxpland-clean-feed-style';
            // ponytail: avoid display:none layout collapse which causes browser scroll-anchor to jump to top (0, 0)
            styleTag.textContent = `
                article:has(a[href*="/ads/ig_redirect/"]),
                article:has(a[href*="/ads/about/"]),
                article:has(a[href*="facebook.com/ads/"]),
                article[data-mp-hidden-ad="true"] {
                    visibility: hidden !important;
                    height: 0 !important;
                    min-height: 0 !important;
                    max-height: 0 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border: none !important;
                    overflow: hidden !important;
                    overflow-anchor: none !important;
                    pointer-events: none !important;
                    opacity: 0 !important;
                }
            `;
            (document.head || document.documentElement).appendChild(styleTag);
        }

        const scanArticles = () => {
            if (!STATE.prefs?.cleanFeed) return;
            const AD_KEYWORDS = ['sponsored', 'ได้รับการสนับสนุน', 'suggested for you', 'แนะนำสำหรับคุณ'];
            const articles = document.querySelectorAll('article:not([data-mp-hidden-ad])');
            for (const article of articles) {
                const header = article.querySelector('header');
                const text = (header ? header.textContent : (article.textContent || '').slice(0, 300)).toLowerCase();
                const isAd = AD_KEYWORDS.some(kw => text.includes(kw));
                if (isAd) {
                    article.dataset.mpHiddenAd = 'true';
                }
            }
        };

        scanArticles();

        if (!cleanFeedObserver) {
            let debounceTimer = null;
            cleanFeedObserver = new MutationObserver(() => {
                if (debounceTimer) return;
                debounceTimer = setTimeout(() => {
                    debounceTimer = null;
                    scanArticles();
                }, 150);
            });
            // ponytail: scope to <main> (the feed always lives there) with a body fallback —
            // stops reacting to every sidebar/dialog/header mutation IG performs.
            const feedRoot = document.querySelector('main') || document.body || document.documentElement;
            cleanFeedObserver.observe(feedRoot, { childList: true, subtree: true });
        }
    }

    /* ==========================================================================
       5. UI BUILDER (Mini Draggable Circle & Clean Precision Modal)
       ========================================================================== */

    function createUI() {
        const stylesheet = document.createElement('style');
        stylesheet.id = 'maxpland-styles';
        stylesheet.textContent = NATIVE_IG_CSS;
        (document.head || document.documentElement).append(stylesheet);

        // Mini Circular Floating Launcher Button
        const triggerBtn = document.createElement('button');
        triggerBtn.type = 'button';
        triggerBtn.setAttribute('aria-label', 'Open IG MaxPland');
        triggerBtn.id = 'maxpland-trigger-btn';
        triggerBtn.title = 'MaxPland · Alt+Shift+M (Draggable)';
        triggerBtn.innerHTML = ICONS.LOGO;

        // Restore saved position
        try {
            const savedPos = JSON.parse(localStorage.getItem('maxpland_launcher_pos') || 'null');
            if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
                const clampX = Math.min(window.innerWidth - 50, Math.max(10, savedPos.x));
                const clampY = Math.min(window.innerHeight - 50, Math.max(10, savedPos.y));
                triggerBtn.style.left = `${clampX}px`;
                triggerBtn.style.top = `${clampY}px`;
                triggerBtn.style.right = 'auto';
                triggerBtn.style.bottom = 'auto';
            }
        } catch (_) {}

        document.body.appendChild(triggerBtn);

        // Overlay & Modal Container
        const overlay = document.createElement('div');
        overlay.id = 'maxpland-studio-overlay';
        overlay.style.display = 'none';

        const modal = document.createElement('div');
        modal.id = 'maxpland-studio-modal';
        modal.style.display = 'none';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'IG MaxPland');

        modal.innerHTML = `
            <div class="maxpland-header">
                <div class="maxpland-brand">
                    ${ICONS.LOGO}
                    <span>MaxPland</span>
                    <span id="maxpland-account-badge" class="maxpland-user-pill">Checking account...</span>
                </div>
                <button class="maxpland-close-btn" id="maxpland-close-btn" aria-label="Close MaxPland">${ICONS.CLOSE}</button>
            </div>

            <nav class="maxpland-tabs" role="tablist" aria-label="MaxPland Navigation">
                <button class="maxpland-tab-btn active" data-tab="relationship">${ICONS.USERS} Relationships</button>
                <button class="maxpland-tab-btn" data-tab="health">${ICONS.ANALYTICS} Account Health</button>
                <button class="maxpland-tab-btn" data-tab="features">${ICONS.FEATURES} Features</button>
                <button class="maxpland-tab-btn" data-tab="settings">${ICONS.SETTINGS} Settings</button>
                <button class="maxpland-tab-btn" data-tab="vault">${ICONS.DOWNLOAD} Media Vault</button>
            </nav>

            <div class="maxpland-progress-container" id="maxpland-global-progress">
                <div class="maxpland-scan-row">
                    <span class="maxpland-scan-phase" id="maxpland-scan-phase">[1/2] Preparing scan...</span>
                    <div class="maxpland-scan-meta">
                        <span id="maxpland-scan-stat-count">Users: 0</span>
                        <span id="maxpland-scan-stat-page">Pages: 0</span>
                        <span id="maxpland-scan-stat-timer">⏱️ 00:00</span>
                        <button type="button" class="maxpland-btn-secondary" id="maxpland-btn-pause-scan" style="display:none" title="Pause the running scan; progress is saved page by page">⏸ Pause</button>
                        <button type="button" class="maxpland-btn-danger" id="maxpland-btn-stop-scan">${ICONS.STOP} Stop</button>
                    </div>
                </div>
                <div class="maxpland-progress-track">
                    <div class="maxpland-progress-bar" id="maxpland-progress-fill"></div>
                </div>
                <div id="maxpland-scan-notice" class="maxpland-scan-notice"></div>
            </div>

            <div class="maxpland-body">
                <!-- TAB 1: Relationship & Unfollowers -->
                <div class="maxpland-tab-content active" id="tab-relationship">
                    <!-- Metric Cards -->
                    <div class="maxpland-stats-grid">
                        <div class="maxpland-stat-card card-not-following" data-target-filter="not_following_back">
                            <span class="maxpland-stat-label">Not Following Back</span>
                            <span class="maxpland-stat-value" id="stat-not-following-back">-</span>
                            <span class="maxpland-stat-hint">You follow them, they don't</span>
                        </div>
                        <div class="maxpland-stat-card card-fans" data-target-filter="fans">
                            <span class="maxpland-stat-label">Fans</span>
                            <span class="maxpland-stat-value" id="stat-fans">-</span>
                            <span class="maxpland-stat-hint">They follow you, you don't</span>
                        </div>
                        <div class="maxpland-stat-card card-mutual" data-target-filter="mutual">
                            <span class="maxpland-stat-label">Mutuals</span>
                            <span class="maxpland-stat-value" id="stat-mutual">-</span>
                            <span class="maxpland-stat-hint">Follow each other</span>
                        </div>
                        <div class="maxpland-stat-card card-lost" data-target-filter="lost">
                            <span class="maxpland-stat-label">Recently Lost</span>
                            <span class="maxpland-stat-value" id="stat-lost">-</span>
                            <span class="maxpland-stat-hint">Unfollowed since last scan</span>
                        </div>
                        <div class="maxpland-stat-card card-ghost" data-target-filter="ghost">
                            <span class="maxpland-stat-label">👻 Ghost Accounts</span>
                            <span class="maxpland-stat-value" id="stat-ghost">-</span>
                            <span class="maxpland-stat-hint">No profile picture</span>
                        </div>
                    </div>

                    <!-- Category Toolbar -->
                    <div class="maxpland-toolbar">
                        <div class="maxpland-filter-group">
                            <button class="maxpland-pill-btn active" data-filter="not_following_back">
                                Not Following Back <span class="maxpland-pill-count" id="pill-count-not">-</span>
                            </button>
                            <button class="maxpland-pill-btn" data-filter="fans">
                                Fans <span class="maxpland-pill-count" id="pill-count-fans">-</span>
                            </button>
                            <button class="maxpland-pill-btn" data-filter="mutual">
                                Mutual <span class="maxpland-pill-count" id="pill-count-mutual">-</span>
                            </button>
                            <button class="maxpland-pill-btn" data-filter="lost">
                                Recently Lost <span class="maxpland-pill-count" id="pill-count-lost">-</span>
                            </button>
                            <button class="maxpland-pill-btn" data-filter="ghost">
                                👻 Ghost <span class="maxpland-pill-count" id="pill-count-ghost">-</span>
                            </button>
                            <button class="maxpland-pill-btn" data-filter="renamed">
                                ✏️ Renamed <span class="maxpland-pill-count" id="pill-count-renamed">-</span>
                            </button>
                            <button class="maxpland-pill-btn" data-filter="inactive">
                                ⏱️ Inactive <span class="maxpland-pill-count" id="pill-count-inactive">-</span>
                            </button>
                            <button class="maxpland-pill-btn" data-filter="whitelist">
                                ⭐ Whitelist <span class="maxpland-pill-count" id="pill-count-white">-</span>
                            </button>
                        </div>
                        <div class="maxpland-search-box">
                            ${ICONS.SEARCH}
                            <input type="text" placeholder="Search username or full name..." id="maxpland-user-search">
                        </div>
                    </div>

                    <!-- Sub-filters & Quick Toggles -->
                    <div class="maxpland-subfilters">
                        <span style="font-weight:600;color:var(--mp-text-muted);">Filters:</span>
                        <div class="maxpland-chip-toggle" id="toggle-filter-whitelist" title="Hide starred whitelist accounts">
                            ${ICONS.STAR} Hide Whitelist
                        </div>
                        <div class="maxpland-chip-toggle" id="toggle-filter-verified" title="Hide verified badge accounts">
                            ${ICONS.VERIFIED} Hide Verified
                        </div>
                        <div class="maxpland-chip-toggle" id="toggle-filter-private" title="Hide private accounts">
                            ${ICONS.LOCK} Hide Private
                        </div>
                        <div class="maxpland-chip-toggle" id="toggle-filter-noavatar" title="Hide accounts without avatar">
                            Hide No-Avatar
                        </div>
                        <div class="maxpland-chip-toggle" id="toggle-filter-following" title="Show only accounts we already follow (present in our Following list)">
                            Followed
                        </div>
                        <div class="maxpland-chip-toggle" id="toggle-filter-notfollowing" title="Show only accounts we have not followed yet">
                            Not followed yet
                        </div>
                    </div>
                    <div class="maxpland-export-actions">
                        <button class="maxpland-btn-secondary" id="maxpland-btn-copy-usernames" style="padding:4px 9px;font-size:11.5px;" title="Copy all visible usernames to clipboard">
                            ${ICONS.COPY} Copy Usernames
                        </button>
                        <button class="maxpland-btn-secondary" id="maxpland-btn-export-csv" style="padding:4px 9px;font-size:11.5px;">
                            ${ICONS.DOWNLOAD} CSV
                        </button>
                        <button class="maxpland-btn-secondary" id="maxpland-btn-export-json" style="padding:4px 9px;font-size:11.5px;">
                            JSON
                        </button>
                    </div>

                    <!-- Action Bar -->
                    <div class="maxpland-toolbar" style="margin-bottom:10px;">
                        <div style="display:flex;gap:8px;align-items:center;">
                            <button class="maxpland-btn-primary" id="maxpland-btn-scan-relationships">
                                ${ICONS.USERS} Scan Relationships
                            </button>
                            <button class="maxpland-btn-secondary" id="maxpland-btn-scan-inactive" title="Scan Following accounts for inactivity beyond threshold" style="padding:6px 10px;font-size:12px;">
                                ${ICONS.CLOCK} Inactive Radar
                            </button>
                            <div style="display:flex;gap:6px;" id="maxpland-whitelist-tools">
                                <button class="maxpland-btn-secondary" id="maxpland-btn-backup-whitelist" title="Export starred accounts whitelist as JSON file" style="padding:6px 10px;font-size:12px;">
                                    ${ICONS.BACKUP} Backup Whitelist
                                </button>
                                <button class="maxpland-btn-secondary" id="maxpland-btn-restore-whitelist" title="Import starred accounts from backup JSON file" style="padding:6px 10px;font-size:12px;">
                                    ${ICONS.RESTORE} Restore Whitelist
                                </button>
                                <input type="file" id="maxpland-whitelist-file-input" accept=".json" style="display:none;">
                            </div>
                        </div>
                        <span id="maxpland-scan-status-summary" style="font-size:12px;color:var(--mp-text-muted);font-variant-numeric:tabular-nums;"></span>
                    </div>

                    <!-- Floating Bulk Action Bar (Visible when users selected) -->
                    <div class="maxpland-bulk-bar" id="maxpland-bulk-bar">
                        <div class="maxpland-bulk-info">
                            <span id="maxpland-bulk-count-label">0 accounts selected</span>
                            <button type="button" class="maxpland-btn-secondary" id="maxpland-btn-select-all" style="padding:3px 8px;font-size:11px;">Select page</button>
                            <button type="button" class="maxpland-btn-secondary" id="maxpland-btn-deselect-all" style="padding:3px 8px;font-size:11px;">Deselect all</button>
                        </div>
                        <div class="maxpland-bulk-actions">
                            <button type="button" class="maxpland-btn-danger" id="maxpland-btn-batch-unfollow">
                                ${ICONS.UNFOLLOW} Unfollow Selected
                            </button>
                        </div>
                    </div>

                    <!-- User List -->
                    <div class="maxpland-user-list" id="maxpland-relationship-list">
                        <div style="padding: 48px; text-align: center; color: var(--mp-text-muted);">
                            Click <b>"Scan Relationships"</b> to compare your Following & Followers.
                        </div>
                    </div>
                </div>

                <!-- TAB 2: Account Health Dashboard -->
                <div class="maxpland-tab-content" id="tab-health">
                    <div style="margin-bottom:14px;">
                        <h2 style="font-size:15px;font-weight:700;margin:0 0 4px;">Account Health & Relationship Analytics</h2>
                        <p style="font-size:12px;color:var(--mp-text-muted);margin:0;">Computed from local snapshot database with zero network overhead.</p>
                    </div>

                    <div class="maxpland-health-hero">
                        <div class="maxpland-health-card">
                            <div class="maxpland-health-title">Follower Ratio</div>
                            <div class="maxpland-health-val" id="health-ratio-val">-</div>
                            <div id="health-ratio-badge" class="maxpland-health-badge" style="background:var(--mp-cyan-bg);color:var(--mp-cyan);">Awaiting scan</div>
                        </div>
                        <div class="maxpland-health-card">
                            <div class="maxpland-health-title">Mutual Rate</div>
                            <div class="maxpland-health-val" id="health-mutual-val">-</div>
                            <div id="health-mutual-badge" class="maxpland-health-badge" style="background:var(--mp-emerald-bg);color:var(--mp-emerald);">Reciprocal follow rate</div>
                        </div>
                        <div class="maxpland-health-card">
                            <div class="maxpland-health-title">Not Following Back</div>
                            <div class="maxpland-health-val" id="health-notback-val">-</div>
                            <div id="health-notback-badge" class="maxpland-health-badge" style="background:var(--mp-rose-bg);color:var(--mp-rose);">Unrequited follows</div>
                        </div>
                        <div class="maxpland-health-card">
                            <div class="maxpland-health-title">Ghost & Inactive Impact</div>
                            <div class="maxpland-health-val" id="health-ghost-val">-</div>
                            <div id="health-ghost-badge" class="maxpland-health-badge" style="background:var(--mp-amber-bg);color:var(--mp-amber);">No profile picture</div>
                        </div>
                    </div>

                    <!-- Historical Sparkline Chart -->
                    <div class="maxpland-chart-box">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            <div>
                                <span style="font-size:13px;font-weight:700;">📈 Follower Count Trend (Historical Snapshots)</span>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">Archived locally in IndexedDB after each scan</div>
                            </div>
                            <span id="health-drift-delta" style="font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;"></span>
                        </div>
                        <div id="health-chart-container" style="min-height:130px;display:grid;place-items:center;color:var(--mp-text-muted);font-size:12px;">
                            Run at least 1 relationship scan to begin plotting history trend.
                        </div>
                    </div>

                    <!-- Health Advice Box -->
                    <div style="background:var(--mp-bg-card);border:1px solid var(--mp-border-card);border-radius:8px;padding:14px 16px;">
                        <span style="font-size:13px;font-weight:700;color:#38bdf8;">💡 Strategic Account Health Advice:</span>
                        <div id="health-advice-text" style="font-size:12px;color:var(--mp-text-secondary);margin-top:6px;line-height:1.5;">
                            Run a relationship scan in the first tab to receive tailored account structure insights.
                        </div>
                    </div>
                </div>

                <!-- TAB 3: Features Control Panel (Switches) -->
                <div class="maxpland-tab-content" id="tab-features">
                    <div style="margin-bottom:16px;">
                        <h2 style="font-size:15px;font-weight:700;margin:0 0 4px;">Feature Controller & Master Toggles</h2>
                        <p style="font-size:12px;color:var(--mp-text-muted);margin:0;">Enable or disable capabilities on demand with instant persistence.</p>
                    </div>

                    <div class="maxpland-feature-card">
                        <div class="maxpland-feature-info">
                            <div class="maxpland-feature-title">
                                ${ICONS.EYE} Stealth Story Viewer (Anonymous)
                                <span class="maxpland-badge-emerald">Recommended</span>
                            </div>
                            <div class="maxpland-feature-desc">
                                Blocks seen telemetry beacons to Instagram servers 100%. View any story completely anonymously without appearing on the viewer list.
                            </div>
                        </div>
                        <label class="maxpland-switch" title="Toggle Stealth Story Viewer">
                            <input type="checkbox" id="pref-switch-stealth-story">
                            <span class="maxpland-slider"></span>
                        </label>
                    </div>

                    <div class="maxpland-feature-card">
                        <div class="maxpland-feature-info">
                            <div class="maxpland-feature-title">
                                ${ICONS.SHIELD} Clean Feed Mode (Ad & Suggestion Blocker)
                            </div>
                            <div class="maxpland-feature-desc">
                                Automatically hides sponsored ads and suggested posts from your home feed so you only see content from accounts you actually follow.
                            </div>
                        </div>
                        <label class="maxpland-switch" title="Toggle Clean Feed Mode">
                            <input type="checkbox" id="pref-switch-clean-feed">
                            <span class="maxpland-slider"></span>
                        </label>
                    </div>

                    <div class="maxpland-feature-card">
                        <div class="maxpland-feature-info">
                            <div class="maxpland-feature-title">
                                ${ICONS.DOWNLOAD} In-Feed Media Download Buttons
                            </div>
                            <div class="maxpland-feature-desc">
                                Displays direct full-resolution download buttons next to the bookmark icon on every feed post.
                            </div>
                        </div>
                        <label class="maxpland-switch" title="Toggle In-Feed Download Buttons">
                            <input type="checkbox" id="pref-switch-feed-download">
                            <span class="maxpland-slider"></span>
                        </label>
                    </div>

                    <div class="maxpland-feature-card">
                        <div class="maxpland-feature-info">
                            <div class="maxpland-feature-title">
                                ${ICONS.THUMBNAIL} Story Toolbar & Downloader
                            </div>
                            <div class="maxpland-feature-desc">
                                Floating utility toolbar in the top-right corner of story views for instant video, cover photo downloads, and stealth toggle.
                            </div>
                        </div>
                        <label class="maxpland-switch" title="Toggle Story Toolbar">
                            <input type="checkbox" id="pref-switch-story-toolbar">
                            <span class="maxpland-slider"></span>
                        </label>
                    </div>
                </div>

                <!-- TAB 4: Settings & Configuration -->
                <div class="maxpland-tab-content" id="tab-settings">
                    <div style="margin-bottom:16px;">
                        <h2 style="font-size:15px;font-weight:700;margin:0 0 4px;">Settings & Safety Configuration</h2>
                        <p style="font-size:12px;color:var(--mp-text-muted);margin:0;">Configure detection thresholds, safety delay parameters, and backups.</p>
                    </div>

                    <div class="maxpland-settings-group">
                        <h3 class="maxpland-settings-group-title">${ICONS.CLOCK} Inactive Following Radar Threshold</h3>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">Inactivity Duration Threshold</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">Calculated from the timestamp of each user's latest feed post</div>
                            </div>
                            <select id="pref-setting-inactive-threshold" class="maxpland-select">
                                <option value="90">90 Days (3 Months)</option>
                                <option value="180">180 Days (6 Months - Recommended)</option>
                                <option value="365">365 Days (1 Year)</option>
                            </select>
                        </div>
                    </div>

                    <div class="maxpland-settings-group">
                        <h3 class="maxpland-settings-group-title">🛡️ Anti-Detection Guard & Pacing</h3>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">Unfollow Jitter Delay</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">Randomized pacing interval between unfollow actions to emulate natural human behavior and prevent rate limits.</div>
                            </div>
                            <span style="font-size:12px;font-weight:600;color:var(--mp-emerald);">${APP_CONFIG.UNFOLLOW_DELAY_MIN.toLocaleString()} - ${APP_CONFIG.UNFOLLOW_DELAY_MAX.toLocaleString()} ms (Randomized)</span>
                        </div>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">Scan Speed</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">A Safe 6–12 s/page · B ~2x faster 3–6 s/page · C fastest 1.5–3 s/page — all modes serial with jittered delays + breathing rests</div>
                            </div>
                            <select id="pref-setting-scan-speed" class="maxpland-select" aria-label="Scan speed" title="A: Safe (6-12 s/page + rests, recommended) · B: ~2x faster (3-6 s/page) · C: Fastest (1.5-3 s/page, higher risk)">
                                <option value="A" selected>A — Safe (recommended)</option>
                                <option value="B">B — Fast ~2x</option>
                                <option value="C">C — Fastest ~4x (high risk)</option>
                            </select>
                        </div>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">Following / Followers Page Limit</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">Safety ceiling per scan session to prevent session throttling.</div>
                            </div>
                            <span style="font-size:12px;font-weight:600;color:var(--mp-blue);">60 pages (3,000 users) / 250 pages (12,500 users)</span>
                        </div>
                    </div>

                    <div class="maxpland-settings-group">
                        <h3 class="maxpland-settings-group-title">💾 Data Vault & Cache Management</h3>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">Backup & Restore Starred Whitelist</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">Export or import protected accounts whitelist as JSON file.</div>
                            </div>
                            <div style="display:flex;gap:6px;">
                                <button type="button" class="maxpland-btn-secondary" id="setting-btn-backup-whitelist" style="padding:5px 10px;font-size:12px;">${ICONS.BACKUP} Backup Whitelist</button>
                                <button type="button" class="maxpland-btn-secondary" id="setting-btn-restore-whitelist" style="padding:5px 10px;font-size:12px;">${ICONS.RESTORE} Restore Whitelist</button>
                            </div>
                        </div>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">Activity Radar Cache</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">Purge stored last-post timestamps from IndexedDB to force fresh scanning.</div>
                            </div>
                            <button type="button" class="maxpland-btn-danger" id="setting-btn-clear-cache" style="padding:5px 10px;font-size:12px;">Purge Radar Cache</button>
                        </div>
                        <div class="maxpland-settings-row" id="maxpland-block-row" style="display:none;">
                            <div>
                                <div style="font-weight:600;font-size:13px;color:var(--mp-rose);">Account Block Active</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">Instagram returned feedback_required. All requests are refused until you clear this. Wait 6+ hours first — retrying during a block extends it.</div>
                            </div>
                            <button type="button" class="maxpland-btn-danger" id="setting-btn-clear-block" style="padding:5px 10px;font-size:12px;">Clear Block</button>
                        </div>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">Unfollow Activity</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);" id="maxpland-budget-label">${formatBudget()}</div>
                            </div>
                            <button type="button" class="maxpland-btn-secondary" id="setting-btn-reset-budget" style="padding:5px 10px;font-size:12px;">Reset Counter</button>
                        </div>
                    </div>
                </div>

                <!-- TAB 5: Media Vault -->
                <div class="maxpland-tab-content" id="tab-vault">
                    <div style="margin-bottom:12px;">
                        <h2 style="font-size:15px;font-weight:700;margin:0 0 4px;">Direct Media Downloader & Vault</h2>
                        <p style="font-size:12px;color:var(--mp-text-muted);margin:0;">Paste post or Reel links to download full-resolution assets or browse historical vault.</p>
                    </div>

                    <textarea id="maxpland-media-queue-input" placeholder="Paste post or Reel URLs (one per line):&#10;https://www.instagram.com/p/ABC123xyz/&#10;https://www.instagram.com/reel/XYZ789abc/" style="width:100%;min-height:100px;resize:vertical;background:var(--mp-bg-panel);border:1px solid var(--mp-border-card);color:var(--mp-text-primary);border-radius:6px;padding:10px;font-family:ui-monospace,monospace;font-size:12px;"></textarea>
                    
                    <div class="maxpland-toolbar" style="margin-top:10px;">
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button class="maxpland-btn-primary" id="maxpland-btn-run-media-queue">${ICONS.DOWNLOAD} Download New</button>
                            <button class="maxpland-btn-secondary" id="maxpland-btn-run-media-all">Re-download All</button>
                            <button class="maxpland-btn-secondary" id="maxpland-btn-refresh-vault">Refresh Vault</button>
                        </div>
                        <span id="maxpland-media-queue-status" style="font-size:12px;color:var(--mp-text-secondary);font-variant-numeric:tabular-nums;"></span>
                    </div>
                    <div class="maxpland-user-list" id="maxpland-vault-list">
                        <div style="padding:48px;text-align:center;color:var(--mp-text-muted);">No download history yet</div>
                    </div>
                </div>

                <!-- Toast Element -->
                <div class="maxpland-toast" id="maxpland-toast">Notification</div>
            </div>

            <div class="maxpland-footer">
                <span>MaxPland v3.0.0 · Clean Minimal Precision (Anti-Slop)</span>
                <span>Toggle <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd></span>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        bindUIEvents(triggerBtn, overlay, modal);
    }

    function renderViewerPanel(anchor, viewers) {
        let panel = document.getElementById('maxpland-viewer-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'maxpland-viewer-panel';
            panel.style.cssText = 'position:fixed;z-index:99999;min-width:240px;max-width:300px;max-height:320px;overflow:auto;background:var(--mp-bg-panel,#14161a);border:1px solid var(--mp-border-card,#262a30);border-radius:10px;padding:10px 12px;color:#e6edf3;font-size:12.5px;box-shadow:0 8px 30px rgba(0,0,0,.45);';
            document.body.appendChild(panel);
            document.addEventListener('click', e => {
                const p = document.getElementById('maxpland-viewer-panel');
                if (p && !p.contains(e.target) && !e.target.closest?.('.maxpland-story-btn')) p.remove();
            });
        }
        const rect = anchor.getBoundingClientRect();
        panel.style.left = Math.max(8, Math.min(window.innerWidth - 308, rect.left)) + 'px';
        panel.style.top = Math.max(8, rect.top - 8) + 'px';
        panel.style.transform = 'translateY(-100%)';
        if (!viewers.length) {
            panel.innerHTML = '<div style="color:var(--mp-text-muted,#8b949e);">No viewer data (story may not be yours, expired, or private).</div>';
            return;
        }
        const rows = viewers.slice(0, 100).map(u => {
            // API response is a trust boundary: strip anything outside IG's username charset.
            const name = String(u.username || u.pk || 'unknown').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) || 'unknown';
            const when = u.timestamp ? new Date(u.timestamp * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
            return `<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05);"><span>@${name}</span><span style="color:var(--mp-text-muted,#8b949e);white-space:nowrap;">${when}</span></div>`;
        }).join('');
        panel.innerHTML = `<div style="font-weight:600;margin-bottom:6px;">👁 ${viewers.length.toLocaleString()} viewer${viewers.length === 1 ? '' : 's'}</div>${rows}`;
    }

    function showToast(message, duration = 2500) {
        const toast = document.getElementById('maxpland-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    }

    /* ==========================================================================
       6. UI EVENTS & MODULE HANDLERS
       ========================================================================== */

    function bindUIEvents(triggerBtn, overlay, modal) {
        const openModal = async () => {
            overlay.style.display = 'block';
            modal.style.display = 'grid';
            triggerBtn.style.visibility = 'hidden';
            document.getElementById('maxpland-close-btn').focus();

            // Resolve and show active account
            const user = await IgBridge.resolveCurrentUser();
            const badge = document.getElementById('maxpland-account-badge');
            if (user && user.username) {
                badge.textContent = `@${user.username}`;
                STATE.currentUser = user;
            } else if (user && user.id) {
                badge.textContent = `UID: ${user.id}`;
                STATE.currentUser = user;
            } else {
                badge.textContent = 'Account not found (Log in)';
            }

            syncFeaturesTab();
            syncSettingsTab();
            if (STATE.activeTab === 'health') renderHealthDashboard();
        };

        const closeModal = () => {
            if (STATE.isScanning || STATE.isUnfollowing || STATE.isScanningInactive) {
                if (!confirm('A task is currently in progress. Do you want to close?')) return;
            }
            overlay.style.display = 'none';
            modal.style.display = 'none';
            triggerBtn.style.visibility = 'visible';
            triggerBtn.focus();
        };

        // Expose open/close functions globally for feed buttons & commands
        window.openMaxPlandStudio = openModal;
        window.closeMaxPlandStudio = closeModal;

        // DRAGGABLE LOGIC FOR LAUNCHER BUTTON
        let isPointerDown = false;
        let isDragging = false;
        let startX = 0, startY = 0;
        let startLeft = 0, startTop = 0;

        triggerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isDragging) {
                openModal();
            }
        });

        triggerBtn.addEventListener('pointerdown', (e) => {
            isPointerDown = true;
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = triggerBtn.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            triggerBtn.setPointerCapture(e.pointerId);
        });

        triggerBtn.addEventListener('pointermove', (e) => {
            if (!isPointerDown) return;
            const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
            if (dist > 4) {
                isDragging = true;
                const newLeft = Math.min(window.innerWidth - 48, Math.max(8, startLeft + (e.clientX - startX)));
                const newTop = Math.min(window.innerHeight - 48, Math.max(8, startTop + (e.clientY - startY)));
                triggerBtn.style.left = `${newLeft}px`;
                triggerBtn.style.top = `${newTop}px`;
                triggerBtn.style.right = 'auto';
                triggerBtn.style.bottom = 'auto';
            }
        });

        const handlePointerEnd = (e) => {
            if (!isPointerDown) return;
            isPointerDown = false;
            try { triggerBtn.releasePointerCapture(e.pointerId); } catch (_) {}
            if (isDragging) {
                const rect = triggerBtn.getBoundingClientRect();
                localStorage.setItem('maxpland_launcher_pos', JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }));
            } else {
                openModal();
            }
        };

        triggerBtn.addEventListener('pointerup', handlePointerEnd);
        triggerBtn.addEventListener('pointercancel', handlePointerEnd);

        modal.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
        });

        document.addEventListener('keydown', e => {
            if (e.altKey && e.shiftKey && e.code === 'KeyM' && !e.repeat) {
                e.preventDefault();
                if (modal.style.display === 'none') openModal(); else closeModal();
            }
        });
        overlay.addEventListener('click', closeModal);
        document.getElementById('maxpland-close-btn').addEventListener('click', closeModal);

        // Tab Switching
        const tabs = modal.querySelectorAll('.maxpland-tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
                modal.querySelectorAll('.maxpland-tab-content').forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                const target = document.getElementById(`tab-${tab.dataset.tab}`);
                if (target) target.classList.add('active');
                STATE.activeTab = tab.dataset.tab;
                if (tab.dataset.tab === 'vault') renderMediaVault();
                if (tab.dataset.tab === 'health') renderHealthDashboard();
                if (tab.dataset.tab === 'features') syncFeaturesTab();
                if (tab.dataset.tab === 'settings') syncSettingsTab();
            });
        });

        // Filter Switching (Pills)
        const filterBtns = document.getElementById('tab-relationship').querySelectorAll('.maxpland-pill-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                STATE.relationshipFilter = btn.dataset.filter;
                STATE.selectedIds.clear();
                updateBulkActionBar();
                renderRelationshipList();
            });
        });

        // Stat Card Quick Clicks
        modal.querySelectorAll('.maxpland-stat-card').forEach(card => {
            card.addEventListener('click', () => {
                const target = card.dataset.targetFilter;
                const pill = modal.querySelector(`.maxpland-pill-btn[data-filter="${target}"]`);
                if (pill) pill.click();
            });
        });

        // Sub-filter Chips Toggles
        const toggleWhitelist = document.getElementById('toggle-filter-whitelist');
        toggleWhitelist.addEventListener('click', () => {
            STATE.subFilters.excludeWhitelist = !STATE.subFilters.excludeWhitelist;
            toggleWhitelist.classList.toggle('active', STATE.subFilters.excludeWhitelist);
            renderRelationshipList();
        });

        const toggleVerified = document.getElementById('toggle-filter-verified');
        toggleVerified.addEventListener('click', () => {
            STATE.subFilters.excludeVerified = !STATE.subFilters.excludeVerified;
            toggleVerified.classList.toggle('active', STATE.subFilters.excludeVerified);
            renderRelationshipList();
        });

        const togglePrivate = document.getElementById('toggle-filter-private');
        togglePrivate.addEventListener('click', () => {
            STATE.subFilters.excludePrivate = !STATE.subFilters.excludePrivate;
            togglePrivate.classList.toggle('active', STATE.subFilters.excludePrivate);
            renderRelationshipList();
        });

        const toggleNoAvatar = document.getElementById('toggle-filter-noavatar');
        toggleNoAvatar.addEventListener('click', () => {
            STATE.subFilters.excludeNoAvatar = !STATE.subFilters.excludeNoAvatar;
            toggleNoAvatar.classList.toggle('active', STATE.subFilters.excludeNoAvatar);
            renderRelationshipList();
        });

        document.getElementById('toggle-filter-following').addEventListener('click', () => setFollowStateChip('onlyFollowing'));

        document.getElementById('toggle-filter-notfollowing').addEventListener('click', () => setFollowStateChip('onlyNotFollowed'));

        // Search Input
        document.getElementById('maxpland-user-search').addEventListener('input', (e) => {
            STATE.searchQuery = e.target.value.trim().toLowerCase();
            renderRelationshipList();
        });

        // Scan Actions
        document.getElementById('maxpland-btn-scan-relationships').addEventListener('click', runRelationshipScan);
        document.getElementById('maxpland-btn-stop-scan').addEventListener('click', () => {
            STATE.stopScanFlag = true;
            STATE.scanController?.abort();
            STATE.stopInactiveScanFlag = true;
            STATE.inactiveController?.abort();
            STATE.stopUnfollowFlag = true;
            document.getElementById('maxpland-scan-phase').textContent = 'Stopping scan as requested...';
        });
        document.getElementById('maxpland-btn-pause-scan').addEventListener('click', () => {
            STATE.scanPaused = !STATE.scanPaused;
            const pb = document.getElementById('maxpland-btn-pause-scan');
            pb.textContent = STATE.scanPaused ? '▶ Resume' : '⏸ Pause';
            document.getElementById('maxpland-scan-phase').textContent = STATE.scanPaused ? 'Scan paused — progress saved page by page' : 'Fetching relationship pages...';
        });

        // Whitelist Backup & Restore
        document.getElementById('maxpland-btn-backup-whitelist').addEventListener('click', exportWhitelistBackup);
        const restoreInput = document.getElementById('maxpland-whitelist-file-input');
        document.getElementById('maxpland-btn-restore-whitelist').addEventListener('click', () => restoreInput.click());
        restoreInput.addEventListener('change', handleWhitelistRestoreFile);

        // Bulk Selection Actions
        document.getElementById('maxpland-btn-select-all').addEventListener('click', selectAllVisible);
        document.getElementById('maxpland-btn-deselect-all').addEventListener('click', () => {
            STATE.selectedIds.clear();
            updateBulkActionBar();
            renderRelationshipList();
        });
        document.getElementById('maxpland-btn-batch-unfollow').addEventListener('click', runBatchUnfollow);

        // Export Actions
        document.getElementById('maxpland-btn-copy-usernames').addEventListener('click', copyVisibleUsernames);
        document.getElementById('maxpland-btn-export-csv').addEventListener('click', exportRelationshipCSV);
        document.getElementById('maxpland-btn-export-json').addEventListener('click', exportRelationshipJSON);

        // Media Downloader Actions
        document.getElementById('maxpland-btn-run-media-queue').addEventListener('click', () => runMediaQueue({ skipExisting: true }));
        document.getElementById('maxpland-btn-run-media-all').addEventListener('click', () => runMediaQueue({ skipExisting: false }));
        document.getElementById('maxpland-btn-refresh-vault').addEventListener('click', renderMediaVault);

        // Feature Switches (Master Toggles)
        const swStealth = document.getElementById('pref-switch-stealth-story');
        if (swStealth) {
            swStealth.addEventListener('change', (e) => {
                STATE.prefs.stealthStory = e.target.checked;
                savePrefs(STATE.prefs);
                showToast(e.target.checked ? 'Stealth Story Viewer enabled (Seen blocked)' : 'Stealth Story Viewer disabled');
            });
        }
        const swCleanFeed = document.getElementById('pref-switch-clean-feed');
        if (swCleanFeed) {
            swCleanFeed.addEventListener('change', (e) => {
                STATE.prefs.cleanFeed = e.target.checked;
                savePrefs(STATE.prefs);
                applyCleanFeedMode();
                showToast(e.target.checked ? 'Clean Feed Mode enabled (Ads hidden)' : 'Clean Feed Mode disabled');
            });
        }
        const swFeedDl = document.getElementById('pref-switch-feed-download');
        if (swFeedDl) {
            swFeedDl.addEventListener('change', (e) => {
                STATE.prefs.quickDownloadFeed = e.target.checked;
                savePrefs(STATE.prefs);
                showToast(e.target.checked ? 'In-feed download buttons enabled' : 'In-feed download buttons disabled');
            });
        }
        const swStoryTb = document.getElementById('pref-switch-story-toolbar');
        if (swStoryTb) {
            swStoryTb.addEventListener('change', (e) => {
                STATE.prefs.quickDownloadStory = e.target.checked;
                savePrefs(STATE.prefs);
                if (!e.target.checked) {
                    const bar = document.getElementById('maxpland-story-bar');
                    if (bar) bar.remove();
                }
                showToast(e.target.checked ? 'Story toolbar enabled' : 'Story toolbar disabled');
            });
        }

        // Settings Threshold & Actions
        const selInactive = document.getElementById('pref-setting-inactive-threshold');
        if (selInactive) {
            selInactive.addEventListener('change', (e) => {
                STATE.prefs.inactiveThresholdDays = Number(e.target.value);
                savePrefs(STATE.prefs);
                showToast(`Inactive threshold updated to ${e.target.value} days`);
            });
        }
        const selSpeed = document.getElementById('pref-setting-scan-speed');
        if (selSpeed) {
            selSpeed.addEventListener('change', (e) => {
                STATE.prefs.scanSpeed = e.target.value;
                savePrefs(STATE.prefs);
                showToast(`Scan speed set to mode ${e.target.value}`);
            });
        }
        const btnSettingBackup = document.getElementById('setting-btn-backup-whitelist');
        if (btnSettingBackup) btnSettingBackup.addEventListener('click', exportWhitelistBackup);
        const btnSettingRestore = document.getElementById('setting-btn-restore-whitelist');
        if (btnSettingRestore) btnSettingRestore.addEventListener('click', () => restoreInput.click());
        const btnClearCache = document.getElementById('setting-btn-clear-cache');
        const btnClearBlock = document.getElementById('setting-btn-clear-block');
        const btnResetBudget = document.getElementById('setting-btn-reset-budget');
        const blockRow = document.getElementById('maxpland-block-row');
        const budgetLabel = document.getElementById('maxpland-budget-label');
        if (btnClearBlock) {
            btnClearBlock.addEventListener('click', () => {
                if (!confirm('Only clear this if you have already waited 6+ hours since Instagram blocked the account.\n\nClearing it lets MaxPland send requests again immediately. If you are early, you can extend the block.\n\nClear the block?')) return;
                IgBridge.clearHardBlock();
                if (blockRow) blockRow.style.display = 'none';
                showToast('Account block cleared. MaxPland will send requests again.');
            });
        }
        if (btnResetBudget) {
            btnResetBudget.addEventListener('click', () => {
                if (!confirm('Reset the "unfollowed today" counter to zero?')) return;
                resetWriteBudget();
                if (budgetLabel) budgetLabel.textContent = formatBudget();
                showToast('Unfollow counter reset to 0.');
            });
        }
        if (btnClearCache) {
            btnClearCache.addEventListener('click', async () => {
                if (confirm('Do you want to purge all cached account activity timestamps?')) {
                    await MaxPlandVault.clearActivityCache();
                    STATE.inactiveFollowing = [];
                    const countEl = document.getElementById('pill-count-inactive');
                    if (countEl) countEl.textContent = '-';
                    showToast('Activity radar cache purged successfully');
                }
            });
        }

        // Inactive Radar Scan Trigger
        const btnScanInactive = document.getElementById('maxpland-btn-scan-inactive');
        if (btnScanInactive) btnScanInactive.addEventListener('click', runInactiveScan);

        // ponytail: Native Event Delegation for Relationship List (Zero Memory Leaks & 60fps Search)
        const relList = document.getElementById('maxpland-relationship-list');
        if (relList) {
            relList.addEventListener('change', (e) => {
                const box = e.target.closest('.user-select-checkbox');
                if (!box) return;
                const uid = box.dataset.id;
                if (box.checked) STATE.selectedIds.add(uid);
                else STATE.selectedIds.delete(uid);
                updateBulkActionBar();
            });

            relList.addEventListener('click', async (e) => {
                // 1. Star Toggle
                const star = e.target.closest('.maxpland-star-btn');
                if (star && !star.disabled) {
                    const uid = star.dataset.id;
                    const pool = getFilteredUsers();
                    const user = pool.find(u => String(u.id || u.pk || u.pk_id) === uid) || STATE.whitelist.get(uid);
                    if (user) {
                        star.disabled = true;
                        try {
                            const added = await MaxPlandVault.toggleWhitelist(user);
                            STATE.whitelist = await MaxPlandVault.getWhitelist();
                            const whiteCountEl = document.getElementById('pill-count-white');
                            if (whiteCountEl) whiteCountEl.textContent = STATE.whitelist.size.toLocaleString();
                            if (added) STATE.selectedIds.delete(uid);
                            showToast(added ? `Added @${user.username} to Whitelist` : `Removed @${user.username} from Whitelist`);
                            updateBulkActionBar();
                            renderRelationshipList();
                        } catch (err) { alert(err.message || String(err)); }
                        finally { star.disabled = false; }
                    }
                    return;
                }

                // 2. Single Unfollow
                const btn = e.target.closest('.maxpland-row-unfollow-btn');
                if (btn && !btn.disabled) {
                    if (STATE.isScanning || STATE.isUnfollowing || STATE.isScanningInactive || STATE.scanIncomplete) return;
                    // Measured leak: the row button had no pacing at all, so a user
                    // clicking row-by-row fired 5 writes in 472ms (91ms apart) while the
                    // batch path waits 15-30s between the same writes. Same delay, enforced
                    // here too, so the two paths cannot disagree about the write rate.
                    const since = Date.now() - (STATE.lastUnfollowAt || 0);
                    const wait = APP_CONFIG.UNFOLLOW_DELAY_MAX - since;
                    if (wait > 0) {
                        showToast(`⏳ Safety pacing: wait ${Math.ceil(wait / 1000)}s before the next unfollow`, 4000);
                        return;
                    }
                    const uid = btn.dataset.id;
                    const uname = btn.dataset.user;
                    if (!confirm(`Are you sure you want to unfollow @${uname}?`)) return;

                    STATE.isUnfollowing = true;
                    btn.disabled = true;
                    btn.textContent = 'Unfollowing...';
                    try {
                        await IgBridge.unfollowUser(uid);
                        STATE.lastUnfollowAt = Date.now();
                        noteWrite();
                        showToast(`Unfollowed @${uname} successfully`);
                        applyUnfollowResult(uid, uname);
                        STATE.selectedIds.delete(uid);
                        const notBackEl = document.getElementById('stat-not-following-back');
                        if (notBackEl) notBackEl.textContent = STATE.notFollowingBack.length.toLocaleString();
                        const pillNotEl = document.getElementById('pill-count-not');
                        if (pillNotEl) pillNotEl.textContent = STATE.notFollowingBack.length.toLocaleString();
                        updateBulkActionBar();
                        renderRelationshipList();
                    } catch (err) {
                        alert(`Unfollow failed: ${err.message || err}`);
                        btn.disabled = false;
                        btn.innerHTML = `${ICONS.UNFOLLOW} Unfollow`;
                    } finally {
                        STATE.isUnfollowing = false;
                    }
                    return;
                }
            });
        }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[ch]);
    }

    function csvCell(value) {
        let s = String(value ?? '');
        if (/^[\s\x00-\x1f]*[=+\-@]/.test(s)) s = "'" + s;
        return `"${s.replace(/"/g, '""')}"`;
    }

    function isProtectedUser(uid, username = '') {
        const id = String(uid);
        const name = String(username || '').toLowerCase();
        if (!name) return STATE.whitelist.has(id);
        if (STATE.whitelistByNameRef !== STATE.whitelist) { // rebuild once per whitelist instance, not per row
            STATE.whitelistByNameRef = STATE.whitelist;
            STATE.whitelistByName = new Map([...STATE.whitelist.values()]
                .filter(w => w.username)
                .map(w => [String(w.username).toLowerCase(), w]));
        }
        return STATE.whitelistByName.has(name) || STATE.whitelist.has(id);
    }

    function hasNoAvatar(user) {
        if (typeof IgRelationship !== 'undefined' && typeof IgRelationship.hasNoAvatar === 'function') {
            return IgRelationship.hasNoAvatar(user);
        }
        if (!user || !user.profile_pic_url) return true;
        if (user.has_anonymous_profile_picture === true) return true;
        // ponytail: patterns inlined at this single live site (config copy removed — identical values); hoist back to config when a second live site appears
        const patterns = [
            '44884218_345707102882519_2446069589734326272_n',
            '464760996_1254146839119862_3605321457742435801_n'
        ];
        return patterns.some(p => typeof user.profile_pic_url === 'string' && user.profile_pic_url.includes(p));
    }

    function extractShortcodesFromText(text) {
        const raw = String(text || '');
        const codes = new Set();
        const urlRx = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/gi;
        let match;
        while ((match = urlRx.exec(raw))) codes.add(match[1]);
        raw.split(/\r?\n/).forEach(line => {
            const clean = line.trim().replace(/^["']+|["']+$/g, '');
            if (/^[A-Za-z0-9_-]{5,}$/.test(clean)) codes.add(clean);
        });
        return [...codes];
    }

    function shortcodeFromArticle(article) {
        const links = [...article.querySelectorAll('a[href*="/p/"],a[href*="/reel/"],a[href*="/tv/"]')];
        for (const a of links) {
            const m = (a.href || a.getAttribute('href') || '').match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
            if (m) return m[1];
        }
        const m = location.href.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
        return m ? m[1] : null;
    }

    function safeFilename(value) {
        return String(value || 'instagram')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 150);
    }

    function extensionFromUrl(url, fallback) {
        try {
            const ext = new URL(url).pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
            if (ext && ['jpg','jpeg','png','webp','mp4','m4a','mp3','aac','webm'].includes(ext)) return ext;
        } catch (_) {}
        return fallback;
    }

    function gmDownload(url, name) {
        return new Promise((resolve, reject) => {
            GM_download({
                url,
                name,
                saveAs: false,
                timeout: 120000,
                ontimeout: () => reject(new Error('Download timed out')),
                onabort: () => reject(new Error('Download aborted')),
                onload: () => resolve(name),
                onerror: err => reject(err)
            });
        });
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        return filename;
    }

    /* ==========================================================================
       7. RELATIONSHIP SCANNER LOGIC
       ========================================================================== */

    async function runRelationshipScan() {
        if (STATE.isScanning || STATE.isUnfollowing || STATE.isScanningInactive) return;
        if (STATE.prefs?.scanSpeed === 'C'
            && !confirm('⚠️ Mode C pages at 1.5-3 s (fastest tier, still serial + periodic rests)\nStill higher detection risk than A/B — prefer off-peak hours\nProceed with the high-speed scan?')) return;
        if (STATE.prefs?.scanSpeed === 'B'
            && !confirm('⚠️ Mode B pages at 3-6 s. It is roughly 2x the request rate of Safe mode and no published figure supports it.\nUse it only when you know you need the speed.\nProceed with mode B?')) return;
        STATE.isScanning = true;
        STATE.stopScanFlag = false;
        STATE.scanController = new AbortController();
        STATE.scanStartTime = Date.now();
        clearTimeout(STATE.progressHideTimer);
        const el = id => document.getElementById(id);
        const btn = el('maxpland-btn-scan-relationships');
        const progress = el('maxpland-global-progress');
        const phase = el('maxpland-scan-phase');
        const notice = el('maxpland-scan-notice');
        const summary = el('maxpland-scan-status-summary');
        STATE.scanIncomplete = true;
        for (const key of ['followers','following','notFollowingBack','fans','mutual','lostFollowers','ghostFollowers','renamed']) STATE[key] = [];
        STATE.selectedIds.clear();
        updateBulkActionBar();
        for (const id of ['stat-not-following-back','stat-fans','stat-mutual','stat-lost','stat-ghost','pill-count-not','pill-count-fans','pill-count-mutual','pill-count-lost','pill-count-ghost','pill-count-renamed']) {
            if (el(id)) el(id).textContent = '-';
        }
        renderRelationshipList();
        const timer = setInterval(() => { el('maxpland-scan-stat-timer').textContent = `⏱️ ${formatTime(Math.floor((Date.now() - STATE.scanStartTime) / 1000))}`; }, 1000);
        try {
            btn.disabled = true;
            progress.style.display = 'block';
            STATE.scanPaused = false;
            const pauseBtn = document.getElementById('maxpland-btn-pause-scan');
            pauseBtn.style.display = '';
            pauseBtn.textContent = '⏸ Pause';
            phase.textContent = 'Verifying account...';
            notice.style.display = 'none';
            summary.textContent = '';
            el('maxpland-progress-fill').style.width = '0%';
            el('maxpland-scan-stat-count').textContent = 'Users: 0';
            el('maxpland-scan-stat-page').textContent = 'Pages: 0';
            el('maxpland-scan-stat-timer').textContent = '⏱️ 00:00';
            const currentUser = await IgBridge.resolveCurrentUser();
            IgBridge.assertAccount(currentUser.id);
            STATE.currentUser = currentUser;
            STATE.relationshipAccountId = currentUser.id;
            el('maxpland-account-badge').textContent = currentUser.username ? `@${currentUser.username}` : `UID: ${currentUser.id}`;
            const lists = {};
            const speedMode = ['B', 'C'].includes(STATE.prefs?.scanSpeed) ? STATE.prefs.scanSpeed : 'A';
            const startList = endpoint => {
                if (STATE.stopScanFlag) throw new DOMException('Scan aborted by user', 'AbortError');
                phase.textContent = endpoint === 'followers' ? 'Fetching Followers...' : 'Fetching Following...';
                return IgBridge.fetchAllRelationships(endpoint, currentUser.id,
                    endpoint === 'followers' ? APP_CONFIG.FOLLOWERS_PAGE_SAFETY_LIMIT : APP_CONFIG.FOLLOWING_PAGE_SAFETY_LIMIT,
                    (count, page, message) => {
                        el('maxpland-scan-stat-count').textContent = `${endpoint}: ${count.toLocaleString()}`;
                        el('maxpland-scan-stat-page').textContent = `Pages: ${page}`;
                        el('maxpland-progress-fill').style.width = `${Math.min(95, Math.min(45, page * 3) + (lists.followers ? 45 : 0) + (lists.following ? 45 : 0))}%`;
                        if (message) { notice.textContent = message; notice.style.display = 'block'; }
                    }, speedMode);
            };
            const finishList = (endpoint, result) => {
                if (STATE.stopScanFlag) throw new DOMException('Scan aborted by user', 'AbortError');
                if (!result.completed) throw result.lastError || new Error(`Incomplete fetch for ${endpoint}`);
                lists[endpoint] = result;
            };
            // Every speed mode fetches serially: concurrent double-streams doubled the
            // combined request rate — the signal automation detection watches for.
            // Mode speed now comes purely from PACE_PRESETS inside fetchAllRelationships.
            for (const endpoint of ['followers', 'following']) {
                finishList(endpoint, await startList(endpoint));
            }
            const { followers, following } = lists;
            const getUid = u => String(u?.id || u?.pk_id || u?.pk || '').trim();
            const getUname = u => String(u?.username || '').trim().toLowerCase();

            const followerIdSet = new Set();
            const followerUsernameSet = new Set();
            for (const u of followers) {
                const uid = getUid(u);
                const uname = getUname(u);
                if (uid) followerIdSet.add(uid);
                if (uname) followerUsernameSet.add(uname);
            }

            const followingIdSet = new Set();
            const followingUsernameSet = new Set();
            for (const u of following) {
                const uid = getUid(u);
                const uname = getUname(u);
                if (uid) followingIdSet.add(uid);
                if (uname) followingUsernameSet.add(uname);
            }

            const isFollower = u => {
                if (u?.friendship_status?.followed_by === true) return true;
                const uid = getUid(u);
                const uname = getUname(u);
                return (Boolean(uid) && followerIdSet.has(uid)) || (Boolean(uname) && followerUsernameSet.has(uname));
            };

            const isFollowing = u => {
                if (u?.friendship_status?.following === true) return true;
                const uid = getUid(u);
                const uname = getUname(u);
                return (Boolean(uid) && followingIdSet.has(uid)) || (Boolean(uname) && followingUsernameSet.has(uname));
            };

            const prev = await MaxPlandVault.getLatestSnapshot(currentUser.id);
            const whitelist = await MaxPlandVault.getWhitelist();
            IgBridge.assertAccount(currentUser.id);
            if (STATE.stopScanFlag) throw new DOMException('Scan aborted by user', 'AbortError');
            const idxMap = prev?.user_index ? new Map(Object.entries(prev.user_index)) : new Map();
            const prevUsernames = { ...(prev?.follower_usernames || {}), ...(prev?.usernames || {}) };
            const lostFollowers = (prev?.follower_ids || []).filter(id => !followerIdSet.has(String(id))).map(id => {
                const sid = String(id);
                const uname = prevUsernames[sid] || idxMap.get(sid) || `user_${sid}`;
                // Block detector: gone from followers AND from our following list -> blocked us
                // or deactivated. Still in following -> plain unfollow.
                const gone = !followingIdSet.has(sid) && !followingUsernameSet.has(String(uname).toLowerCase());
                return {
                    pk: sid, id: sid, username: uname, profile_pic_url: '',
                    full_name: gone ? 'Gone — blocked us or deactivated' : 'Unfollowed since the previous scan'
                };
            });
            // Rename detector: same follower ids whose username changed since the previous scan.
            const renamed = [];
            if (prev && typeof prevUsernames === 'object') {
                const currentById = new Map(followers.map(f => [String(f.id || f.pk_id || f.pk || ''), f]));
                for (const [sid, oldName] of Object.entries(prevUsernames)) {
                    if (!oldName) continue;
                    const now = currentById.get(sid);
                    const newName = String(now?.username || '');
                    if (now && newName && newName.toLowerCase() !== oldName.toLowerCase()) {
                        renamed.push({
                            pk: sid, id: sid, username: newName,
                            full_name: `Renamed from @${oldName}`,
                            profile_pic_url: now.profile_pic_url || '',
                            is_verified: Boolean(now.is_verified), is_private: Boolean(now.is_private),
                            has_anonymous_profile_picture: Boolean(now.has_anonymous_profile_picture)
                        });
                    }
                }
            }
            await MaxPlandVault.saveSnapshot(followers, following, currentUser.id, STATE.scanController.signal);
            IgBridge.assertAccount(currentUser.id);
            if (STATE.stopScanFlag) throw new DOMException('Scan aborted by user', 'AbortError');
            Object.assign(STATE, { followers, following, whitelist, lostFollowers, renamed, scanIncomplete: false,
                notFollowingBack: following.filter(u => !isFollower(u)),
                fans: followers.filter(u => !isFollowing(u)),
                mutual: following.filter(u => isFollower(u)),
                ghostFollowers: followers.filter(u => hasNoAvatar(u)) });
            for (const [stat, pill, key] of [['not-following-back','not','notFollowingBack'],['fans','fans','fans'],['mutual','mutual','mutual'],['lost','lost','lostFollowers'],['ghost','ghost','ghostFollowers'],['renamed','renamed','renamed']]) {
                if (el(`stat-${stat}`)) el(`stat-${stat}`).textContent = STATE[key].length.toLocaleString();
                if (el(`pill-count-${pill}`)) el(`pill-count-${pill}`).textContent = STATE[key].length.toLocaleString();
            }
            el('pill-count-white').textContent = whitelist.size.toLocaleString();
            el('maxpland-progress-fill').style.width = '100%';
            phase.textContent = 'Scan completed';
            notice.style.display = 'none';
            const fs = lists.followers.fetchStats || { requestMs: 0, waitMs: 0 };
            const fw = lists.following.fetchStats || { requestMs: 0, waitMs: 0 };
            STATE.scanStatus = { requestMs: fs.requestMs + fw.requestMs, waitMs: fs.waitMs + fw.waitMs, wallMs: Date.now() - STATE.scanStartTime };
            const fmtMs = ms => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; };
            summary.textContent = `Followers ${followers.length.toLocaleString()} · Following ${following.length.toLocaleString()} · Fetch ${fmtMs(STATE.scanStatus.requestMs)} · Pacing ${fmtMs(STATE.scanStatus.waitMs)} · Total ${fmtMs(STATE.scanStatus.wallMs)}`;
            showToast('Scan completed successfully');
        } catch (err) {
            if (err?.code === 'RATE_LIMIT') showToast(`⏳ ${err.message} — retry after the cooldown ends.`, 5000);
            phase.textContent = STATE.stopScanFlag || err.name === 'AbortError' ? 'Scan stopped' : 'Scan failed';
            notice.textContent = `⚠️ ${err.message} · Relationships not updated`;
            notice.style.display = 'block';
            summary.textContent = phase.textContent;
        } finally {
            clearInterval(timer);
            btn.disabled = false;
            STATE.isScanning = false;
            STATE.scanController = null;
            STATE.scanPaused = false;
            const pauseBtnEnd = document.getElementById('maxpland-btn-pause-scan');
            pauseBtnEnd.style.display = 'none';
            pauseBtnEnd.textContent = '⏸ Pause';
            renderRelationshipList();
            // Keep failed scan diagnostics visible until the next action.
            if (!STATE.scanIncomplete) STATE.progressHideTimer = setTimeout(() => { progress.style.display = 'none'; }, 2500);
        }
    }

    /* ==========================================================================
       8. FILTER & RENDER ENGINE
       ========================================================================== */

    // ponytail: getFilteredUsers runs on every keystroke and from 17 call sites;
    // rebuilding a Set of every followed id each time dominated the filter cost.
    // Rebuild only when the array identity or length actually changes.
    let followedIdIndex = new Set(), followedIdSource = null, followedIdCount = -1;
    function getFollowedIdIndex() {
        if (followedIdSource !== STATE.following || followedIdCount !== STATE.following.length) {
            followedIdSource = STATE.following;
            followedIdCount = STATE.following.length;
            followedIdIndex = new Set(STATE.following.map(x => String(x.id || x.pk_id || x.pk || '').trim()));
        }
        return followedIdIndex;
    }

    function getFilteredUsers() {
        let pool = [];
        if (STATE.relationshipFilter === 'not_following_back') pool = STATE.notFollowingBack;
        else if (STATE.relationshipFilter === 'fans') pool = STATE.fans;
        else if (STATE.relationshipFilter === 'mutual') pool = STATE.mutual;
        else if (STATE.relationshipFilter === 'lost') pool = STATE.lostFollowers;
        else if (STATE.relationshipFilter === 'ghost') pool = STATE.ghostFollowers;
        else if (STATE.relationshipFilter === 'renamed') pool = STATE.renamed || [];
        else if (STATE.relationshipFilter === 'inactive') pool = STATE.inactiveFollowing;
        else if (STATE.relationshipFilter === 'whitelist') pool = Array.from(STATE.whitelist.values());

        const followedIds = getFollowedIdIndex();
        return pool.filter(u => {
            const uid = String(u.id || u.pk_id || u.pk || '');
            const uname = String(u.username || '').toLowerCase();
            const isFollowedByUs = uid !== '' && followedIds.has(uid);
            if (STATE.subFilters.onlyFollowing && !isFollowedByUs) return false;
            if (STATE.subFilters.onlyNotFollowed && isFollowedByUs) return false;
            const isWhitelisted = isProtectedUser(uid, uname);
            if (STATE.subFilters.excludeWhitelist && isWhitelisted) return false;
            if (STATE.subFilters.excludeVerified && u.is_verified) return false;
            if (STATE.subFilters.excludePrivate && u.is_private) return false;
            if (STATE.subFilters.excludeNoAvatar && hasNoAvatar(u)) return false;
            if (STATE.searchQuery) {
                const q = STATE.searchQuery;
                const matchUser = u.username && u.username.toLowerCase().includes(q);
                const matchName = u.full_name && u.full_name.toLowerCase().includes(q);
                if (!matchUser && !matchName) return false;
            }
            return true;
        });
    }

    function setFollowStateChip(which) {
        const next = !STATE.subFilters[which];
        STATE.subFilters.onlyFollowing = which === 'onlyFollowing' && next;
        STATE.subFilters.onlyNotFollowed = which === 'onlyNotFollowed' && next;
        document.getElementById('toggle-filter-following').classList.toggle('active', STATE.subFilters.onlyFollowing);
        document.getElementById('toggle-filter-notfollowing').classList.toggle('active', STATE.subFilters.onlyNotFollowed);
        renderRelationshipList();
    }

    function renderRelationshipList() {
        const listEl = document.getElementById('maxpland-relationship-list');
        const currentPool = getFilteredUsers();

        let tagClass = 'not_following';
        let tagText = 'Not Following Back';
        if (STATE.relationshipFilter === 'fans') { tagClass = 'fan'; tagText = 'Fan'; }
        else if (STATE.relationshipFilter === 'mutual') { tagClass = 'mutual'; tagText = 'Mutual'; }
        else if (STATE.relationshipFilter === 'lost') { tagClass = 'lost'; tagText = 'Lost'; }
        else if (STATE.relationshipFilter === 'ghost') { tagClass = 'ghost'; tagText = '👻 Ghost'; }
        else if (STATE.relationshipFilter === 'inactive') { tagClass = 'ghost'; tagText = '⏱️ Inactive'; }
        else if (STATE.relationshipFilter === 'whitelist') { tagClass = 'mutual'; tagText = '⭐ Whitelist'; }

        if (STATE.scanIncomplete && STATE.followers.length === 0 && (STATE.relationshipFilter === 'not_following_back' || STATE.relationshipFilter === 'mutual' || STATE.relationshipFilter === 'fans')) {
            listEl.innerHTML = `
                <div style="padding: 48px 24px; text-align: center; color: var(--mp-rose); line-height: 1.6;">
                    <div style="font-size: 15px; font-weight: 600; margin-bottom: 8px;">${STATE.isScanning ? 'Scanning relationships...' : 'No complete scan results yet'}</div>
                    <div style="color: var(--mp-text-secondary); font-size: 13px; max-width: 500px; margin: 0 auto;">
                        ${STATE.isScanning ? 'Please wait for followers and following to finish fetching.' : 'Check scan status above or click Scan Relationships to start.'}
                    </div>
                </div>
            `;
            return;
        }

        if (currentPool.length === 0) {
            listEl.innerHTML = `<div style="padding: 48px; text-align: center; color: var(--mp-text-muted);">No accounts match current filter</div>`;
            return;
        }

        const visibleUsers = currentPool.slice(0, STATE.relationshipLimit || 100);
        let html = '';

        visibleUsers.forEach(user => {
            const uid = String(user.id || user.pk_id || user.pk || '');
            const uname = String(user.username || '').toLowerCase();
            const isWhitelisted = isProtectedUser(uid, uname);
            const isChecked = STATE.selectedIds.has(uid);
            const avatar = user.profile_pic_url || '';
            const initial = String(user.username || '?').slice(0, 1).toUpperCase();
            let displayTag = tagText;
            if (STATE.relationshipFilter === 'inactive' && user.dormant_days !== undefined) {
                displayTag = typeof user.dormant_days === 'number' ? `⏱️ Inactive ${user.dormant_days}d` : `⏱️ ${user.dormant_days}`;
            }

            html += `
                <div class="maxpland-user-row" data-id="${escapeHtml(uid)}">
                    <div class="maxpland-user-left">
                        <input type="checkbox" class="maxpland-checkbox user-select-checkbox" data-id="${escapeHtml(uid)}" aria-label="Select @${escapeHtml(user.username || uid)}" ${isChecked ? 'checked' : ''} ${isWhitelisted ? 'disabled title="In Whitelist (protected from unfollow)"' : ''}>
                        ${avatar ? `<img class="maxpland-avatar" src="${escapeHtml(avatar)}" loading="lazy" alt="">` : `<span class="maxpland-avatar">${escapeHtml(initial)}</span>`}
                        <div class="maxpland-user-names">
                            <div class="maxpland-username-wrap">
                                <a href="https://www.instagram.com/${encodeURIComponent(user.username || '')}/" target="_blank" rel="noopener noreferrer" class="maxpland-username">${escapeHtml(user.username || 'unknown')}</a>
                                ${user.is_verified ? `<span title="Verified">${ICONS.VERIFIED}</span>` : ''}
                                ${user.is_private ? `<span title="Private Account" style="color:var(--mp-text-muted);display:flex;align-items:center;">${ICONS.LOCK}</span>` : ''}
                                <span class="maxpland-status-tag ${tagClass}">${escapeHtml(displayTag)}</span>
                            </div>
                            <span class="maxpland-fullname">${escapeHtml(user.full_name || '')}</span>
                        </div>
                    </div>
                    <div class="maxpland-user-actions">
                        <a href="https://www.instagram.com/${encodeURIComponent(user.username || '')}/" target="_blank" rel="noopener noreferrer" class="maxpland-icon-action" title="Open Instagram Profile">
                            ${ICONS.EXTERNAL}
                        </a>
                        <button type="button" class="maxpland-icon-action maxpland-star-btn" data-id="${escapeHtml(uid)}" title="${isWhitelisted ? 'Remove from Whitelist' : 'Add to Whitelist'}">
                            ${isWhitelisted ? ICONS.STAR_FILLED : ICONS.STAR}
                        </button>
                        ${STATE.relationshipFilter === 'not_following_back' || STATE.relationshipFilter === 'mutual' || STATE.relationshipFilter === 'inactive' ? `
                            <button type="button" class="maxpland-row-unfollow-btn" data-id="${escapeHtml(uid)}" data-user="${escapeHtml(user.username || '')}" ${isWhitelisted ? 'disabled title="Whitelist"' : ''}>
                                ${ICONS.UNFOLLOW} Unfollow
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        listEl.innerHTML = html;

        if (visibleUsers.length < currentPool.length) {
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'maxpland-btn-secondary';
            more.style.margin = '10px auto';
            more.style.display = 'block';
            more.textContent = `Show more (${visibleUsers.length.toLocaleString()} / ${currentPool.length.toLocaleString()})`;
            more.onclick = () => { STATE.relationshipLimit += 100; renderRelationshipList(); };
            listEl.append(more);
        }
    }

    function applyUnfollowResult(uid, username = '') {
        const idOf = u => String(u?.id || u?.pk_id || u?.pk || '');
        const nameOf = u => String(u?.username || '').toLowerCase();
        const targetName = String(username || '').toLowerCase();
        const isTarget = u => (uid && idOf(u) === uid) || (targetName && nameOf(u) === targetName);
        STATE.following = STATE.following.filter(u => !isTarget(u));
        STATE.notFollowingBack = STATE.notFollowingBack.filter(u => !isTarget(u));
        STATE.mutual = STATE.mutual.filter(u => !isTarget(u));
        const fan = STATE.followers.find(isTarget);
        if (fan && !STATE.fans.some(isTarget)) STATE.fans.push(fan);
        for (const key of ['fans', 'mutual']) {
            const stat = document.getElementById('stat-' + key), pill = document.getElementById('pill-count-' + key);
            if (stat) stat.textContent = STATE[key].length.toLocaleString();
            if (pill) pill.textContent = STATE[key].length.toLocaleString();
        }
    }

    function updateBulkActionBar() {
        const bar = document.getElementById('maxpland-bulk-bar');
        const countLabel = document.getElementById('maxpland-bulk-count-label');
        const count = STATE.selectedIds.size;

        if (count > 0) {
            bar.style.display = 'flex';
            countLabel.textContent = `${count.toLocaleString()} selected`;
        } else {
            bar.style.display = 'none';
        }
    }

    function selectAllVisible() {
        const visiblePool = getFilteredUsers().slice(0, STATE.relationshipLimit || 100);
        visiblePool.forEach(u => {
            const uid = String(u.id || u.pk_id || u.pk || '');
            const uname = String(u.username || '').toLowerCase();
            const isWhitelisted = isProtectedUser(uid, uname);
            if (!isWhitelisted) {
                STATE.selectedIds.add(uid);
            }
        });
        updateBulkActionBar();
        renderRelationshipList();
    }

    /* ==========================================================================
       9. UNFOLLOW ENGINE (Batch with Safe Random Pacing)
       ========================================================================== */

    async function runBatchUnfollow() {
        if (STATE.isUnfollowing || STATE.isScanning || STATE.isScanningInactive || STATE.scanIncomplete) return;
        const count = STATE.selectedIds.size;
        if (count === 0) {
            alert('Please select at least one account to unfollow.');
            return;
        }

        const estSeconds = Math.round(count * ((APP_CONFIG.UNFOLLOW_DELAY_MIN + APP_CONFIG.UNFOLLOW_DELAY_MAX) / 2000));
        const proceed = confirm(`⚠️ Safety warning:\nYou are about to unfollow ${count} accounts\nEstimated duration: ${Math.ceil(estSeconds / 60)} minutes (random delay ${APP_CONFIG.UNFOLLOW_DELAY_MIN / 1000}-${APP_CONFIG.UNFOLLOW_DELAY_MAX / 1000} seconds per account)\nToday so far: ${formatBudget()}\n\nStart now?`);
        if (!proceed) return;

        STATE.isUnfollowing = true;
        STATE.stopUnfollowFlag = false;
        clearTimeout(STATE.progressHideTimer);

        const progressCont = document.getElementById('maxpland-global-progress');
        const progressFill = document.getElementById('maxpland-progress-fill');
        const phaseEl = document.getElementById('maxpland-scan-phase');
        const statCount = document.getElementById('maxpland-scan-stat-count');
        const statPage = document.getElementById('maxpland-scan-stat-page');
        const noticeEl = document.getElementById('maxpland-scan-notice');

        progressCont.style.display = 'block';
        phaseEl.textContent = 'Preparing safe unfollow batch...';
        noticeEl.style.display = 'none';

        const idsToUnfollow = Array.from(STATE.selectedIds);
        let successCount = 0;
        let failCount = 0;

        try {
            for (let i = 0; i < idsToUnfollow.length; i++) {
                if (STATE.stopUnfollowFlag) {
                    phaseEl.textContent = 'Unfollow batch stopped by user';
                    break;
                }

                const uid = idsToUnfollow[i];
                const userObj = STATE.notFollowingBack.find(u => String(u.id || u.pk_id || u.pk || '') === uid)
                    || STATE.following.find(u => String(u.id || u.pk_id || u.pk || '') === uid);
                if (isProtectedUser(uid, userObj?.username)) { STATE.selectedIds.delete(uid); continue; }
                const uname = userObj ? `@${userObj.username}` : `UID ${uid}`;

                phaseEl.textContent = `Unfollowing [${i + 1}/${idsToUnfollow.length}]: ${uname}`;
                statCount.textContent = `Success: ${successCount} | Failed: ${failCount}`;
                statPage.textContent = `Remaining: ${idsToUnfollow.length - i}`;
                progressFill.style.width = `${Math.round(((i + 1) / idsToUnfollow.length) * 100)}%`;

                try {
                    await IgBridge.unfollowUser(uid);
                    successCount++;
                    STATE.lastUnfollowAt = Date.now();
                    noteWrite();
                    STATE.selectedIds.delete(uid);
                    applyUnfollowResult(uid, userObj?.username);
                } catch (err) {
                    console.error('[Unfollow Error]', uid, err);
                    failCount++;
                    noticeEl.textContent = err.message || 'Unfollow failed';
                    noticeEl.style.display = 'block';
                    STATE.stopUnfollowFlag = true;
                    break;
                }

                if (i < idsToUnfollow.length - 1 && !STATE.stopUnfollowFlag) {
                    const delay = Math.floor(Math.random() * (APP_CONFIG.UNFOLLOW_DELAY_MAX - APP_CONFIG.UNFOLLOW_DELAY_MIN + 1)) + APP_CONFIG.UNFOLLOW_DELAY_MIN;
                    for (let s = Math.ceil(delay / 1000); s > 0; s--) {
                        if (STATE.stopUnfollowFlag) break;
                        phaseEl.textContent = `Safety delay... ${s}s (${uname} done)`;
                        await sleep(1000);
                    }
                }
            }

            document.getElementById('stat-not-following-back').textContent = STATE.notFollowingBack.length.toLocaleString();
            document.getElementById('pill-count-not').textContent = STATE.notFollowingBack.length.toLocaleString();
            updateBulkActionBar();
            renderRelationshipList();
            showToast(`Unfollow completed: ${successCount} succeeded, ${failCount} failed`);
            const budgetLabel = document.getElementById('maxpland-budget-label');
            if (budgetLabel) budgetLabel.textContent = formatBudget();
        } finally {
            STATE.isUnfollowing = false;
            if (!STATE.stopUnfollowFlag) STATE.progressHideTimer = setTimeout(() => { progressCont.style.display = 'none'; }, 2500);
        }
    }

    /* ==========================================================================
       10. EXPORT & BACKUP UTILITIES
       ========================================================================== */

    async function copyVisibleUsernames() {
        const pool = getFilteredUsers();
        if (!pool.length) {
            alert('No usernames found under current filter to copy.');
            return;
        }
        const text = pool.map(u => u.username || '').filter(Boolean).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            showToast(`Copied ${pool.length.toLocaleString()} usernames to clipboard`);
        } catch (_) {
            alert('Failed to copy to clipboard. Please retry.');
        }
    }

    function exportRelationshipCSV() {
        const pool = getFilteredUsers();
        if (!pool.length) {
            alert('No data in this category to export.');
            return;
        }
        const rows = [['User ID', 'Username', 'Full Name', 'Is Verified', 'Is Private']];
        pool.forEach(u => rows.push([
            u.pk || u.pk_id || u.id || '',
            u.username || '',
            u.full_name || '',
            u.is_verified ? 'Yes' : 'No',
            u.is_private ? 'Yes' : 'No'
        ]));
        const csv = '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, `IG_MaxPland_${STATE.relationshipFilter}_${new Date().toISOString().slice(0,10)}.csv`);
    }

    function exportRelationshipJSON() {
        const pool = getFilteredUsers();
        if (!pool.length) {
            alert('No data in this category to export.');
            return;
        }
        const data = JSON.stringify(pool, null, 2);
        const blob = new Blob([data], { type: 'application/json;charset=utf-8;' });
        downloadBlob(blob, `IG_MaxPland_${STATE.relationshipFilter}_${new Date().toISOString().slice(0,10)}.json`);
    }

    function exportWhitelistBackup() {
        const whitelistArr = Array.from(STATE.whitelist.values());
        if (!whitelistArr.length) {
            alert('No starred accounts in whitelist to export.');
            return;
        }
        const json = JSON.stringify(whitelistArr, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
        downloadBlob(blob, `IG_MaxPland_Whitelist_Backup_${new Date().toISOString().slice(0,10)}.json`);
        showToast('Starred whitelist exported successfully');
    }

    async function handleWhitelistRestoreFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!Array.isArray(data)) throw new Error('Invalid backup file (Must be JSON array)');
            const count = await MaxPlandVault.importWhitelist(data);
            STATE.whitelist = await MaxPlandVault.getWhitelist();
            document.getElementById('pill-count-white').textContent = STATE.whitelist.size.toLocaleString();
            showToast(`Restored ${count} accounts to whitelist`);
            renderRelationshipList();
        } catch (err) {
            alert(`Import failed: ${err.message || err}`);
        } finally {
            e.target.value = '';
        }
    }

    /* ==========================================================================
       11. MEDIA DOWNLOADER ENGINE
       ========================================================================== */

    async function downloadResolvedMedia(resolved, { allCarousel = false, skipExisting = false } = {}) {
        const accountId = IgBridge.getCookie('ds_user_id');
        IgBridge.assertAccount(accountId);
        const completed = [];
        const nodesToDownload = allCarousel ? resolved.nodes : [resolved.nodes[0]];

        for (const node of nodesToDownload) {
            IgBridge.assertAccount(accountId);
            const key = `${resolved.shortcode}:${node.id || node.index}:media`;
            if (skipExisting && await MaxPlandVault.hasMedia(key)) {
                completed.push({ key, status: 'skipped' });
                continue;
            }

            IgBridge.assertAccount(accountId);
            const base = safeFilename(`${resolved.username || 'instagram'}_${resolved.shortcode}_${node.index + 1}`);
            const files = [];

            if (node.mediaType === 'image') {
                if (!node.imageUrl) throw new Error(`No image URL for ${resolved.shortcode}`);
                const ext = extensionFromUrl(node.imageUrl, 'jpg');
                files.push(await gmDownload(node.imageUrl, `${base}.${ext}`));
            } else if (node.progressiveVideoUrl) {
                const ext = extensionFromUrl(node.progressiveVideoUrl, 'mp4');
                files.push(await gmDownload(node.progressiveVideoUrl, `${base}.${ext}`));
            } else if (node.imageUrl) {
                // Video stream unavailable: the thumbnail is stored under its own type
                // so the next run still retries the real video instead of skipping it.
                const thumbType = node.mediaType === 'video' ? 'video_thumb' : node.mediaType;
                const ext = extensionFromUrl(node.imageUrl, node.mediaType === 'video' ? 'jpg' : 'jpg');
                files.push(await gmDownload(node.imageUrl, `${base}.${ext}`));
                node.mediaType = thumbType;
            } else {
                throw new Error(`No downloadable stream for ${resolved.shortcode}`);
            }

            IgBridge.assertAccount(accountId);
            await MaxPlandVault.markMediaDownloaded({
                key,
                shortcode: resolved.shortcode,
                username: resolved.username || '',
                item_index: node.index,
                media_type: node.mediaType,
                files
            });
            completed.push({ key, status: 'done', files });
        }
        return completed;
    }

    async function downloadByShortcode(shortcode, options = {}) {
        const resolved = await IgBridge.resolveMedia(shortcode);
        return downloadResolvedMedia(resolved, options);
    }

    /* ==========================================================================
       9. HEALTH DASHBOARD, INACTIVE RADAR & SETTINGS SYNC
       ========================================================================== */

    function syncFeaturesTab() {
        const el = id => document.getElementById(id);
        const p = STATE.prefs || {};
        if (el('pref-switch-stealth-story')) el('pref-switch-stealth-story').checked = Boolean(p.stealthStory);
        if (el('pref-switch-clean-feed')) el('pref-switch-clean-feed').checked = Boolean(p.cleanFeed);
        if (el('pref-switch-feed-download')) el('pref-switch-feed-download').checked = Boolean(p.quickDownloadFeed);
        if (el('pref-switch-story-toolbar')) el('pref-switch-story-toolbar').checked = Boolean(p.quickDownloadStory);
    }

    function syncSettingsTab() {
        const el = id => document.getElementById(id);
        const p = STATE.prefs || {};
        if (el('pref-setting-inactive-threshold')) el('pref-setting-inactive-threshold').value = String(p.inactiveThresholdDays || 180);
        if (el('pref-setting-scan-speed')) el('pref-setting-scan-speed').value = ['B', 'C'].includes(p.scanSpeed) ? p.scanSpeed : 'A';
    }

    async function runInactiveScan() {
        if (STATE.isScanning || STATE.isUnfollowing || STATE.isScanningInactive) return;
        if (STATE.scanIncomplete || !STATE.following.length) {
            alert('Complete a relationship scan before checking activity.');
            return;
        }
        const accountId = STATE.relationshipAccountId;
        const thresholdSeconds = Number(STATE.prefs?.inactiveThresholdDays || 180) * 86400;
        const nowSec = Math.floor(Date.now() / 1000);
        const pool = [...STATE.following];
        STATE.isScanningInactive = true;
        STATE.stopInactiveScanFlag = false;
        STATE.stopScanFlag = false;
        STATE.inactiveController = new AbortController();
        const signal = STATE.inactiveController.signal;
        STATE.inactiveFollowing = [];
        clearTimeout(STATE.progressHideTimer);
        const el = id => document.getElementById(id);
        const progress = el('maxpland-global-progress');
        const phase = el('maxpland-scan-phase');
        const btn = el('maxpland-btn-scan-inactive');
        btn.disabled = true;
        progress.style.display = 'block';
        phase.textContent = '[Inactive Radar] Starting scan...';
        el('maxpland-scan-notice').style.display = 'none';
        el('maxpland-scan-stat-count').textContent = 'Inactive found: 0';
        el('maxpland-scan-stat-page').textContent = `Checked: 0/${pool.length}`;
        el('maxpland-scan-stat-timer').textContent = '⏱️ 00:00';
        el('maxpland-progress-fill').style.width = '0%';
        const started = Date.now();
        const timer = setInterval(() => {
            el('maxpland-scan-stat-timer').textContent = `⏱️ ${formatTime(Math.floor((Date.now() - started) / 1000))}`;
        }, 1000);
        let checked = 0, failed = 0, newFetches = 0;
        try {
            IgBridge.assertAccount(accountId);
            for (const user of pool) {
                if (signal.aborted) break;
                IgBridge.assertAccount(accountId);
                const uid = String(user.id || user.pk_id || user.pk || '');
                const cached = await MaxPlandVault.getUserActivity(uid);
                if (signal.aborted) break;
                IgBridge.assertAccount(accountId);
                const cacheValid = cached?.checked_at && Date.now() - cached.checked_at < 14 * 86400 * 1000;
                // ponytail: preserve the 20-request ceiling; cached rows need no new request.
                if (!cacheValid && newFetches >= 20) break;
                phase.textContent = `[Inactive Radar] Checking @${user.username || uid} (${checked + 1}/${pool.length})...`;
                let lastTakenAt = cached?.last_post_taken_at;
                let hasPosts = cached?.has_posts !== false;
                let known = Boolean(cacheValid);
                if (!cacheValid) {
                    newFetches++;
                    try {
                        const info = await IgBridge.fetchUserLastPost(uid, { signal });
                        if (signal.aborted) break;
                        IgBridge.assertAccount(accountId);
                        lastTakenAt = info.last_taken_at;
                        hasPosts = info.has_posts;
                        known = true;
                        await MaxPlandVault.saveUserActivity({ id: uid, username: user.username || '',
                            last_post_taken_at: lastTakenAt, has_posts: hasPosts, checked_at: Date.now() });
                    } catch (err) {
                        if (signal.aborted || err.name === 'AbortError' || IgBridge.isSessionError(err)) throw err;
                        failed++;
                        known = false;
                    }
                }
                if (signal.aborted) break;
                IgBridge.assertAccount(accountId);
                checked++;
                if (known && (!hasPosts || (lastTakenAt && nowSec - lastTakenAt > thresholdSeconds))) {
                    STATE.inactiveFollowing.push({ ...user,
                        dormant_days: lastTakenAt ? Math.floor((nowSec - lastTakenAt) / 86400) : 'No recent posts found' });
                }
                el('maxpland-progress-fill').style.width = `${Math.round(checked / pool.length * 100)}%`;
                el('maxpland-scan-stat-page').textContent = `Checked: ${checked}/${pool.length}`;
                el('maxpland-scan-stat-count').textContent = `Inactive found: ${STATE.inactiveFollowing.length} · Unavailable: ${failed}`;
                if (!cacheValid && checked < pool.length && newFetches < 20) {
                    const jitter = 3500 + Math.floor(Math.random() * 2500);
                    for (let ms = 0; ms < jitter && !signal.aborted; ms += 250) await sleep(250);
                }
            }
            const state = signal.aborted ? 'Stopped by request' : checked < pool.length ? 'Paused — scan again to continue' : failed ? 'Finished with unavailable results' : 'Scan complete';
            phase.textContent = `[Inactive Radar] ${state} (${checked}/${pool.length}) · Found ${STATE.inactiveFollowing.length} · Unavailable ${failed}`;
            showToast(phase.textContent, 5000);
            if (!signal.aborted && checked === pool.length && !failed) {
                STATE.progressHideTimer = setTimeout(() => { progress.style.display = 'none'; }, 3000);
            }
        } catch (err) {
            phase.textContent = signal.aborted || err.name === 'AbortError'
                ? `[Inactive Radar] Stopped by request (${checked}/${pool.length})`
                : `[Inactive Radar] Stopped: ${err.message} (${checked}/${pool.length})`;
            showToast(phase.textContent, 4000);
        } finally {
            clearInterval(timer);
            btn.disabled = false;
            STATE.isScanningInactive = false;
            STATE.inactiveController = null;
            el('pill-count-inactive').textContent = STATE.inactiveFollowing.length;
            document.querySelector('.maxpland-pill-btn[data-filter="inactive"]')?.click();
        }
    }

    async function renderHealthDashboard() {
        const el = id => document.getElementById(id);
        const followerCount = STATE.followers.length;
        const followingCount = STATE.following.length;

        // 1. Ratio
        const ratio = followingCount > 0 ? (followerCount / followingCount) : 0;
        const ratioVal = el('health-ratio-val');
        const ratioBadge = el('health-ratio-badge');
        if (ratioVal && ratioBadge) {
            if (followerCount === 0 && followingCount === 0) {
                ratioVal.textContent = '-';
                ratioBadge.textContent = 'Please scan relationships first';
                ratioBadge.style.background = 'var(--mp-bg-hover)';
                ratioBadge.style.color = 'var(--mp-text-secondary)';
            } else {
                ratioVal.textContent = `${ratio.toFixed(2)}x`;
                if (ratio >= 1.5) {
                    ratioBadge.textContent = '⭐ Creator / Influencer';
                    ratioBadge.style.background = 'var(--mp-emerald-bg)';
                    ratioBadge.style.color = 'var(--mp-emerald)';
                } else if (ratio >= 0.8) {
                    ratioBadge.textContent = '⚖️ Healthy Balance';
                    ratioBadge.style.background = 'var(--mp-cyan-bg)';
                    ratioBadge.style.color = 'var(--mp-cyan)';
                } else {
                    ratioBadge.textContent = '🔍 Consumer heavy';
                    ratioBadge.style.background = 'var(--mp-amber-bg)';
                    ratioBadge.style.color = 'var(--mp-amber)';
                }
            }
        }

        // 2. Mutual Rate
        const mutualVal = el('health-mutual-val');
        const mutualBadge = el('health-mutual-badge');
        if (mutualVal && mutualBadge) {
            if (followingCount === 0) {
                mutualVal.textContent = '-';
                mutualBadge.textContent = 'No data';
            } else {
                const rate = Math.round((STATE.mutual.length / followingCount) * 100);
                mutualVal.textContent = `${rate}%`;
                mutualBadge.textContent = `${STATE.mutual.length} of ${followingCount} accounts`;
            }
        }

        // 3. Not Back Outbound
        const notbackVal = el('health-notback-val');
        const notbackBadge = el('health-notback-badge');
        if (notbackVal && notbackBadge) {
            if (followingCount === 0) {
                notbackVal.textContent = '-';
                notbackBadge.textContent = 'No data';
            } else {
                const rate = Math.round((STATE.notFollowingBack.length / followingCount) * 100);
                notbackVal.textContent = `${rate}%`;
                notbackBadge.textContent = `${STATE.notFollowingBack.length} not following back`;
            }
        }

        // 4. Ghost & Inactive Impact
        const ghostVal = el('health-ghost-val');
        const ghostBadge = el('health-ghost-badge');
        if (ghostVal && ghostBadge) {
            const totalGhost = STATE.ghostFollowers.length + STATE.inactiveFollowing.length;
            if (followerCount === 0 && followingCount === 0) {
                ghostVal.textContent = '-';
                ghostBadge.textContent = 'No data';
            } else {
                const rate = Math.round((totalGhost / (followerCount || 1)) * 100);
                ghostVal.textContent = `${totalGhost} accounts`;
                ghostBadge.textContent = `Ghost: ${STATE.ghostFollowers.length} / Inactive: ${STATE.inactiveFollowing.length}`;
            }
        }

        // 5. Historical Snapshots & Pure SVG Sparkline
        const chartBox = el('health-chart-container');
        const deltaLabel = el('health-drift-delta');
        try {
            const accountId = STATE.relationshipAccountId || STATE.currentUser?.id;
            const snapshots = await MaxPlandVault.getAllSnapshots(accountId, 8);
            if (snapshots.length >= 2) {
                const sorted = [...snapshots].reverse();
                const counts = sorted.map(s => s.follower_count || 0);
                const min = Math.min(...counts);
                const max = Math.max(...counts);
                const diff = counts[counts.length - 1] - counts[0];

                if (deltaLabel) {
                    deltaLabel.textContent = `${diff >= 0 ? '+' : ''}${diff} followers`;
                    deltaLabel.style.color = diff >= 0 ? 'var(--mp-emerald)' : 'var(--mp-rose)';
                }

                const w = 700, h = 110;
                const pad = 24;
                const range = (max - min) || 1;
                const points = counts.map((c, i) => {
                    const x = pad + (i / (counts.length - 1)) * (w - pad * 2);
                    const y = h - pad - ((c - min) / range) * (h - pad * 2);
                    return { x, y, val: c, date: new Date(sorted[i].timestamp).toLocaleDateString('en-GB') };
                });

                const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                const dots = points.map(p => `
                    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#38bdf8" stroke="#0b0d10" stroke-width="2">
                        <title>${p.date}: ${p.val} followers</title>
                    </circle>
                    <text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" font-size="10" fill="#94a3b8" text-anchor="middle">${p.val}</text>
                `).join('');

                chartBox.innerHTML = `
                    <svg viewBox="0 0 ${w} ${h}" class="maxpland-sparkline">
                        <defs>
                            <linearGradient id="mp-chart-grad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.3"/>
                                <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0"/>
                            </linearGradient>
                        </defs>
                        <polyline fill="none" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />
                        ${dots}
                    </svg>
                `;
            } else if (snapshots.length === 1) {
                if (deltaLabel) deltaLabel.textContent = '1 snapshot recorded';
                chartBox.innerHTML = `<div style="padding:20px;text-align:center;color:var(--mp-text-muted);">First snapshot recorded (${snapshots[0].follower_count} followers). Run another scan to view growth comparison curve.</div>`;
            } else {
                if (deltaLabel) deltaLabel.textContent = '';
                chartBox.innerHTML = `<div style="padding:20px;text-align:center;color:var(--mp-text-muted);">No snapshot history. Run a relationship scan to begin tracking.</div>`;
            }
        } catch (_) {}

        // 6. Advice Box
        const advice = el('health-advice-text');
        if (advice) {
            if (STATE.notFollowingBack.length > 50) {
                advice.textContent = `You have ${STATE.notFollowingBack.length} accounts not following you back. Review in Relationships tab and safely unfollow non-whitelisted accounts to restore balance.`;
            } else if (ratio >= 1.0) {
                advice.textContent = `Your account structure is healthy with a strong follower ratio (${ratio.toFixed(2)}x) and solid mutual engagement.`;
            } else {
                advice.textContent = `You follow more accounts than follow you back. Use Inactive Radar to detect and prune accounts that haven't posted in over 6 months.`;
            }
        }
    }

    async function renderMediaVault() {
        const list = document.getElementById('maxpland-vault-list');
        if (!list) return;
        let rows;
        try { rows = await MaxPlandVault.getMediaVault(100); }
        catch (err) { list.textContent = `History unavailable: ${err.message || err}`; return; }
        if (!rows.length) {
            list.innerHTML = '<div style="padding:48px;text-align:center;color:var(--mp-text-muted);">No download history yet</div>';
            return;
        }
        list.innerHTML = rows.map(r => `
            <div class="maxpland-user-row">
                <div class="maxpland-user-names">
                    <span class="maxpland-username">${escapeHtml(r.username || 'instagram')} · ${escapeHtml(r.shortcode || '')}</span>
                    <span class="maxpland-fullname">${escapeHtml(r.media_type || '')}${r.audio_only ? ' · audio' : ''} · ${new Date(r.downloaded_at).toLocaleString()}</span>
                </div>
                <a class="maxpland-btn-secondary" target="_blank" rel="noopener noreferrer" href="https://www.instagram.com/p/${encodeURIComponent(r.shortcode || '')}/" style="text-decoration:none;padding:3px 8px;font-size:11px;">View</a>
            </div>`).join('');
    }

    async function runMediaQueue({ skipExisting = false } = {}) {
        if (STATE.isMediaQueueRunning) return;
        const input = document.getElementById('maxpland-media-queue-input');
        const status = document.getElementById('maxpland-media-queue-status');
        const codes = extractShortcodesFromText(input.value || '');
        if (!codes.length) { alert('Please paste Instagram post links or shortcodes first'); return; }
        const accountId = IgBridge.getCookie('ds_user_id');
        const key = JSON.stringify([accountId, codes, skipExisting]);
        if (STATE.mediaQueue?.key !== key) STATE.mediaQueue = { key, finished: new Set(), attempted: new Set() };
        const queue = STATE.mediaQueue;
        STATE.isMediaQueueRunning = true;
        const buttons = ['maxpland-btn-run-media-queue', 'maxpland-btn-run-media-all'].map(id => document.getElementById(id)).filter(Boolean);
        buttons.forEach(btn => { btn.disabled = true; });
        input.disabled = true;
        let done = 0, skipped = 0, failed = 0, stopped = false;
        try {
            IgBridge.assertAccount(accountId);
            for (let i = 0; i < codes.length; i++) {
                const code = codes[i];
                if (queue.finished.has(code)) continue;
                status.textContent = (i + 1) + '/' + codes.length + ' · Fetching ' + code + '...';
                try {
                    IgBridge.assertAccount(accountId);
                    const retry = queue.attempted.has(code);
                    queue.attempted.add(code);
                    const result = await downloadByShortcode(code, { skipExisting: skipExisting || retry, allCarousel: true });
                    IgBridge.assertAccount(accountId);
                    for (const item of result) {
                        if (item.status === 'done') done++;
                        else if (item.status === 'skipped') skipped++;
                    }
                    queue.finished.add(code);
                } catch (err) {
                    failed++;
                    if (IgBridge.isSessionError(err)) {
                        stopped = true;
                        status.textContent = 'Queue paused: ' + err.message + ' · ' + (codes.length - queue.finished.size) + ' remaining. Click download to resume.';
                        break;
                    }
                }
                // ponytail: media queue was the only request loop with a constant 800ms
                // gap — a metronome. jittered to the same band as the inactive radar
                // loop (3.5-6s) but capped low so a long queue stays practical.
                if (i < codes.length - 1) await sleep(1800 + Math.floor(Math.random() * 1200));
            }
            if (!stopped) status.textContent = 'Downloaded: ' + done + ', Skipped: ' + skipped + ', Failed: ' + failed + ' · ' + queue.finished.size + '/' + codes.length + ' done';
        } catch (err) { status.textContent = err.message; }
        finally {
            STATE.isMediaQueueRunning = false;
            if (queue.finished.size === codes.length) STATE.mediaQueue = null;
            buttons.forEach(btn => { btn.disabled = false; });
            input.disabled = false;
            await renderMediaVault();
        }
    }

    // In-Feed Media Native Action Bar Integration (Zero Vertical Space Waste)
    function injectInFeedDownloadButtons(root = document) {
        if (STATE.prefs && STATE.prefs.quickDownloadFeed === false) {
            document.querySelectorAll('.maxpland-action-wrap').forEach(el => el.remove());
            return;
        }
        const articles = root instanceof Element && root.matches('article') ? [root] : root.querySelectorAll('article');
        articles.forEach(article => {
            const section = article.querySelector('section');
            if (!section) return;

            // Remove legacy banner if present
            const oldBanner = article.querySelector('.maxpland-feed-tools');
            if (oldBanner) oldBanner.remove();

            // Prevent duplicate insertion
            if (section.querySelector('.maxpland-action-wrap')) return;

            const wrap = document.createElement('div');
            wrap.className = 'maxpland-action-wrap';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'maxpland-action-btn';
            btn.setAttribute('aria-label', 'Download media (MaxPland)');
            btn.title = 'Download media (MaxPland) · Click for options';
            btn.innerHTML = ICONS.DOWNLOAD;

            const menu = document.createElement('div');
            menu.className = 'maxpland-action-menu';

            // 1. Single Media Download (Dynamic: Video or Photo)
            const dlSingle = document.createElement('button');
            dlSingle.type = 'button';
            dlSingle.className = 'maxpland-menu-item maxpland-menu-dl-single';
            dlSingle.innerHTML = ICONS.DOWNLOAD + '<span>Download (HD)</span>';
            dlSingle.onclick = (e) => {
                e.stopPropagation();
                closeAllMenus();
                runFeedAction(article, btn, { allCarousel: false });
            };

            // 2. Carousel All Download (only if multi-item post)
            const dlAll = document.createElement('button');
            dlAll.type = 'button';
            dlAll.className = 'maxpland-menu-item maxpland-menu-dl-all';
            dlAll.innerHTML = ICONS.DOWNLOAD_ALL + '<span>Download all media</span>';
            dlAll.onclick = (e) => {
                e.stopPropagation();
                closeAllMenus();
                runFeedAction(article, btn, { allCarousel: true });
            };

            // 3. Open in new tab
            const openTab = document.createElement('button');
            openTab.type = 'button';
            openTab.className = 'maxpland-menu-item';
            openTab.innerHTML = ICONS.EXTERNAL + '<span>Open media in new tab</span>';
            openTab.onclick = (e) => {
                e.stopPropagation();
                closeAllMenus();
                openMediaDirectLink(article);
            };

            // 4. Divider
            const divider = document.createElement('div');
            divider.className = 'maxpland-menu-divider';

            // 5. Open MaxPland Studio
            const openStudio = document.createElement('button');
            openStudio.type = 'button';
            openStudio.className = 'maxpland-menu-item';
            openStudio.innerHTML = ICONS.LOGO + '<span>Open MaxPland Studio</span>';
            openStudio.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeAllMenus();
                if (typeof window.openMaxPlandStudio === 'function') {
                    window.openMaxPlandStudio();
                } else {
                    const tb = document.getElementById('maxpland-trigger-btn');
                    if (tb) tb.click();
                }
            };

            menu.append(dlSingle, dlAll, openTab, divider, openStudio);

            btn.onclick = (e) => {
                e.stopPropagation();
                const isShown = menu.classList.contains('show');
                closeAllMenus();
                if (!isShown) {
                    const hasVideo = Boolean(article.querySelector('video'));
                    const isCarousel = Boolean(article.querySelector('ul li') || article.querySelectorAll('button[aria-label*="Next"], button[aria-label*="ต่อไป"]').length);

                    dlSingle.innerHTML = ICONS.DOWNLOAD + `<span>${hasVideo ? 'Download Video (HD)' : 'Download Image (HD)'}</span>`;
                    dlAll.style.display = isCarousel ? 'flex' : 'none';
                    menu.classList.add('show');
                }
            };

            btn.ondblclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeAllMenus();
                runFeedAction(article, btn, { allCarousel: false });
            };

            wrap.append(btn, menu);

            // Integrate into section alongside bookmark/save or at the end
            const bookmarkIcon = section.querySelector('svg[aria-label*="Save"], svg[aria-label*="บันทึก"], svg[aria-label*="Remove"], svg[aria-label*="ลบออก"], polygon');
            const bookmarkContainer = bookmarkIcon ? bookmarkIcon.closest('button, div[role="button"]') : null;
            if (bookmarkContainer && bookmarkContainer.parentElement) {
                bookmarkContainer.parentElement.insertBefore(wrap, bookmarkContainer);
            } else {
                const lastChild = section.lastElementChild;
                if (lastChild && lastChild !== section) {
                    lastChild.appendChild(wrap);
                } else {
                    section.appendChild(wrap);
                }
            }
        });
    }

    function closeAllMenus() {
        document.querySelectorAll('.maxpland-action-menu.show').forEach(m => m.classList.remove('show'));
    }

    async function runFeedAction(article, btn, options) {
        if (btn.classList.contains('loading')) return;
        btn.classList.add('loading');
        const origIcon = btn.innerHTML;
        btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5"><circle cx="12" cy="12" r="9" stroke-dasharray="28" stroke-linecap="round"/></svg>`;
        try {
            await handleDirectMediaDownload(article, options);
        } catch (err) {
            alert(err.message || String(err));
        } finally {
            btn.classList.remove('loading');
            btn.innerHTML = origIcon;
        }
    }

    async function handleDirectMediaDownload(article, { allCarousel = false } = {}) {
        const accountId = IgBridge.getCookie('ds_user_id');
        IgBridge.assertAccount(accountId);
        const shortcode = shortcodeFromArticle(article);
        if (shortcode) {
            try {
                const results = await downloadByShortcode(shortcode, { allCarousel, skipExisting: false });
                const done = results.filter(x => x.status === 'done').length;
                if (!done) throw new Error('No downloadable media stream found');
                if (typeof GM_notification === 'function') GM_notification({ title: APP_CONFIG.APP_NAME, text: `Downloaded ${done} file(s) from ${shortcode}`, timeout: 2500 });
                return;
            } catch (err) {
                IgBridge.assertAccount(accountId);
                if (IgBridge.isSessionError(err) || allCarousel) throw err;
                console.warn('[IG MaxPland] API Resolver failed, trying DOM fallback');
            }
        }

        // DOM Fallback
        IgBridge.assertAccount(accountId);
        const video = article.querySelector('video');
        const img = article.querySelector('img[srcset]') || article.querySelector('img');
        const mediaUrl = video?.currentSrc || video?.src || img?.currentSrc || img?.src || null;
        if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) {
            alert('No downloadable media URL found for this post');
            return;
        }
        const isVideo = Boolean(video && (video.currentSrc || video.src));
        const ext = extensionFromUrl(mediaUrl, isVideo ? 'mp4' : 'jpg');
        const filename = `IG_MaxPland_${Date.now()}.${ext}`;
        try { await gmDownload(mediaUrl, filename); }
        catch (_) { window.open(mediaUrl, '_blank', 'noopener,noreferrer'); }
    }

    function openMediaDirectLink(article) {
        const video = article.querySelector('video');
        const img = article.querySelector('img[srcset]') || article.querySelector('img');
        const mediaUrl = video?.currentSrc || video?.src || img?.currentSrc || img?.src || null;
        if (mediaUrl) window.open(mediaUrl, '_blank', 'noopener,noreferrer');
        else alert('No media URL found for this item');
    }

    // Story & Highlight Tools
    // ponytail: resolveCurrentStoryMedia extracts pristine image/poster directly from center active story section
    // skipped: video stream scraping and open-tab actions to prevent UI freezing and blob errors; add when Instagram opens unencrypted public streams
    function findCenterElement(selector, root = document) {
        const viewportCenterX = (window.innerWidth || 800) / 2;
        let best = null;
        let minDistance = Infinity;

        for (const el of root.querySelectorAll(selector)) {
            if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true })) continue;
            if (typeof el.getBoundingClientRect !== 'function') continue;
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            if (r.bottom <= 0 || r.top >= (window.innerHeight || 600)) continue;

            const elCenterX = (r.left + r.right) / 2;
            const dist = Math.abs(elCenterX - viewportCenterX);
            if (dist < minDistance) {
                minDistance = dist;
                best = el;
            }
        }
        return best;
    }

    function getActiveStorySection() {
        const viewportCenterX = (window.innerWidth || 800) / 2;
        const sections = [...document.querySelectorAll('section')];
        let best = null;
        let minDistance = Infinity;

        for (const sec of sections) {
            if (typeof sec.checkVisibility === 'function' && !sec.checkVisibility({ checkVisibilityCSS: true })) continue;
            if (typeof sec.getBoundingClientRect !== 'function') continue;
            const r = sec.getBoundingClientRect();
            if (r.width < 50 || r.height < 50) continue;
            if (r.bottom <= 0 || r.top >= (window.innerHeight || 600)) continue;

            const secCenterX = (r.left + r.right) / 2;
            const dist = Math.abs(secCenterX - viewportCenterX);
            if (dist < minDistance) {
                minDistance = dist;
                best = sec;
            }
        }
        return best;
    }

    function visibleStoryElement(selector) {
        const activeSec = getActiveStorySection();
        if (activeSec && typeof activeSec.querySelector === 'function') {
            const inner = activeSec.querySelector(selector);
            if (inner) return inner;
        }
        return findCenterElement(selector);
    }

    function pickStoryMedia(selectorVideo, selectorImg) {
        const activeSection = getActiveStorySection();

        // 1. Video in active section or centered
        let video = (typeof activeSection?.querySelector === 'function' ? activeSection.querySelector('video') : null) || null;
        if (!video) {
            video = findCenterElement(selectorVideo || 'section video, video');
        }

        // 2. Story image in active section or centered (avatar-proof)
        let img = null;
        const imgCandidates = (activeSection && typeof activeSection.querySelectorAll === 'function')
            ? activeSection.querySelectorAll(selectorImg || 'img._aa63, img[crossorigin], img[referrerpolicy], img')
            : document.querySelectorAll(selectorImg || 'section img._aa63, section img[crossorigin], section img[referrerpolicy], img');

        let maxArea = 0;
        const viewportCenterX = (window.innerWidth || 800) / 2;

        for (const candidate of imgCandidates) {
            if (typeof candidate.checkVisibility === 'function' && !candidate.checkVisibility({ checkVisibilityCSS: true })) continue;
            if (typeof candidate.getBoundingClientRect !== 'function') continue;
            const r = candidate.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            if (r.bottom <= 0 || r.top >= (window.innerHeight || 600)) continue;

            const isAvatar = (r.width <= 64 && r.height <= 64) || (typeof candidate.closest === 'function' && candidate.closest('header'));
            if (isAvatar) continue;

            if (!activeSection) {
                const cX = (r.left + r.right) / 2;
                if (Math.abs(cX - viewportCenterX) > 350) continue;
            }

            const area = r.width * r.height;
            if (area > maxArea) {
                maxArea = area;
                img = candidate;
            }
        }

        if (!img && !video) {
            img = findCenterElement(selectorImg || 'img');
        }

        let mediaUrl = video?.getAttribute?.('poster') || video?.poster || img?.currentSrc || img?.src || '';
        if (!/^https?:\/\//i.test(mediaUrl)) mediaUrl = '';
        return { video, img, mediaUrl, activeSection };
    }

    // ponytail: extractMediaFromFiber walks React Fiber return chain with strict bounds (no recursion, zero UI freeze)
    // skipped: recursive fiber graph walking to prevent browser freeze; add when React moves item props off parent return chain
    function extractMediaFromFiber(el) {
        if (!el) return null;
        const keys = Object.keys(el);
        const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        const propsKey = keys.find(k => k.startsWith('__reactProps$'));

        if (propsKey && el[propsKey]?.item) {
            const item = el[propsKey].item;
            if (item.video_versions || item.image_versions2) {
                const isVideo = Boolean(item.video_versions && item.video_versions.length > 0);
                const videoUrl = item.video_versions?.slice()?.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]?.url || null;
                const imageUrl = item.image_versions2?.candidates?.slice()?.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]?.url || null;
                const url = isVideo ? (videoUrl || imageUrl) : (imageUrl || videoUrl);
                if (url) return { url, isVideo, id: item.id || item.pk, source: 'fiber-props' };
            }
        }

        if (fiberKey) {
            let curr = el[fiberKey];
            let depth = 0;
            while (curr && depth < 30) {
                const item = curr.memoizedProps?.item || curr.pendingProps?.item || curr.props?.item;
                if (item && (item.video_versions || item.image_versions2)) {
                    const isVideo = Boolean(item.video_versions && item.video_versions.length > 0);
                    const videoUrl = item.video_versions?.slice()?.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]?.url || null;
                    const imageUrl = item.image_versions2?.candidates?.slice()?.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]?.url || null;
                    const url = isVideo ? (videoUrl || imageUrl) : (imageUrl || videoUrl);
                    if (url) return { url, isVideo, id: item.id || item.pk, source: 'fiber' };
                }
                curr = curr.return;
                depth++;
            }
        }
        return null;
    }

    // ponytail: resolveCurrentStoryMedia extracts pristine 1080p story MP4/JPG via bounded Fiber, network registry, or DOM
    // skipped: third-party proxy fetchers to prevent auth leak and 429 checkpoint; add when client-side extraction fails entirely
    async function resolveCurrentStoryMedia(isThumb = false) {
        const activeSection = getActiveStorySection();
        const { video, img } = pickStoryMedia('section video', 'section img._aa63, section img[crossorigin], section img[referrerpolicy]');

        // 1. Direct video poster from active story if specifically requested
        if (isThumb) {
            const poster = video?.getAttribute?.('poster') || video?.poster;
            if (poster && /^https?:\/\//i.test(poster)) {
                return { url: poster, isVideo: false, source: 'dom-poster', isBlob: false };
            }
        }

        // 2. React Fiber extraction (lightning fast, bounded parent return loop, 0ms, zero-freeze)
        const fiberCandidates = [video, img, activeSection].filter(Boolean);
        for (const cand of fiberCandidates) {
            const fiber = extractMediaFromFiber(cand);
            if (fiber?.url) {
                if (isThumb && fiber.source.includes('fiber')) {
                    const poster = video?.getAttribute?.('poster') || video?.poster;
                    if (poster && /^https?:\/\//i.test(poster)) return { url: poster, isVideo: false, source: 'dom-poster', isBlob: false };
                }
                return fiber;
            }
        }

        // 3. Network Cache lookup (StoryMediaRegistry)
        let mediaId = null;
        if (activeSection && typeof activeSection.querySelector === 'function') {
            const storyLink = activeSection.querySelector('a[href*="/stories/"]');
            const hrefMatch = storyLink?.getAttribute?.('href')?.match(/\/stories\/[^\/]+\/(\d+)/);
            if (hrefMatch) mediaId = hrefMatch[1];
        }
        if (!mediaId) {
            const pathMatch = location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
            if (pathMatch) mediaId = pathMatch[1];
        }

        if (mediaId && StoryMediaRegistry.items.has(mediaId)) {
            const cached = StoryMediaRegistry.items.get(mediaId);
            if (isThumb && cached.imageUrl) return { url: cached.imageUrl, isVideo: false, source: 'cache', isBlob: false };
            const isVideo = Boolean(cached.isVideo && cached.videoUrl);
            const url = isVideo ? cached.videoUrl : (cached.imageUrl || cached.videoUrl);
            if (url) return { url, isVideo, source: 'cache', isBlob: false };
        }

        // 4. Native DOM fallback
        if (!isThumb && video) {
            const vSrc = video.currentSrc || video.src || '';
            if (vSrc && /^https?:\/\//i.test(vSrc) && !vSrc.startsWith('blob:')) {
                return { url: vSrc, isVideo: true, source: 'dom-video', isBlob: false };
            }
            const srcEl = typeof video.querySelector === 'function' ? video.querySelector('source') : null;
            if (srcEl?.src && /^https?:\/\//i.test(srcEl.src) && !srcEl.src.startsWith('blob:')) {
                return { url: srcEl.src, isVideo: true, source: 'dom-source', isBlob: false };
            }
        }
        if (img) {
            const imgUrl = img.currentSrc || img.src || '';
            if (imgUrl && /^https?:\/\//i.test(imgUrl)) {
                return { url: imgUrl, isVideo: false, source: 'dom-img', isBlob: false };
            }
        }

        // 5. API Fallback (IgBridge.fetchMediaInfo)
        if (mediaId) {
            try {
                const item = await IgBridge.fetchMediaInfo(mediaId);
                const isVideo = Boolean(item.video_versions && item.video_versions.length > 0);
                const videoUrl = IgBridge.bestProgressiveVideo(item);
                const imageUrl = IgBridge.bestImage(item);
                if (isThumb && imageUrl) return { url: imageUrl, isVideo: false, source: 'api', isBlob: false };
                const url = isVideo ? (videoUrl || imageUrl) : (imageUrl || videoUrl);
                if (url) return { url, isVideo, source: 'api', isBlob: false };
            } catch (err) {
                console.warn('[MaxPland] Story API info unavailable', err);
            }
        }

        // 6. Video poster fallback if video blob could not be resolved
        const poster = video?.getAttribute?.('poster') || video?.poster;
        if (poster && /^https?:\/\//i.test(poster)) {
            return { url: poster, isVideo: false, source: 'dom-poster', isBlob: false };
        }

        return { url: null, isVideo: Boolean(video), isBlob: Boolean(video?.currentSrc?.startsWith('blob:')), source: 'none' };
    }

    // ponytail: Story toolbar: Stealth Seen toggle + Open Raw + Viewers (3 controls)
    // skipped: story media downloads removed per user direction due to unstable Instagram MSE blob stream encryption; add when a non-fragile public media API is available
    function injectStoryBar() {
        if (!location.pathname.startsWith('/stories/')) {
            const existing = document.getElementById('maxpland-story-bar');
            if (existing) existing.remove();
            return;
        }

        if (STATE.prefs && STATE.prefs.quickDownloadStory === false) {
            const existing = document.getElementById('maxpland-story-bar');
            if (existing) existing.remove();
            return;
        }

        StoryMediaRegistry.scanDomScripts();

        if (document.getElementById('maxpland-story-bar')) return;

        const storyContainer = visibleStoryElement('section');
        if (!storyContainer) return;

        const bar = document.createElement('div');
        bar.id = 'maxpland-story-bar';
        bar.className = 'maxpland-story-tools';

        const stealthBtn = document.createElement('button');
        stealthBtn.type = 'button';
        stealthBtn.id = 'maxpland-story-stealth-toggle';
        stealthBtn.className = 'maxpland-story-btn maxpland-story-stealth-btn';
        const isStealth = STATE.prefs?.stealthStory !== false;
        stealthBtn.style.background = isStealth ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
        stealthBtn.style.border = `1px solid ${isStealth ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`;
        stealthBtn.innerHTML = `<span>${isStealth ? '👁️ Stealth: ON' : '👁️ Stealth: OFF'}</span>`;
        stealthBtn.title = isStealth ? 'Stealth Story Viewer active (Seen beacon blocked)' : 'Stealth Story Viewer off (Seen beacon sent normally)';
        stealthBtn.onclick = () => {
            const next = !(STATE.prefs?.stealthStory !== false);
            STATE.prefs.stealthStory = next;
            savePrefs();
            stealthBtn.style.background = next ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
            stealthBtn.style.border = `1px solid ${next ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`;
            stealthBtn.innerHTML = `<span>${next ? '👁️ Stealth: ON' : '👁️ Stealth: OFF'}</span>`;
            stealthBtn.title = next ? 'Stealth Story Viewer active (Seen beacon blocked)' : 'Stealth Story Viewer off (Seen beacon sent normally)';
            const modalSwitch = document.getElementById('pref-switch-stealth-story');
            if (modalSwitch) modalSwitch.checked = next;
            showToast(next ? 'Stealth Story Viewer enabled (Seen blocked)' : 'Stealth Story Viewer disabled');
        };

        // ponytail: story DOWNLOAD buttons stay removed (fragile per v2.7.2), but "Open Raw"
        // only hands the resolved URL to a new tab — no download pipeline to break.
        // Technique adapted from navchandar/Instagram_Story_Saver, re-written around our
        // 5-layer resolver instead of blind parentNode climbing.
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.id = 'maxpland-story-open-btn';
        openBtn.className = 'maxpland-story-btn';
        openBtn.innerHTML = '<span>↗ Open Raw</span>'; // literal-only markup, no user-controlled data (same pattern as stealthBtn)
        openBtn.title = 'Open the current story media URL in a new tab (save from there manually)';
        const viewersBtn = document.createElement('button');
        viewersBtn.type = 'button';
        viewersBtn.id = 'maxpland-story-viewers-btn';
        viewersBtn.className = 'maxpland-story-btn';
        viewersBtn.innerHTML = '<span>👁 Viewers</span>'; // literal-only markup, same pattern as siblings
        viewersBtn.title = 'Who viewed this story (your own stories only)';
        viewersBtn.onclick = async () => {
            viewersBtn.disabled = true;
            try {
                const mediaId = (() => {
                    const active = typeof getActiveStorySection === 'function' ? getActiveStorySection() : null;
                    const link = active?.querySelector?.('a[href*="/stories/"]');
                    const m = (link?.getAttribute?.('href') || location.pathname).match(/\/stories\/[^\/]+\/(\d+)/);
                    return m ? m[1] : null;
                })();
                if (!mediaId) { showToast('Open a specific story first (no media id in view)'); return; }
                showToast('Loading story viewers...');
                const viewers = await IgBridge.fetchStoryViewers(mediaId);
                renderViewerPanel(viewersBtn, viewers);
            } catch (err) {
                console.warn('[MaxPland] Story viewers failed', err);
                showToast('Viewers unavailable — works on your own stories only');
            } finally {
                viewersBtn.disabled = false;
            }
        };

        openBtn.onclick = async () => {
            // Open the tab synchronously inside the click gesture to dodge popup blockers,
            // then fill in the real URL once the resolver settles.
            const win = window.open('about:blank', '_blank', 'noopener');
            try {
                const media = await resolveCurrentStoryMedia();
                if (win && media?.url && !media.isBlob) {
                    win.location.href = media.url;
                    return;
                }
                if (win) win.close();
                showToast('Raw media URL not available for this story');
            } catch (err) {
                console.warn('[MaxPland] Open raw story URL failed', err);
                if (win) win.close();
                showToast('Could not resolve story media URL');
            }
        };

        bar.append(stealthBtn, openBtn, viewersBtn);
        document.body.appendChild(bar);
    }

    // Profile HD Avatar Downloader
    function injectProfileAvatarBadge() {
        const pathParts = location.pathname.split('/').filter(Boolean);
        if (pathParts.length !== 1 || ['explore','stories','reels','direct','accounts'].includes(pathParts[0])) {
            const b = document.getElementById('maxpland-profile-avatar-btn');
            if (b) b.remove();
            return;
        }

        if (document.getElementById('maxpland-profile-avatar-btn')) return;

        const headerActions = document.querySelector('header section') || document.querySelector('header h2')?.parentElement;
        if (!headerActions) return;

        const uname = pathParts[0];
        const btn = document.createElement('button');
        btn.id = 'maxpland-profile-avatar-btn';
        btn.type = 'button';
        btn.className = 'maxpland-avatar-badge';
        btn.title = `Download HD profile picture of @${uname}`;
        btn.innerHTML = ICONS.AVATAR + '<span>HD Avatar</span>';
        btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = 'Fetching HD...';
            try {
                const hdUrl = await IgBridge.fetchUserProfileHD(uname);
                const fallbackImg = document.querySelector('header img[alt*="profile"]');
                const finalUrl = hdUrl || fallbackImg?.currentSrc || fallbackImg?.src;
                if (!finalUrl) throw new Error('Profile avatar not found');
                const filename = `${uname}_profile_hd_${Date.now()}.jpg`;
                await gmDownload(finalUrl, filename);
                showToast(`HD Avatar of @${uname} downloaded successfully`);
            } catch (err) {
                alert(`Failed to download profile avatar: ${err.message || err}`);
            } finally {
                btn.disabled = false;
                btn.innerHTML = ICONS.AVATAR + '<span>HD Avatar</span>';
            }
        };

        headerActions.appendChild(btn);
    }

    function startPageObserver() {
        let timer = null;
        const observer = new MutationObserver(() => {
            if (timer) return;
            timer = setTimeout(() => {
                timer = null;
                const path = location.pathname;
                injectStoryBar();
                if (!path.startsWith('/stories/')) {
                    injectInFeedDownloadButtons();
                    injectProfileAvatarBadge();
                }
            }, 300);
        });
        // ponytail: story bar / feed buttons / avatar badge all live under <main>;
        // the profile header badge lives under <header>. Observe both roots and
        // fall back to body when either is missing (degrades to the old scope).
        const pageRoots = [document.querySelector('main'), document.querySelector('header')].filter(Boolean);
        for (const root of (pageRoots.length ? pageRoots : [document.body])) {
            observer.observe(root, { childList: true, subtree: true });
        }
    }

    /* ==========================================================================
       12. INITIALIZATION
       ========================================================================== */

    async function init() {
        if (document.getElementById('maxpland-trigger-btn')) return;
        createUI();
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('Open IG MaxPland', () => {
                if (typeof window.openMaxPlandStudio === 'function') {
                    window.openMaxPlandStudio();
                } else {
                    document.getElementById('maxpland-trigger-btn')?.click();
                }
            });
        }
        try {
            await MaxPlandVault.init();
            STATE.whitelist = await MaxPlandVault.getWhitelist();
            const whiteCountEl = document.getElementById('pill-count-white');
            if (whiteCountEl) whiteCountEl.textContent = STATE.whitelist.size.toLocaleString();
        } catch (err) {
            console.warn('[MaxPland] Local vault unavailable', err);
        }

        installStorySeenInterceptor();
        applyCleanFeedMode();
        // A block that survives a reload is the point; restore it before any request.
        IgBridge.restoreHardBlock();
        const blockRow = document.getElementById('maxpland-block-row');
        if (blockRow && IgBridge.hardBlockAccount) blockRow.style.display = '';
        const budgetLabel = document.getElementById('maxpland-budget-label');
        if (budgetLabel) budgetLabel.textContent = formatBudget();

        injectInFeedDownloadButtons();
        injectStoryBar();
        injectProfileAvatarBadge();
        startPageObserver();
        document.addEventListener('click', () => closeAllMenus());
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }

})();
