// ==UserScript==
// @name         IG MaxPland
// @namespace    http://tampermonkey.net/
// @version      4.0.0
// @description  Instagram Relationship Scanner, Account Health & Zero-API Fiber Media Downloader
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
       1. CONSTANTS, UTILITIES & DESIGN TOKENS (Clean Minimal Precision v4.0)
       ========================================================================== */

    const APP_CONFIG = Object.freeze({
        APP_NAME: 'IG MaxPland',
        VERSION: '4.0.0',
        DB_NAME: 'IG_MAXPLAND_VAULT',
        DB_VERSION: 8, // v8 adds 'checkpoints' store to eliminate localStorage 5MB quota failures
        SNAPSHOT_RETENTION: 30,
        MEDIA_REGISTRY_MAX: 500,
        PAGE_SIZE: 50,
        INSTAGRAM_WEB_APP_ID: '936619743392459',
        FOLLOWING_PAGE_SAFETY_LIMIT: 60,
        FOLLOWERS_PAGE_SAFETY_LIMIT: 250,
        UNFOLLOW_DELAY_MIN: 15000,
        UNFOLLOW_DELAY_MAX: 30000,
        INACTIVE_FETCH_CAP_PER_RUN: 25,
        INACTIVE_CACHE_TTL_MS: 14 * 86400 * 1000,
        CHECKPOINT_TTL_MS: 24 * 3600 * 1000,
    });

    const STORAGE_KEYS = Object.freeze({
        PREFS: 'maxpland_prefs',
        HARD_BLOCK: 'maxpland_hard_block',
        WRITE_BUDGET: 'maxpland_write_budget',
        LAUNCHER_POS: 'maxpland_launcher_pos',
    });

    const DEFAULT_AVATAR_PATTERNS = [
        '44884218_345707102882519_2446069589734326272_n',
        '464760996_1254146839119862_3605321457742435801_n'
    ];

    // Private sandbox flags (Zero global window pollution)
    let isStealthHookInstalled = false;
    let isGqlFallbackWarned = false;
    let stealthSeenBlockedCount = 0;

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const escapeHtml = (val) => String(val ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);

    const getUid = (u) => String(u?.id || u?.pk_id || u?.pk || '').trim();
    const getUname = (u) => String(u?.username || '').trim();

    const formatTime = (sec) => {
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };

    const formatDurationMs = (ms) => {
        const s = Math.round((Number(ms) || 0) / 1000);
        return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
    };

    const safeFilename = (val) => String(val || 'instagram')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 150);

    const extensionFromUrl = (url, fallback = 'jpg') => {
        try {
            const ext = new URL(url).pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
            if (ext && ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'm4a', 'mp3', 'aac', 'webm'].includes(ext)) return ext;
        } catch (_) {}
        return fallback;
    };

    const csvCell = (val) => {
        let s = String(val ?? '');
        if (/^[\s\x00-\x1f]*[=+\-@]/.test(s)) s = "'" + s;
        return `"${s.replace(/"/g, '""')}"`;
    };

    const hasNoAvatar = (user) => {
        if (!user || !user.profile_pic_url) return true;
        if (user.has_anonymous_profile_picture === true) return true;
        return DEFAULT_AVATAR_PATTERNS.some(p => String(user.profile_pic_url).includes(p));
    };

    const ICONS = Object.freeze({
        LOGO: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>`,
        TRIGGER: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>`,
        CLOSE: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
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
        CLOCK: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        BOLT: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
    });

    const NATIVE_IG_CSS = `
        :root {
            --mp-bg-root: #090b0e;
            --mp-bg-surface: #101318;
            --mp-bg-panel: #151921;
            --mp-bg-card: #1b202a;
            --mp-bg-elevated: #232936;
            --mp-bg-hover: #293040;
            --mp-border-subtle: rgba(255, 255, 255, 0.08);
            --mp-border-card: #2c3444;
            --mp-border-active: rgba(56, 189, 248, 0.45);
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
            --mp-shadow-modal: 0 16px 40px rgba(0, 0, 0, 0.65), 0 36px 90px rgba(0, 0, 0, 0.85);
            --mp-shadow-card: 0 2px 6px rgba(0, 0, 0, 0.28);
        }

        #maxpland-studio-modal {
            position: fixed; inset: 50% auto auto 50%; transform: translate(-50%, -50%); z-index: 100000;
            width: min(1060px, 95vw); height: min(800px, 90dvh); max-height: 90dvh;
            display: grid; grid-template-columns: 196px minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr) auto;
            grid-template-areas: 'header header' 'nav progress' 'nav main' 'footer footer';
            background: var(--mp-bg-surface); color: var(--mp-text-primary); border: 1px solid var(--mp-border-subtle);
            border-radius: 14px; overflow: hidden; box-shadow: var(--mp-shadow-modal);
            font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            text-align: left; color-scheme: dark;
        }
        #maxpland-studio-modal, #maxpland-studio-modal * { box-sizing: border-box; }
        #maxpland-studio-modal button, #maxpland-studio-modal input, #maxpland-studio-modal textarea, #maxpland-studio-modal select { font: inherit; }
        #maxpland-studio-modal button { cursor: pointer; }
        #maxpland-studio-modal button:disabled { cursor: not-allowed; opacity: .45; }
        #maxpland-studio-modal :focus-visible, #maxpland-trigger-btn:focus-visible { outline: 2px solid var(--mp-blue); outline-offset: 2px; }

        #maxpland-studio-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.76); z-index: 99999; backdrop-filter: blur(3px); }

        #maxpland-trigger-btn {
            position: fixed; right: 24px; bottom: 24px; z-index: 99998;
            width: 44px; height: 44px; border-radius: 12px; padding: 0;
            display: grid; place-items: center; appearance: none;
            border: 1.5px solid rgba(255, 255, 255, 0.35);
            background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
            color: #ffffff;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 14px rgba(220, 39, 67, 0.35);
            cursor: grab; user-select: none; touch-action: none;
            transition: border-color .15s ease, box-shadow .15s ease, transform .12s ease;
        }
        #maxpland-trigger-btn:hover {
            border-color: rgba(255, 255, 255, 0.75);
            box-shadow: 0 6px 22px rgba(0, 0, 0, 0.55), 0 0 18px rgba(220, 39, 67, 0.55);
            transform: scale(1.06);
        }
        #maxpland-trigger-btn:active { cursor: grabbing; transform: scale(0.96); }

        .maxpland-header {
            grid-area: header; height: 52px; border-bottom: 1px solid var(--mp-border-subtle);
            display: flex; align-items: center; justify-content: space-between; padding: 0 18px;
            background: var(--mp-bg-surface);
        }
        .maxpland-brand { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 14px; }
        .maxpland-user-pill {
            font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 6px;
            background: var(--mp-bg-panel); color: #38bdf8; border: 1px solid var(--mp-border-card);
            display: inline-flex; align-items: center; gap: 5px;
        }
        .maxpland-budget-pill {
            font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 6px;
            background: var(--mp-bg-panel); color: var(--mp-text-secondary); border: 1px solid var(--mp-border-card);
            font-variant-numeric: tabular-nums;
        }
        .maxpland-close-btn {
            background: none; border: 1px solid transparent; color: var(--mp-text-secondary);
            padding: 6px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
            transition: background-color .15s, color .15s;
        }
        .maxpland-close-btn:hover { background: var(--mp-bg-hover); color: var(--mp-text-primary); border-color: var(--mp-border-subtle); }

        .maxpland-tabs {
            grid-area: nav; border-right: 1px solid var(--mp-border-subtle); padding: 14px 10px;
            display: flex; flex-direction: column; gap: 5px; background: var(--mp-bg-panel);
        }
        .maxpland-tab-btn {
            display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid transparent; background: none;
            color: var(--mp-text-secondary); border-radius: 8px; text-align: left; font-weight: 600; font-size: 13px;
            transition: background-color .15s, color .15s, border-color .15s;
        }
        .maxpland-tab-btn:hover { background: var(--mp-bg-hover); color: var(--mp-text-primary); }
        .maxpland-tab-btn.active {
            background: var(--mp-bg-card); color: var(--mp-text-primary);
            border-color: var(--mp-border-card); box-shadow: inset 3px 0 0 var(--mp-blue);
        }

        .maxpland-progress-container {
            grid-area: progress; display: none; padding: 11px 18px; background: var(--mp-bg-panel);
            border-bottom: 1px solid var(--mp-border-subtle);
        }
        .maxpland-scan-row {
            display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 12.5px; gap: 10px; flex-wrap: wrap;
        }
        .maxpland-scan-phase { font-weight: 600; color: #38bdf8; display: flex; align-items: center; gap: 6px; }
        .maxpland-scan-meta {
            font-variant-numeric: tabular-nums; color: var(--mp-text-secondary); font-size: 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        }
        .maxpland-progress-track {
            height: 6px; background: var(--mp-bg-root); border-radius: 3px; overflow: hidden; border: 1px solid var(--mp-border-subtle);
        }
        .maxpland-progress-bar {
            height: 100%; width: 0; background: linear-gradient(90deg, var(--mp-blue), #6366f1);
            transition: width .2s ease-out; border-radius: 3px;
        }
        .maxpland-scan-notice {
            font-size: 11.5px; color: #fbbf24; margin-top: 6px; display: none; font-weight: 500;
        }

        .maxpland-body { grid-area: main; overflow-y: auto; padding: 16px 20px; background: var(--mp-bg-surface); position: relative; }
        .maxpland-tab-content { display: none; }
        .maxpland-tab-content.active { display: block; }

        .maxpland-stats-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
        .maxpland-stat-card {
            background: var(--mp-bg-card); border: 1px solid var(--mp-border-card); border-radius: 8px;
            padding: 11px 13px; display: flex; flex-direction: column; gap: 3px; box-shadow: var(--mp-shadow-card);
            position: relative; overflow: hidden; cursor: pointer; transition: border-color .15s, transform .12s;
        }
        .maxpland-stat-card:hover { border-color: var(--mp-border-active); transform: translateY(-1px); }
        .maxpland-stat-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
        .maxpland-stat-card.card-not-following::before { background: var(--mp-rose); }
        .maxpland-stat-card.card-fans::before { background: var(--mp-cyan); }
        .maxpland-stat-card.card-mutual::before { background: var(--mp-emerald); }
        .maxpland-stat-card.card-lost::before { background: var(--mp-amber); }
        .maxpland-stat-card.card-ghost::before { background: #a855f7; }

        .maxpland-stat-label { font-size: 10.5px; color: var(--mp-text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: .4px; }
        .maxpland-stat-value { font-size: 22px; font-weight: 800; color: var(--mp-text-primary); line-height: 1.15; font-variant-numeric: tabular-nums; }
        .maxpland-stat-hint { font-size: 11px; color: var(--mp-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .maxpland-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
        .maxpland-filter-group { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
        .maxpland-pill-btn {
            padding: 5px 10px; border-radius: 6px; border: 1px solid var(--mp-border-card);
            background: var(--mp-bg-panel); color: var(--mp-text-secondary); font-size: 11.5px; font-weight: 600;
            display: inline-flex; align-items: center; gap: 5px; transition: all .15s;
        }
        .maxpland-pill-btn:hover { background: var(--mp-bg-hover); color: var(--mp-text-primary); border-color: var(--mp-border-active); }
        .maxpland-pill-btn.active { background: var(--mp-text-primary); color: var(--mp-bg-root); border-color: var(--mp-text-primary); }
        .maxpland-pill-count { font-size: 10.5px; opacity: .85; font-variant-numeric: tabular-nums; }

        .maxpland-subfilters { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; font-size: 11.5px; color: var(--mp-text-secondary); }
        .maxpland-chip-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .maxpland-chip-toggle {
            display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 5px;
            background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card); cursor: pointer; user-select: none;
            transition: all .12s;
        }
        .maxpland-chip-toggle:hover { border-color: var(--mp-border-active); color: var(--mp-text-primary); }
        .maxpland-chip-toggle.active { background: #1e293b; border-color: #38bdf8; color: #38bdf8; }

        .maxpland-search-box {
            display: flex; align-items: center; gap: 7px; background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card);
            border-radius: 6px; padding: 5px 10px; color: var(--mp-text-muted); min-width: 210px;
        }
        .maxpland-search-box:focus-within { border-color: var(--mp-blue); color: var(--mp-text-primary); }
        .maxpland-search-box input { background: none; border: none; outline: none; color: var(--mp-text-primary); font-size: 12px; width: 100%; }

        .maxpland-btn-primary {
            background: var(--mp-blue); color: #fff; border: 1px solid transparent; border-radius: 6px;
            padding: 6px 13px; font-weight: 600; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;
            transition: background-color .15s;
        }
        .maxpland-btn-primary:hover { background: var(--mp-blue-hover); }
        .maxpland-btn-secondary {
            background: var(--mp-bg-card); color: var(--mp-text-primary); border: 1px solid var(--mp-border-card);
            border-radius: 6px; padding: 6px 11px; font-weight: 600; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;
            transition: background-color .15s, border-color .15s;
        }
        .maxpland-btn-secondary:hover { background: var(--mp-bg-hover); border-color: var(--mp-border-active); }
        .maxpland-btn-danger {
            background: var(--mp-rose-bg); color: #fda4af; border: 1px solid rgba(244, 63, 94, 0.3);
            border-radius: 6px; padding: 5px 11px; font-weight: 600; font-size: 11.5px; display: inline-flex; align-items: center; gap: 5px;
            transition: background-color .15s;
        }
        .maxpland-btn-danger:hover { background: rgba(244, 63, 94, 0.28); }

        .maxpland-bulk-bar {
            display: none; align-items: center; justify-content: space-between; padding: 8px 14px;
            background: #172133; border: 1px solid #38bdf8; border-radius: 8px; margin-bottom: 10px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4); animation: mpFadeIn .15s ease-out; flex-wrap: wrap; gap: 8px;
        }
        .maxpland-bulk-info { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 12px; color: #f8fafc; flex-wrap: wrap; }
        .maxpland-bulk-actions { display: flex; align-items: center; gap: 8px; }

        .maxpland-user-list {
            background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card); border-radius: 8px;
            overflow: hidden; max-height: 410px; overflow-y: auto; position: relative;
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
        .maxpland-checkbox:checked { background: var(--mp-blue); border-color: var(--mp-blue); }
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

        .maxpland-status-tag { font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; }
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

        .maxpland-toast {
            position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
            background: #172133; color: #f8fafc; border: 1px solid #38bdf8;
            padding: 8px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 600;
            box-shadow: 0 10px 28px rgba(0,0,0,0.65); z-index: 100020; pointer-events: none;
            opacity: 0; transition: opacity .2s ease, transform .2s ease;
        }
        .maxpland-toast.show { opacity: 1; transform: translate(-50%, -6px); }

        .maxpland-footer {
            grid-area: footer; height: 38px; border-top: 1px solid var(--mp-border-subtle); background: var(--mp-bg-surface);
            padding: 0 18px; display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: var(--mp-text-muted);
        }
        .maxpland-footer kbd {
            background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card); border-radius: 4px;
            padding: 2px 5px; font-size: 10px; font-family: ui-monospace, monospace; color: var(--mp-text-secondary);
        }

        .maxpland-action-wrap { display: inline-flex; align-items: center; position: relative; z-index: 50; }
        .maxpland-action-btn {
            background: none; border: none; padding: 8px; cursor: pointer; display: flex; align-items: center;
            justify-content: center; color: inherit; border-radius: 50%;
            transition: transform .12s ease, opacity .12s ease, color .12s ease; line-height: 1;
        }
        .maxpland-action-btn:hover { opacity: 0.85; transform: scale(1.08); color: #38bdf8; }
        .maxpland-action-btn:active { transform: scale(0.95); }
        .maxpland-action-btn svg { width: 22px; height: 22px; }
        .maxpland-action-btn.loading { animation: mpPulse 1s infinite alternate; pointer-events: none; opacity: 0.5; }

        .maxpland-action-menu {
            position: absolute; bottom: calc(100% + 8px); right: 0;
            background: rgba(16, 19, 24, 0.97); backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 10px; padding: 6px;
            display: none; flex-direction: column; gap: 2px; min-width: 210px;
            box-shadow: 0 12px 34px rgba(0, 0, 0, 0.8); z-index: 1000; animation: mpFadeIn .14s ease-out;
        }
        .maxpland-action-menu.show { display: flex; }
        .maxpland-menu-item {
            background: none; border: none; color: #f8fafc; padding: 7px 11px; border-radius: 6px;
            font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 9px;
            text-align: left; transition: background-color .12s, color .12s; white-space: nowrap;
        }
        .maxpland-menu-item:hover { background: var(--mp-blue); color: #ffffff; }
        .maxpland-menu-item svg { width: 14px; height: 14px; flex-shrink: 0; }
        .maxpland-menu-divider { height: 1px; background: rgba(255, 255, 255, 0.08); margin: 3px 0; }

        .maxpland-story-tools {
            position: fixed; top: 18px; right: 80px; z-index: 10001;
            display: flex; align-items: center; gap: 6px; background: rgba(16, 19, 24, 0.88);
            backdrop-filter: blur(10px); border: 1px solid var(--mp-border-subtle); border-radius: 20px; padding: 4px 10px;
        }
        .maxpland-story-btn {
            background: none; border: none; color: #f8fafc; font-size: 12px; font-weight: 600; cursor: pointer;
            display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 12px;
            transition: background .15s, color .15s;
        }
        .maxpland-story-btn:hover { background: rgba(255,255,255,0.12); color: #38bdf8; }

        .maxpland-avatar-badge {
            display: flex; align-items: center; justify-content: center; gap: 5px;
            margin: 10px auto 0 auto; width: fit-content; text-align: center;
            background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card); border-radius: 6px;
            padding: 4px 10px; font-size: 11.5px; font-weight: 600; color: #38bdf8; cursor: pointer;
            transition: all .12s;
        }
        .maxpland-avatar-badge:hover { background: var(--mp-bg-hover); border-color: #38bdf8; }

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

        .maxpland-health-hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 14px; }
        .maxpland-health-card { background: var(--mp-bg-card); border: 1px solid var(--mp-border-card); border-radius: 8px; padding: 14px 16px; }
        .maxpland-health-title { font-size: 11px; font-weight: 700; color: var(--mp-text-muted); text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px; }
        .maxpland-health-val { font-size: 22px; font-weight: 800; color: var(--mp-text-primary); font-variant-numeric: tabular-nums; }
        .maxpland-health-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 8px; border-radius: 5px; font-weight: 600; margin-top: 6px; }
        .maxpland-chart-box { background: var(--mp-bg-card); border: 1px solid var(--mp-border-card); border-radius: 8px; padding: 16px; margin-bottom: 14px; }
        .maxpland-sparkline { width: 100%; height: 130px; overflow: visible; }

        @keyframes mpPulse { from { transform: scale(1); opacity: 0.6; } to { transform: scale(1.15); opacity: 1; color: #38bdf8; } }
        @keyframes mpFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    `;

    /* ==========================================================================
       2. UNIFIED DATABASE LAYER (IndexedDB v8 — Generic Transaction Primitives)
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
                    const ensureStore = (name, keyPath) => {
                        if (!db.objectStoreNames.contains(name)) return db.createObjectStore(name, { keyPath });
                        return null;
                    };
                    ensureStore('snapshots', 'timestamp');
                    ensureStore('whitelist', 'id');
                    ensureStore('churn', 'timestamp');
                    ensureStore('user_activity', 'id');
                    ensureStore('checkpoints', 'key'); // Replaces fragile localStorage resume checkpoints
                    const vault = ensureStore('media_vault', 'key');
                    if (vault) vault.createIndex('downloaded_at', 'downloaded_at', { unique: false });
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

        // Core transaction wrapper: eliminates repetitive Promise/tx boilerplate across 14 methods
        static async tx(storeName, mode, executor, signal = null) {
            if (signal?.aborted) throw new DOMException('Operation aborted by user', 'AbortError');
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, mode);
                const store = tx.objectStore(storeName);
                const abortHandler = () => { try { tx.abort(); } catch (_) {} };
                signal?.addEventListener('abort', abortHandler, { once: true });
                const cleanup = () => signal?.removeEventListener('abort', abortHandler);

                let resultValue;
                try {
                    resultValue = executor(store, tx, (val) => { resultValue = val; });
                } catch (err) {
                    cleanup();
                    try { tx.abort(); } catch (_) {}
                    reject(err);
                    return;
                }

                tx.oncomplete = () => { cleanup(); resolve(resultValue); };
                tx.onerror = () => { cleanup(); reject(tx.error || new Error(`IndexedDB ${storeName} failed`)); };
                tx.onabort = () => {
                    cleanup();
                    reject(signal?.aborted
                        ? new DOMException('Operation aborted by user', 'AbortError')
                        : (tx.error || new Error(`IndexedDB ${storeName} aborted`)));
                };
            });
        }

        static async getWhitelist() {
            try {
                return await this.tx('whitelist', 'readonly', (store, _, setResult) => {
                    const req = store.getAll();
                    req.onsuccess = () => setResult(new Map((req.result || []).map(item => [String(item.id), item])));
                });
            } catch (_) {
                return new Map();
            }
        }

        static async toggleWhitelist(user) {
            const uid = getUid(user);
            if (!uid) throw new Error('Missing user ID');
            return this.tx('whitelist', 'readwrite', (store, _, setResult) => {
                const req = store.get(uid);
                req.onsuccess = () => {
                    const adding = !req.result;
                    if (adding) {
                        store.put({
                            id: uid,
                            username: user.username || '',
                            full_name: user.full_name || '',
                            profile_pic_url: user.profile_pic_url || '',
                            is_verified: Boolean(user.is_verified),
                            is_private: Boolean(user.is_private),
                            added_at: Date.now()
                        });
                    } else {
                        store.delete(uid);
                    }
                    setResult(adding);
                };
            });
        }

        static async importWhitelist(usersList) {
            return this.tx('whitelist', 'readwrite', (store, _, setResult) => {
                let count = 0;
                for (const u of usersList || []) {
                    const uid = getUid(u);
                    if (!uid) continue;
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
                setResult(count);
            });
        }

        static async saveCheckpoint(endpoint, data) {
            try {
                await this.tx('checkpoints', 'readwrite', (store) => {
                    store.put({ key: `resume_${endpoint}`, ...data, savedAt: Date.now() });
                });
            } catch (_) {}
        }

        static async getCheckpoint(endpoint) {
            try {
                return await this.tx('checkpoints', 'readonly', (store, _, setResult) => {
                    const req = store.get(`resume_${endpoint}`);
                    req.onsuccess = () => setResult(req.result || null);
                });
            } catch (_) {
                return null;
            }
        }

        static async clearCheckpoint(endpoint = null) {
            try {
                await this.tx('checkpoints', 'readwrite', (store) => {
                    if (endpoint) store.delete(`resume_${endpoint}`);
                    else store.clear();
                });
            } catch (_) {}
        }

        static async saveSnapshot(followers, following, accountId = null, signal = null) {
            if (followers.completed !== true || following.completed !== true) {
                throw new Error('Cannot save snapshot from incomplete scan data');
            }
            IgBridge.assertAccount(accountId);
            const compactUser = u => ({
                id: getUid(u),
                username: u.username || '',
                full_name: u.full_name || '',
                profile_pic_url: u.profile_pic_url || '',
                is_verified: Boolean(u.is_verified),
                is_private: Boolean(u.is_private),
                has_anonymous_profile_picture: Boolean(u.has_anonymous_profile_picture)
            });

            const snap = {
                timestamp: Date.now(),
                complete: true,
                account_id: accountId ? String(accountId) : null,
                follower_count: followers.length,
                following_count: following.length,
                follower_ids: followers.map(getUid),
                following_ids: following.map(getUid),
                follower_usernames: Object.fromEntries(followers.map(u => [getUid(u), getUname(u)]).filter(p => p[1])),
                following_usernames: Object.fromEntries(following.map(u => [getUid(u), getUname(u)]).filter(p => p[1])),
                followers_compact: followers.map(compactUser),
                following_compact: following.map(compactUser)
            };

            return this.tx('snapshots', 'readwrite', (store, _, setResult) => {
                store.put(snap);
                const keep = Math.max(1, Math.floor(Number(APP_CONFIG.SNAPSHOT_RETENTION) || 30));
                let seenAccount = 0;
                const cursorReq = store.openCursor(null, 'prev');
                cursorReq.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (!cursor) return;
                    const val = cursor.value;
                    if (!accountId || String(val?.account_id) === String(accountId)) {
                        seenAccount++;
                        if (seenAccount > keep) {
                            try { cursor.delete(); } catch (_) {}
                        } else if (seenAccount > 1 && (val.followers_compact || val.following_compact)) {
                            const stripped = { ...val };
                            delete stripped.followers_compact;
                            delete stripped.following_compact;
                            try { cursor.update(stripped); } catch (_) {}
                        }
                    }
                    cursor.continue();
                };
                setResult(snap);
            }, signal);
        }

        static async getAllSnapshots(accountId = null, limit = 20) {
            try {
                return await this.tx('snapshots', 'readonly', (store, _, setResult) => {
                    const list = [];
                    const req = store.openCursor(null, 'prev');
                    req.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor && list.length < limit) {
                            if (cursor.value.complete === true && (!accountId || String(cursor.value.account_id) === String(accountId))) {
                                list.push(cursor.value);
                            }
                            cursor.continue();
                        } else {
                            setResult(list);
                        }
                    };
                });
            } catch (_) {
                return [];
            }
        }

        static async getLatestSnapshot(accountId = null) {
            const list = await this.getAllSnapshots(accountId, 1);
            return list[0] || null;
        }

        static async getChurnHistory(accountId = null, limit = 30) {
            try {
                return await this.tx('churn', 'readonly', (store, _, setResult) => {
                    const list = [];
                    const req = store.openCursor(null, 'prev');
                    req.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor && list.length < limit) {
                            if (!accountId || String(cursor.value.account_id) === String(accountId)) list.push(cursor.value);
                            cursor.continue();
                        } else {
                            setResult(list);
                        }
                    };
                });
            } catch (_) {
                return [];
            }
        }

        static async saveChurn(record, accountId = null, signal = null) {
            IgBridge.assertAccount(accountId);
            return this.tx('churn', 'readwrite', (store) => {
                store.put({ ...record, timestamp: Date.now(), account_id: accountId ? String(accountId) : null });
                const keep = Math.max(1, Math.floor(Number(APP_CONFIG.SNAPSHOT_RETENTION) || 30));
                let seenAccount = 0;
                const scan = store.openCursor(null, 'prev');
                scan.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (!cursor) return;
                    if (!accountId || String(cursor.value?.account_id) === String(accountId)) {
                        seenAccount++;
                        if (seenAccount > keep) { try { cursor.delete(); } catch (_) {} }
                    }
                    cursor.continue();
                };
            }, signal);
        }

        static async markMediaDownloaded(record) {
            return this.tx('media_vault', 'readwrite', (store) => {
                store.put({ ...record, downloaded_at: Date.now() });
            });
        }

        static async hasMedia(key) {
            try {
                return await this.tx('media_vault', 'readonly', (store, _, setResult) => {
                    const req = store.get(key);
                    req.onsuccess = () => setResult(Boolean(req.result));
                });
            } catch (_) {
                return false;
            }
        }

        static async getMediaVault(limit = 100) {
            try {
                return await this.tx('media_vault', 'readonly', (store, _, setResult) => {
                    const results = [];
                    const req = store.index('downloaded_at').openCursor(null, 'prev');
                    req.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor && results.length < limit) {
                            results.push(cursor.value);
                            cursor.continue();
                        } else {
                            setResult(results);
                        }
                    };
                });
            } catch (_) {
                return [];
            }
        }

        static async getUserActivity(userId) {
            try {
                return await this.tx('user_activity', 'readonly', (store, _, setResult) => {
                    const req = store.get(String(userId));
                    req.onsuccess = () => setResult(req.result || null);
                });
            } catch (_) {
                return null;
            }
        }

        static async saveUserActivity(record) {
            return this.tx('user_activity', 'readwrite', (store) => store.put(record));
        }

        static async clearActivityCache() {
            return this.tx('user_activity', 'readwrite', (store) => store.clear());
        }
    }

    /* ==========================================================================
       3. UNIFIED MEDIA REGISTRY & STEALTH INTERCEPTOR (LRU + Zero-Leak)
       ========================================================================== */

    const MediaRegistry = {
        items: new Map(), // Keyed by media PK or shortcode

        pickBestUrl(candidates) {
            if (!Array.isArray(candidates) || !candidates.length) return null;
            return [...candidates]
                .sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)))[0]?.url || null;
        },

        setEntry(key, entry) {
            if (!key) return;
            if (this.items.has(key)) this.items.delete(key);
            this.items.set(key, entry);
            // Bounded LRU eviction
            if (this.items.size > APP_CONFIG.MEDIA_REGISTRY_MAX) {
                const oldestKey = this.items.keys().next().value;
                this.items.delete(oldestKey);
            }
        },

        normalizeNode(node, index = 0, fallbackId = '') {
            const isVideo = Boolean(node?.video_versions?.length) || node?.media_type === 2 || Boolean(node?.is_video);
            const videoUrl = this.pickBestUrl(node?.video_versions) || node?.video_url || node?.videoUrl || null;
            const imageUrl = this.pickBestUrl(node?.image_versions2?.candidates) || node?.display_url || node?.src || null;
            return {
                index,
                id: String(node?.pk || node?.id || fallbackId || index).split('_')[0],
                mediaType: isVideo ? 'video' : 'image',
                imageUrl,
                progressiveVideoUrl: videoUrl
            };
        },

        cacheItem(item) {
            if (!item || typeof item !== 'object') return null;
            const id = String(item.pk || item.id || '').split('_')[0];
            const shortcode = String(item.code || item.shortcode || '').trim();
            if (!id && !shortcode) return null;

            const rawNodes = Array.isArray(item.carousel_media) && item.carousel_media.length ? item.carousel_media : [item];
            const nodes = rawNodes.map((n, idx) => this.normalizeNode(n, idx, id || shortcode));
            const first = nodes[0] || {};
            const entry = {
                id,
                shortcode,
                username: item.user?.username || item.owner?.username || '',
                caption: item.caption?.text || '',
                isVideo: first.mediaType === 'video',
                videoUrl: first.progressiveVideoUrl,
                imageUrl: first.imageUrl,
                nodes
            };

            if (id) this.setEntry(id, entry);
            if (shortcode) this.setEntry(shortcode, entry);
            return entry;
        },

        parseAndCache(json, depth = 0) {
            if (!json || typeof json !== 'object' || depth > 4) return;
            try {
                if (Array.isArray(json.reels_media)) {
                    for (const reel of json.reels_media) {
                        if (Array.isArray(reel?.items)) for (const it of reel.items) this.cacheItem(it);
                    }
                }
                if (json.reels && typeof json.reels === 'object') {
                    for (const k of Object.keys(json.reels)) {
                        const reel = json.reels[k];
                        if (Array.isArray(reel?.items)) for (const it of reel.items) this.cacheItem(it);
                    }
                }
                if (Array.isArray(json.items)) {
                    for (const it of json.items) this.cacheItem(it);
                }
                if (json.data && typeof json.data === 'object') {
                    this.parseAndCache(json.data, depth + 1);
                }
            } catch (_) {}
        },

        scanDomScripts() {
            try {
                for (const s of document.querySelectorAll('script[type="application/json"]')) {
                    const text = s.textContent || '';
                    if (text.includes('video_versions') || text.includes('image_versions2')) {
                        try { this.parseAndCache(JSON.parse(text)); } catch (_) {}
                    }
                }
            } catch (_) {}
        },

        extractFromFiber(el) {
            if (!el) return null;
            const keys = Object.keys(el);
            const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
            const propsKey = keys.find(k => k.startsWith('__reactProps$'));

            const inspectProps = (p) => {
                if (!p || typeof p !== 'object') return null;
                const item = p.item || p.media || p.story || p.post || p.xdt_shortcode_media;
                if (item && (item.video_versions || item.image_versions2 || item.carousel_media)) {
                    const cached = this.cacheItem(item);
                    if (cached) {
                        const url = cached.isVideo ? (cached.videoUrl || cached.imageUrl) : (cached.imageUrl || cached.videoUrl);
                        return { ...cached, url, source: 'fiber' };
                    }
                }
                if (Array.isArray(p.implementations)) {
                    for (const impl of p.implementations) {
                        const hd = impl?.data?.hdSrc || impl?.data?.sdSrc;
                        if (hd && typeof hd === 'string' && /^https?:\/\//i.test(hd)) {
                            return { url: hd, isVideo: true, id: null, nodes: [{ index: 0, mediaType: 'video', progressiveVideoUrl: hd }], source: 'fiber-impl-hd' };
                        }
                        if (typeof impl?.data?.manifest === 'string') {
                            const m = impl.data.manifest.match(/<BaseURL>([^<]+)<\/BaseURL>/i);
                            if (m?.[1]) {
                                const cleanUrl = m[1].replace(/&amp;/g, '&');
                                return { url: cleanUrl, isVideo: true, id: null, nodes: [{ index: 0, mediaType: 'video', progressiveVideoUrl: cleanUrl }], source: 'fiber-manifest' };
                            }
                        }
                    }
                }
                return null;
            };

            if (propsKey) {
                const res = inspectProps(el[propsKey]);
                if (res) return res;
            }
            if (fiberKey) {
                let curr = el[fiberKey], depth = 0;
                while (curr && depth < 38) {
                    const res = inspectProps(curr.memoizedProps || curr.pendingProps || curr.props);
                    if (res) return res;
                    curr = curr.return;
                    depth++;
                }
            }
            return null;
        }
    };

    /* ==========================================================================
       4. API TRANSPORT ENGINE (IgBridge)
       ========================================================================== */

    class IgBridge {
        static currentUserId = null;
        static currentUsername = null;
        static wwwClaim = null;
        static cooldownUntil = 0;
        static cooldownAccount = null;
        static hardBlockAccount = null;
        static hardBlockAt = 0;

        static getAppId() {
            return APP_CONFIG.INSTAGRAM_WEB_APP_ID;
        }

        static getCookie(name) {
            const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
            return match ? decodeURIComponent(match[3]) : null;
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
            return ['AUTH', 'CHECKPOINT', 'RATE_LIMIT', 'ACCOUNT_CHANGED', 'BLOCKED', 'DAILY_CAP'].includes(err?.code);
        }

        static restoreHardBlock() {
            try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.HARD_BLOCK) || 'null');
                if (saved?.account) {
                    this.hardBlockAccount = String(saved.account);
                    this.hardBlockAt = Number(saved.at) || Date.now();
                }
            } catch (_) {}
        }

        static clearHardBlock() {
            this.hardBlockAccount = null;
            this.hardBlockAt = 0;
            try { localStorage.removeItem(STORAGE_KEYS.HARD_BLOCK); } catch (_) {}
        }

        static async resolveCurrentUser() {
            const cookieId = this.getCookie('ds_user_id');
            if (!cookieId) {
                this.currentUserId = null;
                this.currentUsername = null;
                return { id: null, username: null };
            }
            if (this.currentUserId !== cookieId) this.currentUsername = null;
            this.currentUserId = cookieId;

            try {
                const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                const sharedViewer = page._sharedData?.config?.viewer;
                const sharedViewerId = page._sharedData?.config?.viewerId || sharedViewer?.id;
                if (sharedViewerId && String(sharedViewerId) === this.currentUserId && sharedViewer?.username) {
                    this.currentUsername = sharedViewer.username;
                }
                const initialViewer = page.__initialData?.data?.viewer;
                if (initialViewer?.id && String(initialViewer.id) === this.currentUserId && initialViewer.username) {
                    this.currentUsername = initialViewer.username;
                }
            } catch (_) {}

            if (!this.currentUsername) {
                try {
                    const uid = this.currentUserId;
                    const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])');
                    for (const s of scripts) {
                        const txt = s.textContent || '';
                        if (!txt.includes(uid) || !txt.includes('username')) continue;
                        const m = txt.match(new RegExp(`"(?:id|viewerId|actorID)"\\s*:\\s*"${uid}"[^{}]{0,300}"username"\\s*:\\s*"([a-zA-Z0-9._]+)"`))
                               || txt.match(new RegExp(`"username"\\s*:\\s*"([a-zA-Z0-9._]+)"[^{}]{0,300}"(?:id|viewerId|actorID)"\\s*:\\s*"${uid}"`));
                        if (m?.[1] && !['null', 'undefined'].includes(m[1])) {
                            this.currentUsername = m[1];
                            break;
                        }
                    }
                } catch (_) {}
            }

            if (!this.currentUsername) {
                try {
                    const nav = document.querySelector('nav, [role="navigation"], aside');
                    if (nav) {
                        const reserved = new Set(['', 'explore', 'reels', 'direct', 'stories', 'your_activity', 'settings', 'accounts', 'api', 'legal', 'about', 'p', 'reel', 'tv']);
                        const links = [...nav.querySelectorAll('a[href^="/"]')];
                        const profileLink = links.find(a => {
                            const aria = (a.getAttribute('aria-label') || '') + (a.querySelector('svg')?.getAttribute('aria-label') || '');
                            return /Profile|โปรไฟล์/i.test(aria);
                        }) || links.find(a => a.querySelector('img'));

                        if (profileLink) {
                            const parts = (profileLink.getAttribute('href') || '').replace(/^\/|\/$/g, '').split('/');
                            if (parts.length === 1 && !reserved.has(parts[0].toLowerCase())) {
                                this.currentUsername = parts[0];
                            }
                        }
                    }
                } catch (_) {}
            }

            return { id: this.currentUserId, username: this.currentUsername };
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
                throw this.error(`Instagram blocked this account. Clear it in Settings${hours > 0 ? ` (wait ~${hours}h)` : ''}.`, 'BLOCKED');
            }
            if (this.cooldownAccount === accountId && Date.now() < this.cooldownUntil) {
                const seconds = Math.ceil((this.cooldownUntil - Date.now()) / 1000);
                throw this.error(`Instagram rate limit active. Wait ${seconds}s.`, 'RATE_LIMIT', 429);
            }

            const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            const fetchFn = typeof page.fetch === 'function' ? page.fetch.bind(page) : fetch;
            const method = String(options.method || 'GET').toUpperCase();
            const csrf = this.getCookie('csrftoken');

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
                const onAbort = () => controller.abort();
                options.signal?.addEventListener('abort', onAbort, { once: true });
                let timedOut = false;
                const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);

                try {
                    const res = await fetchFn(target.href, {
                        method, headers, credentials: 'include',
                        body: options.body ?? options.data,
                        signal: controller.signal
                    });
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
                        throw this.error('Instagram requires checkpoint verification. Solve it on web first.', 'CHECKPOINT', res.status);
                    }
                    if (res.status === 401 || /login_required|\/accounts\/login/i.test(message + redirected)) {
                        throw this.error('Session expired. Please log into Instagram and refresh.', 'AUTH', res.status);
                    }
                    if (res.status === 429 || /feedback_required|please wait|try again later|rate.limit/i.test(message)) {
                        if (/feedback_required|sentry_block/i.test(message)) {
                            this.hardBlockAccount = accountId;
                            this.hardBlockAt = Date.now();
                            try { localStorage.setItem(STORAGE_KEYS.HARD_BLOCK, JSON.stringify({ account: accountId, at: this.hardBlockAt })); } catch (_) {}
                            if (typeof showToast === 'function') showToast('⛔ Instagram blocked this account. Stop for 6+ hours.', 12000);
                            throw this.error('Instagram blocked this account (feedback_required). Wait 6+ hours, then clear block in Settings.', 'BLOCKED', res.status);
                        }
                        const retry = res.headers?.get('Retry-After');
                        const delay = retry && /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
                        this.cooldownUntil = Date.now() + Math.max(5 * 60 * 1000, Number.isFinite(delay) ? delay : 0);
                        this.cooldownAccount = accountId;
                        if (typeof showToast === 'function') {
                            showToast(`⏳ Soft rate limit — cooling down ${Math.max(1, Math.ceil((this.cooldownUntil - Date.now()) / 1000))}s`, 4500);
                        }
                        throw this.error('Instagram soft rate limit reached.', 'RATE_LIMIT', res.status);
                    }
                    if (res.status === 403) throw this.error('Instagram forbidden (403). Check account status.', 'AUTH', 403);
                    if (/^\s*</.test(text)) throw this.error('Instagram returned HTML instead of JSON.', 'HTML_RESPONSE', res.status);
                    if (!res.ok) throw this.error(`Instagram HTTP ${res.status}`, 'HTTP', res.status);
                    if (!data || typeof data !== 'object') throw this.error('Invalid JSON payload', 'PAYLOAD', res.status);
                    if (data.status === 'fail' || data.errors?.length) throw this.error('Instagram rejected data request', 'API', res.status);
                    return data;
                } catch (err) {
                    if (options.signal?.aborted) throw new DOMException('Operation aborted by user', 'AbortError');
                    this.assertAccount(accountId);
                    if (timedOut) throw this.error('Request timed out after 30s.', 'TIMEOUT');
                    const transient = err.status >= 500 || (!err.code && err.name === 'TypeError');
                    if (!transient || attempt + 1 >= attempts) throw err;
                } finally {
                    clearTimeout(timeout);
                    options.signal?.removeEventListener('abort', onAbort);
                }
                await sleep(3000 * (attempt + 1));
            }
        }

        static async unfollowUser(userId) {
            const uid = String(userId || '');
            if (!/^\d+$/.test(uid)) throw new Error('Invalid User ID to unfollow');
            const user = STATE.following.find(u => getUid(u) === uid);
            if (isProtectedUser(uid, user?.username)) throw new Error('This account is protected in Whitelist');
            const budget = budgetState();
            if (budget.blocked) {
                throw this.error(`Daily unfollow ceiling reached (${budget.used}/${budget.cap}).`, 'DAILY_CAP');
            }
            const accountId = STATE.relationshipAccountId || this.getCookie('ds_user_id');
            this.assertAccount(accountId);
            if (!this.getCookie('csrftoken')) throw this.error('CSRF token missing. Refresh Instagram.', 'AUTH');

            const res = await this.request(`/web/friendships/${uid}/unfollow/`, {
                method: 'POST',
                accountId,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            if (res?.friendship_status?.following === false || (res?.status === 'ok' && res.friendship_status === undefined)) {
                return true;
            }
            throw this.error('Instagram did not confirm the unfollow.', 'UNCONFIRMED');
        }

        static async fetchRelationshipPage(endpoint, userId, cursor = null, options = {}) {
            const uid = String(userId || '');
            if (!/^\d+$/.test(uid) || !['followers', 'following'].includes(endpoint)) throw new Error('Invalid relationship target');
            this.assertAccount(uid);
            const count = Math.min(50, Math.max(1, Number(APP_CONFIG.PAGE_SIZE) || 50));

            if (options.transport === 'graphql') {
                if (!isGqlFallbackWarned) {
                    isGqlFallbackWarned = true;
                    console.warn('[MaxPland] Using GraphQL relationship fallback transport');
                }
                const hash = endpoint === 'followers' ? '37479f2b8209594dde7facb0d904896a' : '58712303d941c6855d4e888c5f0cd22f';
                const variables = { id: uid, first: count, ...(cursor ? { after: cursor } : {}) };
                const qs = new URLSearchParams({ query_hash: hash, variables: JSON.stringify(variables) });
                const data = await this.request(`/graphql/query/?${qs}`, { ...options, accountId: uid });
                const conn = data?.data?.user?.[endpoint === 'followers' ? 'edge_followed_by' : 'edge_follow'];
                if (!Array.isArray(conn?.edges) || typeof conn.page_info?.has_next_page !== 'boolean') {
                    throw new Error('Invalid GraphQL relationship page');
                }
                return {
                    users: conn.edges.map(edge => edge?.node),
                    has_more: conn.page_info.has_next_page,
                    next_max_id: conn.page_info.has_next_page ? conn.page_info.end_cursor : null
                };
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
            const limit = Math.max(1, Math.min(250, Number(pageSafetyLimit) || 250));

            // Hydrate checkpoint from IndexedDB (no 5MB localStorage bottleneck)
            const savedResume = await MaxPlandVault.getCheckpoint(endpoint);
            if (savedResume) {
                const sameUser = String(savedResume.userId) === String(userId);
                const age = Date.now() - (Number(savedResume.savedAt) || 0);
                const valid = sameUser && Array.isArray(savedResume.users) && savedResume.cursor && (Number(savedResume.pagesFetched) || 0) < limit && age <= APP_CONFIG.CHECKPOINT_TTL_MS;
                if (valid) {
                    for (const u of savedResume.users) {
                        const id = getUid(u);
                        if (id && !seenUsers.has(id)) { seenUsers.add(id); all.push(u); }
                    }
                    cursor = String(savedResume.cursor);
                    transport = savedResume.transport === 'graphql' ? 'graphql' : 'rest';
                    all.pagesFetched = Number(savedResume.pagesFetched) || 0;
                    STATE.scanResumedFrom = all.pagesFetched;
                    onProgress?.(all.length, all.pagesFetched, `Resumed from IndexedDB checkpoint at page ${all.pagesFetched} (${all.length.toLocaleString()} users)`);
                } else {
                    await MaxPlandVault.clearCheckpoint(endpoint);
                }
            }

            const signal = STATE.scanController?.signal;
            const fetchStats = { requestMs: 0, waitMs: 0 };
            const PACE = {
                A: { page: [6000, 12000], restEvery: 30, rest: [60000, 120000] },
                B: { page: [3000, 6000], restEvery: 40, rest: [45000, 90000] },
                C: { page: [1500, 3000], restEvery: 50, rest: [30000, 60000] }
            }[speedMode] || { page: [6000, 12000], restEvery: 30, rest: [60000, 120000] };

            let lastSavedPage = all.pagesFetched;
            const persistCheckpoint = async (force = false) => {
                if (!cursor) return;
                if (!force && all.pagesFetched - lastSavedPage < 4) return;
                lastSavedPage = all.pagesFetched;
                await MaxPlandVault.saveCheckpoint(endpoint, {
                    userId: String(userId), cursor, transport, pagesFetched: all.pagesFetched, users: all
                });
            };

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
                        if (all.pagesFetched || transport !== 'rest' || err.code !== 'HTTP' || ![400, 404].includes(err.status)) throw err;
                        transport = 'graphql';
                        onProgress?.(0, 0, 'Switching to GraphQL fallback endpoint...');
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
                        const id = getUid(user);
                        if (!/^\d+$/.test(id) || seenUsers.has(id)) continue;
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

                    all.pagesFetched++;
                    onProgress?.(all.length, all.pagesFetched, null);
                    if (STATE.stopScanFlag) break;

                    if (!next) {
                        all.completed = true;
                        await MaxPlandVault.clearCheckpoint(endpoint);
                        break;
                    }
                    if (seenCursors.has(next)) throw new Error('Repeated relationship cursor');
                    if (before === all.length) throw new Error('Relationship pagination made no progress');
                    if (all.pagesFetched >= limit) throw new Error(`Safety page limit reached (${limit} pages)`);

                    seenCursors.add(next);
                    cursor = next;
                    await persistCheckpoint(false);

                    const pause = PACE.page[0] + Math.floor(Math.random() * (PACE.page[1] - PACE.page[0]));
                    const tw = performance.now();
                    for (let ms = 0; ms < pause && !STATE.stopScanFlag && !signal?.aborted; ms += 250) await sleep(250);
                    if (PACE.restEvery && all.pagesFetched % PACE.restEvery === 0 && !STATE.stopScanFlag && !signal?.aborted) {
                        const rest = PACE.rest[0] + Math.floor(Math.random() * (PACE.rest[1] - PACE.rest[0]));
                        onProgress?.(all.length, all.pagesFetched, `Breathing rest ${Math.round(rest / 1000)}s to stay below rate-limit radar...`);
                        for (let ms = 0; ms < rest && !STATE.stopScanFlag && !signal?.aborted; ms += 250) await sleep(250);
                    }
                    fetchStats.waitMs += performance.now() - tw;
                }
            } catch (err) {
                all.lastError = err;
                await persistCheckpoint(true);
                onProgress?.(all.length, all.pagesFetched, err.message);
            }
            all.fetchStats = fetchStats;
            return all;
        }

        static shortcodeToMediaId(shortcode) {
            if (!/^[A-Za-z0-9_-]+$/.test(String(shortcode || ''))) throw new Error('Invalid shortcode');
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
            let value = 0n;
            for (const ch of String(shortcode)) {
                const idx = alphabet.indexOf(ch);
                if (idx < 0) throw new Error('Invalid shortcode');
                value = value * 64n + BigInt(idx);
            }
            return value.toString();
        }

        static async fetchMediaInfo(shortcodeOrId) {
            const raw = String(shortcodeOrId || '').trim();
            if (MediaRegistry.items.has(raw)) {
                return MediaRegistry.items.get(raw);
            }
            const mediaId = /^\d+$/.test(raw) ? raw : this.shortcodeToMediaId(raw);
            if (MediaRegistry.items.has(mediaId)) {
                return MediaRegistry.items.get(mediaId);
            }
            const data = await this.request(`/api/v1/media/${mediaId}/info/`);
            const item = (data?.items || [])[0];
            if (!item) throw new Error('Could not fetch media data from Instagram API');
            return MediaRegistry.cacheItem(item);
        }

        static async resolveMedia(shortcode, articleElement = null) {
            // 1. Zero-API Fiber & Cache fast-path
            if (articleElement) {
                const fiberEntry = MediaRegistry.extractFromFiber(articleElement);
                if (fiberEntry && Array.isArray(fiberEntry.nodes) && fiberEntry.nodes.length) {
                    return { ...fiberEntry, shortcode: shortcode || fiberEntry.shortcode || fiberEntry.id };
                }
            }
            if (shortcode && MediaRegistry.items.has(shortcode)) {
                return MediaRegistry.items.get(shortcode);
            }
            // 2. Fallback to authenticated API
            return this.fetchMediaInfo(shortcode);
        }

        static async fetchUserProfileHD(username) {
            try {
                const data = await this.request(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
                const user = data?.data?.user;
                return user?.profile_pic_url_hd || user?.profile_pic_url || null;
            } catch (_) {
                return null;
            }
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

        static async fetchStoryViewers(mediaId) {
            if (!/^\d+$/.test(String(mediaId || ''))) throw new Error('Invalid story media id');
            const data = await this.request(`/api/v1/media/${String(mediaId)}/list_reel_media_viewer/`);
            return Array.isArray(data?.users) ? data.users : [];
        }
    }
/* ==========================================================================
       5. STATE, WRITE BUDGET & STEALTH INTERCEPTOR (Zero Global Footprint)
       ========================================================================== */

    const DEFAULT_PREFS = Object.freeze({
        stealthStory: true,
        cleanFeed: true,
        quickDownloadFeed: true,
        quickDownloadStory: true,
        autoWaitRateLimit: true,
        inactiveThresholdDays: 180,
        scanSpeed: 'A',
        dailyUnfollowCap: 180
    });

    function loadPrefs() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.PREFS);
            if (raw && raw !== 'undefined') {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return { ...DEFAULT_PREFS, ...parsed };
            }
        } catch (_) {}
        return { ...DEFAULT_PREFS };
    }

    function savePrefs(prefs = STATE.prefs) {
        if (!prefs || typeof prefs !== 'object') return;
        try { localStorage.setItem(STORAGE_KEYS.PREFS, JSON.stringify(prefs)); } catch (_) {}
    }

    const StudioController = {
        open: () => {},
        close: () => {}
    };

    const STATE = {
        currentUser: { id: null, username: null },
        relationshipAccountId: null,
        followers: [],
        following: [],
        notFollowingBack: [],
        fans: [],
        mutual: [],
        lostFollowers: [],
        ghostFollowers: [],
        renamed: [],
        inactiveFollowing: [],
        churnLost30: [],
        churnCycles: 0,
        whitelist: new Map(),
        whitelistByName: new Map(),
        whitelistByNameRef: null,
        selectedIds: new Set(),
        isScanning: false,
        stopScanFlag: false,
        scanPaused: false,
        scanIncomplete: false,
        scanResumedFrom: 0,
        scanController: null,
        isScanningInactive: false,
        stopInactiveScanFlag: false,
        inactiveController: null,
        isUnfollowing: false,
        stopUnfollowFlag: false,
        lastUnfollowAt: 0,
        isMediaQueueRunning: false,
        mediaQueue: null,
        activeTab: 'relationship',
        relationshipFilter: 'not_following_back',
        relationshipLimit: 100,
        searchQuery: '',
        searchRenderTimer: null,
        progressHideTimer: null,
        scanStartTime: 0,
        scanStatus: null,
        subFilters: {
            excludeVerified: false,
            excludePrivate: false,
            excludeNoAvatar: false,
            excludeWhitelist: false,
            onlyFollowing: false,
            onlyNotFollowed: false
        },
        prefs: loadPrefs()
    };

    function isProtectedUser(uid, username = '') {
        const id = String(uid || '');
        const name = String(username || '').toLowerCase();
        if (!name) return STATE.whitelist.has(id);
        if (STATE.whitelistByNameRef !== STATE.whitelist) {
            STATE.whitelistByNameRef = STATE.whitelist;
            STATE.whitelistByName = new Map(
                [...STATE.whitelist.values()]
                    .filter(w => w.username)
                    .map(w => [String(w.username).toLowerCase(), w])
            );
        }
        return STATE.whitelistByName.has(name) || STATE.whitelist.has(id);
    }

    function localDayKey(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function getBudgetStorageKey() {
        const uid = STATE.relationshipAccountId || STATE.currentUser?.id || IgBridge.getCookie('ds_user_id');
        return uid ? `${STORAGE_KEYS.WRITE_BUDGET}_${uid}` : STORAGE_KEYS.WRITE_BUDGET;
    }

    function getDailyUnfollowCap() {
        const cap = Number(STATE.prefs?.dailyUnfollowCap);
        return Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : DEFAULT_PREFS.dailyUnfollowCap;
    }

    function getWriteBudget() {
        const day = localDayKey();
        const key = getBudgetStorageKey();
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem(key) || localStorage.getItem(STORAGE_KEYS.WRITE_BUDGET) || 'null');
        } catch (_) {}
        if (!saved || saved.day !== day) return { day, daily: 0, tz: 'local' };
        return { day, daily: Math.max(0, Number(saved.daily) || 0), tz: 'local' };
    }

    function budgetState() {
        const used = getWriteBudget().daily;
        const cap = getDailyUnfollowCap();
        const remaining = cap > 0 ? Math.max(0, cap - used) : Infinity;
        return { used, cap, remaining, blocked: cap > 0 && used >= cap };
    }

    function noteWrite() {
        const b = getWriteBudget();
        b.daily++;
        const key = getBudgetStorageKey();
        try {
            const payload = JSON.stringify(b);
            localStorage.setItem(key, payload);
            if (key !== STORAGE_KEYS.WRITE_BUDGET) localStorage.setItem(STORAGE_KEYS.WRITE_BUDGET, payload);
        } catch (_) {}
        syncBudgetLabels();
    }

    function resetWriteBudget() {
        try {
            localStorage.removeItem(getBudgetStorageKey());
            localStorage.removeItem(STORAGE_KEYS.WRITE_BUDGET);
        } catch (_) {}
        syncBudgetLabels();
    }

    function formatBudget() {
        const { used, cap, blocked } = budgetState();
        if (!cap) return `${used.toLocaleString()} unfollowed today · ceiling off`;
        return `${used.toLocaleString()} / ${cap.toLocaleString()} today${blocked ? ' · ceiling reached' : ''}`;
    }

    function syncBudgetLabels() {
        const text = formatBudget();
        const sLabel = document.getElementById('maxpland-budget-label');
        if (sLabel) sLabel.textContent = text;
        const hPill = document.getElementById('maxpland-header-budget');
        if (hPill) {
            const { blocked } = budgetState();
            hPill.textContent = `Quota: ${text}`;
            hPill.style.color = blocked ? 'var(--mp-rose)' : 'var(--mp-text-secondary)';
        }
    }

    function isStorySeenRequest(url, body) {
        if (!STATE.prefs?.stealthStory) return false;
        const urlStr = String(url || '');
        const bodyStr = typeof body === 'string' ? body : (body ? JSON.stringify(body) : '');

        if (/web_profile_info|users\/web_profile|PolarisProfile|ProfilePage|[A-Za-z0-9_]*Query\b/i.test(urlStr) ||
            /operationName["']?\s*[:=]\s*["']?[A-Za-z0-9_]*Query\b/i.test(bodyStr)) {
            return false;
        }
        return /\/(?:api\/v1\/)?stories\/reel\/seen/i.test(urlStr) ||
               /viewSeenAt|reels?_?media_?seen|Stor(?:y|ies)Seen/i.test(urlStr) ||
               /viewSeenAt|reels?_?media_?seen|Stor(?:y|ies)Seen/i.test(bodyStr);
    }

    function installStorySeenInterceptor() {
        if (isStealthHookInstalled) return;
        isStealthHookInstalled = true;

        try {
            const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            const FAKE_JSON = JSON.stringify({ status: 'ok' });
            const isMediaPayloadUrl = (u) => Boolean(u && typeof u === 'string' && /reels?_?media|graphql\/query|\/api\/v1\/(?:media|feed)\//i.test(u));

            if (typeof win.fetch === 'function') {
                const rawFetch = win.fetch;
                const stealthFetch = function (resource, init = {}) {
                    const url = typeof resource === 'string' ? resource : (resource?.url || '');
                    const body = init?.body || null;

                    if (isStorySeenRequest(url, body)) {
                        stealthSeenBlockedCount++;
                        return Promise.resolve(new Response(FAKE_JSON, {
                            status: 200,
                            statusText: 'OK',
                            headers: { 'Content-Type': 'application/json' }
                        }));
                    }

                    const resPromise = rawFetch.apply(this, arguments);
                    if (isMediaPayloadUrl(url)) {
                        resPromise.then(res => {
                            if (typeof res?.clone === 'function') {
                                res.clone().json().then(data => MediaRegistry.parseAndCache(data)).catch(() => {});
                            }
                        }).catch(() => {});
                    }
                    return resPromise;
                };

                try {
                    Object.defineProperty(stealthFetch, 'name', { value: rawFetch.name || 'fetch' });
                    Object.defineProperty(stealthFetch, 'length', { value: rawFetch.length || 1 });
                    const origToString = Function.prototype.toString;
                    stealthFetch.toString = function () {
                        return this === stealthFetch ? origToString.call(rawFetch) : origToString.call(this);
                    };
                } catch (_) {}

                win.fetch = stealthFetch;
            }

            if (win.XMLHttpRequest?.prototype) {
                const rawOpen = win.XMLHttpRequest.prototype.open;
                const rawSend = win.XMLHttpRequest.prototype.send;
                const xhrUrlMap = new WeakMap();

                win.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                    try { xhrUrlMap.set(this, typeof url === 'string' ? url : String(url || '')); } catch (_) {}
                    return rawOpen.apply(this, [method, url, ...rest]);
                };

                win.XMLHttpRequest.prototype.send = function (body) {
                    try {
                        const url = xhrUrlMap.get(this) || '';
                        if (isStorySeenRequest(url, body)) {
                            stealthSeenBlockedCount++;
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
                        if (isMediaPayloadUrl(url)) {
                            this.addEventListener('load', function () {
                                try {
                                    if (this.status === 200 && this.responseText) {
                                        MediaRegistry.parseAndCache(JSON.parse(this.responseText));
                                    }
                                } catch (_) {}
                            }, { once: true });
                        }
                    } catch (_) {}
                    return rawSend.apply(this, arguments);
                };
            }

            if (typeof win.navigator?.sendBeacon === 'function') {
                const rawBeacon = win.navigator.sendBeacon.bind(win.navigator);
                win.navigator.sendBeacon = function (url, data) {
                    try {
                        if (isStorySeenRequest(url, data)) {
                            stealthSeenBlockedCount++;
                            return true;
                        }
                    } catch (_) {}
                    return rawBeacon(url, data);
                };
            }
        } catch (_) {}
    }
    installStorySeenInterceptor();

    /* ==========================================================================
       6. UNIFIED MEDIA DOWNLOADER & SINGLE-OBSERVER DOM ENGINE
       ========================================================================== */

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

    function gmDownload(url, name) {
        return new Promise((resolve, reject) => {
            const tryDirectAnchor = () => {
                try {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = name;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => a.remove(), 1000);
                    resolve(name);
                } catch (e) {
                    reject(e);
                }
            };

            const tryFetchBlob = () => {
                fetch(url, { credentials: 'omit' })
                    .then(res => {
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        return res.blob();
                    })
                    .then(blob => resolve(downloadBlob(blob, name)))
                    .catch(() => tryDirectAnchor());
            };

            if (typeof GM_download === 'function') {
                try {
                    GM_download({
                        url,
                        name,
                        saveAs: false,
                        timeout: 120000,
                        ontimeout: tryFetchBlob,
                        onabort: () => reject(new Error('Download aborted')),
                        onload: () => resolve(name),
                        onerror: tryFetchBlob
                    });
                } catch (_) {
                    tryFetchBlob();
                }
            } else {
                tryFetchBlob();
            }
        });
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
        if (!article) return null;
        for (const a of article.querySelectorAll('a[href*="/p/"],a[href*="/reel/"],a[href*="/reels/"],a[href*="/tv/"]')) {
            const m = (a.href || a.getAttribute('href') || '').match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
            if (m?.[1]) return m[1];
        }
        const m = location.href.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
        return m ? m[1] : null;
    }

    function detectActiveCarouselIndex(article) {
        if (!article) return 0;
        const items = [...article.querySelectorAll('ul li')].filter(li => {
            const r = li.getBoundingClientRect();
            return r.width > 40 && r.height > 40;
        });
        if (!items.length) return 0;
        const artRect = article.getBoundingClientRect();
        const centerX = (artRect.left + artRect.right) / 2;
        let bestIdx = 0, minDist = Infinity;
        items.forEach((li, idx) => {
            const r = li.getBoundingClientRect();
            const dist = Math.abs(((r.left + r.right) / 2) - centerX);
            if (dist < minDist) { minDist = dist; bestIdx = idx; }
        });
        return bestIdx;
    }

    async function downloadResolvedMedia(resolved, { allCarousel = false, slideIndex = 0, skipExisting = false } = {}) {
        const accountId = IgBridge.getCookie('ds_user_id');
        IgBridge.assertAccount(accountId);
        const completed = [];
        const nodes = Array.isArray(resolved?.nodes) ? resolved.nodes : [];
        if (!nodes.length) throw new Error('No media nodes resolved');

        const safeIdx = Math.min(Math.max(0, Number(slideIndex) || 0), nodes.length - 1);
        const targetNodes = allCarousel ? nodes : [nodes[safeIdx]];

        for (const node of targetNodes) {
            IgBridge.assertAccount(accountId);
            const code = resolved.shortcode || resolved.id || 'post';
            const key = `${code}:${node.id || node.index}:media`;
            if (skipExisting && await MaxPlandVault.hasMedia(key)) {
                completed.push({ key, status: 'skipped' });
                continue;
            }

            const base = safeFilename(`${resolved.username || 'instagram'}_${code}_${(node.index || 0) + 1}`);
            const files = [];
            let savedType = node.mediaType;

            if (node.mediaType === 'image' && node.imageUrl) {
                const ext = extensionFromUrl(node.imageUrl, 'jpg');
                files.push(await gmDownload(node.imageUrl, `${base}.${ext}`));
            } else if (node.progressiveVideoUrl) {
                const ext = extensionFromUrl(node.progressiveVideoUrl, 'mp4');
                files.push(await gmDownload(node.progressiveVideoUrl, `${base}.${ext}`));
            } else if (node.imageUrl) {
                savedType = node.mediaType === 'video' ? 'video_thumb' : node.mediaType;
                const ext = extensionFromUrl(node.imageUrl, 'jpg');
                files.push(await gmDownload(node.imageUrl, `${base}.${ext}`));
            } else {
                throw new Error(`No downloadable stream for ${code}`);
            }

            await MaxPlandVault.markMediaDownloaded({
                key,
                shortcode: code,
                username: resolved.username || '',
                item_index: node.index || 0,
                media_type: savedType,
                files
            });
            completed.push({ key, status: 'done', files });
        }
        return completed;
    }

    async function downloadByShortcode(shortcode, options = {}) {
        const resolved = await IgBridge.resolveMedia(shortcode, options.article || null);
        return downloadResolvedMedia(resolved, options);
    }

    function findCenterElement(selector, root = document) {
        const viewportCenterX = (window.innerWidth || 800) / 2;
        let best = null, minDistance = Infinity;
        for (const el of root.querySelectorAll(selector)) {
            if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true })) continue;
            const r = el.getBoundingClientRect?.();
            if (!r || r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.top >= (window.innerHeight || 600)) continue;
            const dist = Math.abs(((r.left + r.right) / 2) - viewportCenterX);
            if (dist < minDistance) { minDistance = dist; best = el; }
        }
        return best;
    }

    function getActiveStorySection() {
        const viewportCenterX = (window.innerWidth || 800) / 2;
        let best = null, minDistance = Infinity;
        for (const sec of document.querySelectorAll('section')) {
            if (typeof sec.checkVisibility === 'function' && !sec.checkVisibility({ checkVisibilityCSS: true })) continue;
            const r = sec.getBoundingClientRect?.();
            if (!r || r.width < 50 || r.height < 50 || r.bottom <= 0 || r.top >= (window.innerHeight || 600)) continue;
            const dist = Math.abs(((r.left + r.right) / 2) - viewportCenterX);
            if (dist < minDistance) { minDistance = dist; best = sec; }
        }
        return best;
    }

    function pickStoryMedia() {
        const activeSection = getActiveStorySection();
        const video = activeSection?.querySelector?.('video') || findCenterElement('section video, video');
        const imgCandidates = (activeSection || document).querySelectorAll('img._aa63, img[crossorigin], img[referrerpolicy], img');

        let img = null, maxArea = 0;
        const viewportCenterX = (window.innerWidth || 800) / 2;
        for (const cand of imgCandidates) {
            if (typeof cand.checkVisibility === 'function' && !cand.checkVisibility({ checkVisibilityCSS: true })) continue;
            const r = cand.getBoundingClientRect?.();
            if (!r || r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.top >= (window.innerHeight || 600)) continue;
            if ((r.width <= 64 && r.height <= 64) || cand.closest?.('header')) continue;
            if (!activeSection && Math.abs(((r.left + r.right) / 2) - viewportCenterX) > 350) continue;
            const area = r.width * r.height;
            if (area > maxArea) { maxArea = area; img = cand; }
        }
        if (!img && !video) img = findCenterElement('img');
        let mediaUrl = video?.getAttribute?.('poster') || video?.poster || img?.currentSrc || img?.src || '';
        if (!/^https?:\/\//i.test(mediaUrl)) mediaUrl = '';
        return { video, img, mediaUrl, activeSection };
    }

    async function resolveCurrentStoryMedia(isThumb = false) {
        const { video, img, activeSection } = pickStoryMedia();
        if (isThumb) {
            const poster = video?.getAttribute?.('poster') || video?.poster;
            if (poster && /^https?:\/\//i.test(poster)) return { url: poster, isVideo: false, source: 'dom-poster', isBlob: false };
        }

        for (const cand of [video, img, activeSection].filter(Boolean)) {
            const fiber = MediaRegistry.extractFromFiber(cand);
            if (fiber?.url) return fiber;
        }

        const storyLink = activeSection?.querySelector?.('a[href*="/stories/"]');
        const mediaId = storyLink?.getAttribute?.('href')?.match(/\/stories\/[^\/]+\/(\d+)/)?.[1] ||
                        location.pathname.match(/\/stories\/[^\/]+\/(\d+)/)?.[1] || null;

        if (mediaId && MediaRegistry.items.has(mediaId)) {
            const cached = MediaRegistry.items.get(mediaId);
            if (isThumb && cached.imageUrl) return { url: cached.imageUrl, isVideo: false, source: 'cache', isBlob: false };
            const isVideo = Boolean(cached.isVideo && cached.videoUrl);
            const url = isVideo ? cached.videoUrl : (cached.imageUrl || cached.videoUrl);
            if (url) return { url, isVideo, source: 'cache', isBlob: false };
        }

        if (!isThumb && video) {
            const vSrc = video.currentSrc || video.src || video.querySelector?.('source')?.src || '';
            if (vSrc && /^https?:\/\//i.test(vSrc) && !vSrc.startsWith('blob:')) {
                return { url: vSrc, isVideo: true, source: 'dom-video', isBlob: false };
            }
        }
        if (img) {
            const imgUrl = img.currentSrc || img.src || '';
            if (imgUrl && /^https?:\/\//i.test(imgUrl)) return { url: imgUrl, isVideo: false, source: 'dom-img', isBlob: false };
        }

        if (mediaId) {
            try {
                const entry = await IgBridge.fetchMediaInfo(mediaId);
                if (entry) {
                    const url = isThumb ? entry.imageUrl : (entry.isVideo ? (entry.videoUrl || entry.imageUrl) : (entry.imageUrl || entry.videoUrl));
                    if (url) return { url, isVideo: !isThumb && entry.isVideo, source: 'api', isBlob: false };
                }
            } catch (_) {}
        }

        const poster = video?.getAttribute?.('poster') || video?.poster;
        if (poster && /^https?:\/\//i.test(poster)) return { url: poster, isVideo: false, source: 'dom-poster', isBlob: false };
        return { url: null, isVideo: Boolean(video), isBlob: Boolean(video?.currentSrc?.startsWith('blob:')), source: 'none' };
    }

    function closeAllMenus() {
        document.querySelectorAll('.maxpland-action-menu.show').forEach(m => m.classList.remove('show'));
    }

    async function handleDirectMediaDownload(article, { allCarousel = false } = {}) {
        const accountId = IgBridge.getCookie('ds_user_id');
        IgBridge.assertAccount(accountId);
        const shortcode = shortcodeFromArticle(article);
        const slideIndex = detectActiveCarouselIndex(article);

        try {
            const results = await downloadByShortcode(shortcode, { article, allCarousel, slideIndex, skipExisting: false });
            const done = results.filter(x => x.status === 'done').length;
            if (done > 0) {
                showToast(`Downloaded ${done} file(s)${shortcode ? ` from ${shortcode}` : ''}`);
                return;
            }
        } catch (err) {
            IgBridge.assertAccount(accountId);
            if (IgBridge.isSessionError(err) || allCarousel) throw err;
        }

        const video = article.querySelector('video');
        const img = article.querySelector('img[srcset]') || article.querySelector('img');
        const mediaUrl = video?.currentSrc || video?.src || img?.currentSrc || img?.src || null;
        if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl) || mediaUrl.startsWith('blob:')) {
            showToast('No direct media stream found for this post');
            return;
        }
        const isVideo = Boolean(video && (video.currentSrc || video.src));
        const ext = extensionFromUrl(mediaUrl, isVideo ? 'mp4' : 'jpg');
        const filename = `IG_MaxPland_${shortcode || Date.now()}.${ext}`;
        await gmDownload(mediaUrl, filename);
        showToast(`Downloaded ${filename}`);
    }

    async function runFeedAction(article, btn, options) {
        if (btn.classList.contains('loading')) return;
        btn.classList.add('loading');
        const origIcon = btn.innerHTML;
        btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5"><circle cx="12" cy="12" r="9" stroke-dasharray="28" stroke-linecap="round"/></svg>`;
        try {
            await handleDirectMediaDownload(article, options);
        } catch (err) {
            alert(err.message || String(err));
        } finally {
            btn.classList.remove('loading');
            btn.innerHTML = origIcon;
        }
    }

    async function openMediaDirectLink(article) {
        const win = window.open('about:blank', '_blank', 'noopener');
        try {
            const shortcode = shortcodeFromArticle(article);
            const slideIdx = detectActiveCarouselIndex(article);
            const resolved = await IgBridge.resolveMedia(shortcode, article);
            const node = resolved?.nodes?.[slideIdx] || resolved?.nodes?.[0];
            const url = node?.progressiveVideoUrl || node?.imageUrl;
            if (win && url) { win.location.href = url; return; }
        } catch (_) {}

        const video = article.querySelector('video');
        const img = article.querySelector('img[srcset]') || article.querySelector('img');
        const domUrl = video?.currentSrc || video?.src || img?.currentSrc || img?.src || null;
        if (win && domUrl && !domUrl.startsWith('blob:')) {
            win.location.href = domUrl;
        } else {
            if (win) win.close();
            showToast('No direct raw URL available');
        }
    }

    // Unified DOM Engine: Single MutationObserver handles Clean Feed, Feed Buttons, Story Toolbar & Profile Badge
    const DOMEngine = {
        observer: null,
        rafScheduled: false,
        AD_KEYWORDS: ['sponsored', 'ได้รับการสนับสนุน', 'suggested for you', 'แนะนำสำหรับคุณ'],

        syncCleanFeedStyles() {
            const isEnabled = Boolean(STATE.prefs?.cleanFeed);
            let styleTag = document.getElementById('maxpland-clean-feed-style');
            if (!isEnabled) {
                if (styleTag) styleTag.remove();
                document.querySelectorAll('article[data-mp-hidden-ad="true"]').forEach(el => {
                    delete el.dataset.mpHiddenAd;
                    delete el.dataset.mpAdChecked;
                });
                return;
            }
            if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = 'maxpland-clean-feed-style';
                styleTag.textContent = `
                    article:has(a[href*="/ads/ig_redirect/"]),
                    article:has(a[href*="/ads/about/"]),
                    article:has(a[href*="facebook.com/ads/"]),
                    article[data-mp-hidden-ad="true"] {
                        visibility: hidden !important; height: 0 !important; min-height: 0 !important;
                        max-height: 0 !important; margin: 0 !important; padding: 0 !important;
                        border: none !important; overflow: hidden !important;
                        overflow-anchor: none !important; pointer-events: none !important; opacity: 0 !important;
                    }
                `;
                (document.head || document.documentElement).appendChild(styleTag);
            }
        },

        processFeedArticles() {
            const cleanFeedOn = Boolean(STATE.prefs?.cleanFeed);
            const feedDlOn = STATE.prefs?.quickDownloadFeed !== false;

            if (!feedDlOn) {
                document.querySelectorAll('.maxpland-action-wrap').forEach(el => el.remove());
            }

            const articles = document.querySelectorAll('article');
            for (const article of articles) {
                // 1. Clean Feed inspection (runs once per article via data-mp-ad-checked)
                if (cleanFeedOn && !article.dataset.mpAdChecked) {
                    const header = article.querySelector('header');
                    if (header) {
                        article.dataset.mpAdChecked = '1';
                        const text = (header.textContent || '').toLowerCase();
                        if (this.AD_KEYWORDS.some(kw => text.includes(kw))) {
                            article.dataset.mpHiddenAd = 'true';
                            continue;
                        }
                    }
                }

                // 2. In-Feed Download Action Button
                if (!feedDlOn || article.dataset.mpHiddenAd === 'true') continue;
                const section = article.querySelector('section');
                if (!section || section.querySelector('.maxpland-action-wrap')) continue;

                const wrap = document.createElement('div');
                wrap.className = 'maxpland-action-wrap';

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'maxpland-action-btn';
                btn.setAttribute('aria-label', 'Download media (MaxPland)');
                btn.title = 'Click: Options menu · Shift+Click or Double-Click: Quick Download HD';
                btn.innerHTML = ICONS.DOWNLOAD;

                const menu = document.createElement('div');
                menu.className = 'maxpland-action-menu';

                const dlSingle = document.createElement('button');
                dlSingle.type = 'button';
                dlSingle.className = 'maxpland-menu-item';
                dlSingle.innerHTML = `${ICONS.DOWNLOAD}<span>Download Current (HD)</span>`;
                dlSingle.onclick = (e) => {
                    e.stopPropagation();
                    closeAllMenus();
                    runFeedAction(article, btn, { allCarousel: false });
                };

                const dlAll = document.createElement('button');
                dlAll.type = 'button';
                dlAll.className = 'maxpland-menu-item';
                dlAll.innerHTML = `${ICONS.DOWNLOAD_ALL}<span>Download All Carousel</span>`;
                dlAll.onclick = (e) => {
                    e.stopPropagation();
                    closeAllMenus();
                    runFeedAction(article, btn, { allCarousel: true });
                };

                const openTab = document.createElement('button');
                openTab.type = 'button';
                openTab.className = 'maxpland-menu-item';
                openTab.innerHTML = `${ICONS.EXTERNAL}<span>Open Raw in New Tab</span>`;
                openTab.onclick = (e) => {
                    e.stopPropagation();
                    closeAllMenus();
                    openMediaDirectLink(article);
                };

                const divider = document.createElement('div');
                divider.className = 'maxpland-menu-divider';

                const openStudio = document.createElement('button');
                openStudio.type = 'button';
                openStudio.className = 'maxpland-menu-item';
                openStudio.innerHTML = `${ICONS.LOGO}<span>Open MaxPland Studio</span>`;
                openStudio.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    closeAllMenus();
                    StudioController.open();
                };

                menu.append(dlSingle, dlAll, openTab, divider, openStudio);

                btn.onclick = (e) => {
                    e.stopPropagation();
                    // High-speed shortcut: Shift+Click downloads current slide immediately
                    if (e.shiftKey) {
                        closeAllMenus();
                        runFeedAction(article, btn, { allCarousel: false });
                        return;
                    }
                    const isShown = menu.classList.contains('show');
                    closeAllMenus();
                    if (!isShown) {
                        const hasVideo = Boolean(article.querySelector('video'));
                        const isCarousel = Boolean(article.querySelector('ul li') || article.querySelectorAll('button[aria-label*="Next"], button[aria-label*="ต่อไป"]').length);
                        dlSingle.innerHTML = `${ICONS.DOWNLOAD}<span>${hasVideo ? 'Download Video (HD)' : 'Download Image (HD)'}</span>`;
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

                const bookmarkIcon = section.querySelector('svg[aria-label*="Save"], svg[aria-label*="บันทึก"], svg[aria-label*="Remove"], svg[aria-label*="ลบออก"], polygon');
                const bookmarkContainer = bookmarkIcon ? bookmarkIcon.closest('button, div[role="button"]') : null;
                if (bookmarkContainer?.parentElement) {
                    bookmarkContainer.parentElement.insertBefore(wrap, bookmarkContainer);
                } else {
                    (section.lastElementChild && section.lastElementChild !== section ? section.lastElementChild : section).appendChild(wrap);
                }
            }
        },

        processStoryToolbar() {
            if (!location.pathname.startsWith('/stories/') || STATE.prefs?.quickDownloadStory === false) {
                document.getElementById('maxpland-story-bar')?.remove();
                return;
            }
            MediaRegistry.scanDomScripts();
            if (document.getElementById('maxpland-story-bar')) return;
            if (!getActiveStorySection()) return;

            const bar = document.createElement('div');
            bar.id = 'maxpland-story-bar';
            bar.className = 'maxpland-story-tools';

            const stealthBtn = document.createElement('button');
            stealthBtn.type = 'button';
            stealthBtn.className = 'maxpland-story-btn';
            const applyStealthStyle = (on) => {
                stealthBtn.style.background = on ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
                stealthBtn.style.border = `1px solid ${on ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`;
                stealthBtn.innerHTML = `<span>${on ? '👁️ Stealth: ON' : '👁️ Stealth: OFF'}</span>`;
                stealthBtn.title = on ? 'Stealth Story Viewer active (Seen blocked)' : 'Stealth Story Viewer off';
            };
            applyStealthStyle(STATE.prefs?.stealthStory !== false);
            stealthBtn.onclick = () => {
                const next = !(STATE.prefs?.stealthStory !== false);
                STATE.prefs.stealthStory = next;
                savePrefs(STATE.prefs);
                applyStealthStyle(next);
                const modalSwitch = document.getElementById('pref-switch-stealth-story');
                if (modalSwitch) modalSwitch.checked = next;
                showToast(next ? 'Stealth Story Viewer enabled' : 'Stealth Story Viewer disabled');
            };

            const dlBtn = document.createElement('button');
            dlBtn.type = 'button';
            dlBtn.className = 'maxpland-story-btn';
            dlBtn.innerHTML = `${ICONS.DOWNLOAD}<span>Download HD</span>`;
            dlBtn.onclick = async () => {
                dlBtn.disabled = true;
                try {
                    const media = await resolveCurrentStoryMedia(false);
                    if (!media?.url || media.isBlob) {
                        showToast('Direct stream unavailable — try Open Raw');
                        return;
                    }
                    const pathParts = location.pathname.split('/').filter(Boolean);
                    const uLink = document.querySelector('section header a[role="link"], header a[role="link"]');
                    const uname = safeFilename(
                        (pathParts[1] && pathParts[1] !== 'highlights' ? pathParts[1] : null) ||
                        uLink?.textContent?.trim() ||
                        STATE.currentUser?.username || 'story'
                    );
                    const storyId = pathParts[2] || Date.now();
                    const ext = extensionFromUrl(media.url, media.isVideo ? 'mp4' : 'jpg');
                    const filename = `${uname}_story_${storyId}.${ext}`;
                    await gmDownload(media.url, filename);
                    await MaxPlandVault.markMediaDownloaded({
                        key: `story:${storyId}:media`,
                        shortcode: String(storyId),
                        username: uname,
                        item_index: 0,
                        media_type: media.isVideo ? 'story_video' : 'story_image',
                        files: [filename]
                    });
                    showToast(`Downloaded ${filename}`);
                } catch (err) {
                    showToast(`Story download failed: ${err.message || err}`);
                } finally {
                    dlBtn.disabled = false;
                }
            };

            const openBtn = document.createElement('button');
            openBtn.type = 'button';
            openBtn.className = 'maxpland-story-btn';
            openBtn.innerHTML = '<span>↗ Open Raw</span>';
            openBtn.onclick = async () => {
                const win = window.open('about:blank', '_blank', 'noopener');
                try {
                    const media = await resolveCurrentStoryMedia(false);
                    if (win && media?.url && !media.isBlob) { win.location.href = media.url; return; }
                    if (win) win.close();
                    showToast('Raw media URL not available');
                } catch (_) {
                    if (win) win.close();
                    showToast('Could not resolve story URL');
                }
            };

            const viewersBtn = document.createElement('button');
            viewersBtn.type = 'button';
            viewersBtn.className = 'maxpland-story-btn';
            viewersBtn.innerHTML = '<span>👁 Viewers</span>';
            viewersBtn.onclick = async () => {
                viewersBtn.disabled = true;
                try {
                    const active = getActiveStorySection();
                    const link = active?.querySelector?.('a[href*="/stories/"]');
                    const mediaId = (link?.getAttribute?.('href') || location.pathname).match(/\/stories\/[^\/]+\/(\d+)/)?.[1] || null;
                    if (!mediaId) { showToast('Open a specific story first'); return; }
                    const viewers = await IgBridge.fetchStoryViewers(mediaId);
                    renderViewerPanel(viewersBtn, viewers);
                } catch (_) {
                    showToast('Viewers unavailable — works on your own stories only');
                } finally {
                    viewersBtn.disabled = false;
                }
            };

            bar.append(stealthBtn, dlBtn, openBtn, viewersBtn);
            document.body.appendChild(bar);
        },

        processProfileBadge() {
            const pathParts = location.pathname.split('/').filter(Boolean);
            const reserved = ['explore', 'stories', 'reels', 'direct', 'accounts', 'p', 'reel', 'tv'];
            if (pathParts.length !== 1 || reserved.includes(pathParts[0].toLowerCase())) {
                document.getElementById('maxpland-profile-avatar-btn')?.remove();
                return;
            }
            const existing = document.getElementById('maxpland-profile-avatar-btn');
            const uname = pathParts[0];
            if (existing) {
                if (existing.dataset.username === uname) return;
                existing.remove();
            }

            const headerActions = document.querySelector('header section') || document.querySelector('header h2')?.parentElement;
            if (!headerActions) return;

            const btn = document.createElement('button');
            btn.id = 'maxpland-profile-avatar-btn';
            btn.dataset.username = uname;
            btn.type = 'button';
            btn.className = 'maxpland-avatar-badge';
            btn.title = `Download HD profile picture of @${uname}`;
            btn.innerHTML = `${ICONS.AVATAR}<span>HD Avatar</span>`;
            btn.onclick = async () => {
                btn.disabled = true;
                btn.textContent = 'Fetching HD...';
                try {
                    const hdUrl = await IgBridge.fetchUserProfileHD(uname);
                    const fallbackImg = document.querySelector('header img[alt*="profile"], header img');
                    const finalUrl = hdUrl || fallbackImg?.currentSrc || fallbackImg?.src;
                    if (!finalUrl) throw new Error('Profile avatar not found');
                    const filename = `${safeFilename(uname)}_profile_hd_${Date.now()}.jpg`;
                    await gmDownload(finalUrl, filename);
                    showToast(`Downloaded HD Avatar of @${uname}`);
                } catch (err) {
                    alert(`Failed to download profile avatar: ${err.message || err}`);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = `${ICONS.AVATAR}<span>HD Avatar</span>`;
                }
            };
            headerActions.appendChild(btn);
        },

        tick() {
            this.rafScheduled = false;
            const onStory = location.pathname.startsWith('/stories/');
            this.processStoryToolbar();
            if (!onStory) {
                this.processFeedArticles();
                this.processProfileBadge();
            }
        },

        start() {
            this.syncCleanFeedStyles();
            this.tick();
            if (this.observer) return;
            this.observer = new MutationObserver(() => {
                if (this.rafScheduled) return;
                this.rafScheduled = true;
                requestAnimationFrame(() => this.tick());
            });
            const rootNode = document.body || document.documentElement;
            if (rootNode) this.observer.observe(rootNode, { childList: true, subtree: true });
        }
    };

    /* ==========================================================================
       7. UI BUILDER (Modal, Smart Pick Toolbar & Toast)
       ========================================================================== */

    let toastHideTimer = null;
    function showToast(message, duration = 2600) {
        let toast = document.getElementById('maxpland-toast');
        if (!toast && document.body) {
            toast = document.createElement('div');
            toast.id = 'maxpland-toast';
            toast.className = 'maxpland-toast';
            document.body.appendChild(toast);
        }
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastHideTimer);
        toastHideTimer = setTimeout(() => toast.classList.remove('show'), duration);
    }

    function renderViewerPanel(anchor, viewers) {
        let panel = document.getElementById('maxpland-viewer-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'maxpland-viewer-panel';
            panel.style.cssText = 'position:fixed;z-index:100010;min-width:240px;max-width:310px;max-height:320px;overflow:auto;background:var(--mp-bg-panel,#14161a);border:1px solid var(--mp-border-card,#262a30);border-radius:10px;padding:10px 12px;color:#e6edf3;font-size:12.5px;box-shadow:0 8px 30px rgba(0,0,0,.55);';
            document.body.appendChild(panel);
            document.addEventListener('click', (e) => {
                const p = document.getElementById('maxpland-viewer-panel');
                if (p && !p.contains(e.target) && !e.target.closest?.('.maxpland-story-btn')) p.remove();
            });
        }
        const rect = anchor.getBoundingClientRect();
        panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 318, rect.left))}px`;
        panel.style.top = `${Math.max(8, rect.bottom + 8)}px`;

        if (!viewers.length) {
            panel.innerHTML = '<div style="color:var(--mp-text-muted,#8b949e);">No viewer data (story may not be yours, expired, or empty).</div>';
            return;
        }
        const rows = viewers.slice(0, 100).map(u => {
            const name = escapeHtml(getUname(u) || getUid(u) || 'unknown');
            const when = u.timestamp ? escapeHtml(new Date(u.timestamp * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })) : '';
            return `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.06);"><span>@${name}</span><span style="color:var(--mp-text-muted,#8b949e);white-space:nowrap;">${when}</span></div>`;
        }).join('');
        panel.innerHTML = `<div style="font-weight:700;margin-bottom:6px;">👁 ${viewers.length.toLocaleString()} viewer${viewers.length === 1 ? '' : 's'}</div>${rows}`;
    }

    function createUI() {
        const stylesheet = document.createElement('style');
        stylesheet.id = 'maxpland-styles';
        stylesheet.textContent = NATIVE_IG_CSS;
        (document.head || document.documentElement).append(stylesheet);

        const triggerBtn = document.createElement('button');
        triggerBtn.type = 'button';
        triggerBtn.setAttribute('aria-label', 'Open IG MaxPland');
        triggerBtn.id = 'maxpland-trigger-btn';
        triggerBtn.title = 'MaxPland v4.0 · Alt+Shift+M (Draggable)';
        triggerBtn.innerHTML = ICONS.TRIGGER || ICONS.LOGO;

        try {
            const savedPos = JSON.parse(localStorage.getItem(STORAGE_KEYS.LAUNCHER_POS) || 'null');
            if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
                triggerBtn.style.left = `${Math.min(window.innerWidth - 50, Math.max(10, savedPos.x))}px`;
                triggerBtn.style.top = `${Math.min(window.innerHeight - 50, Math.max(10, savedPos.y))}px`;
                triggerBtn.style.right = 'auto';
                triggerBtn.style.bottom = 'auto';
            }
        } catch (_) {}

        document.body.appendChild(triggerBtn);

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
                    <span id="maxpland-header-budget" class="maxpland-budget-pill">Quota: ${escapeHtml(formatBudget())}</span>
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
                    <span class="maxpland-scan-phase" id="maxpland-scan-phase">Preparing operation...</span>
                    <div class="maxpland-scan-meta">
                        <span id="maxpland-scan-stat-count">Users: 0</span>
                        <span id="maxpland-scan-stat-page">Pages: 0</span>
                        <span id="maxpland-scan-stat-timer">⏱️ 00:00</span>
                        <button type="button" class="maxpland-btn-secondary" id="maxpland-btn-pause-scan" style="display:none;padding:4px 9px;font-size:11.5px;">⏸ Pause</button>
                        <button type="button" class="maxpland-btn-danger" id="maxpland-btn-stop-scan">${ICONS.STOP} Stop</button>
                        <button type="button" class="maxpland-btn-secondary" id="maxpland-btn-fresh-scan" style="display:none;padding:4px 9px;font-size:11.5px;" title="Discard saved checkpoint and restart from page 1">↺ Start fresh</button>
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
                            <button class="maxpland-pill-btn" data-filter="churn">
                                🔻 Lost 30d <span class="maxpland-pill-count" id="pill-count-churn">-</span>
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

                    <div class="maxpland-subfilters">
                        <div class="maxpland-chip-group">
                            <span style="font-weight:600;color:var(--mp-text-muted);">Filters:</span>
                            <div class="maxpland-chip-toggle" id="toggle-filter-whitelist" title="Hide starred whitelist accounts">${ICONS.STAR} Hide Whitelist</div>
                            <div class="maxpland-chip-toggle" id="toggle-filter-verified" title="Hide verified badge accounts">${ICONS.VERIFIED} Hide Verified</div>
                            <div class="maxpland-chip-toggle" id="toggle-filter-private" title="Hide private accounts">${ICONS.LOCK} Hide Private</div>
                            <div class="maxpland-chip-toggle" id="toggle-filter-noavatar" title="Hide accounts without avatar">Hide No-Avatar</div>
                            <div class="maxpland-chip-toggle" id="toggle-filter-following" title="Show only accounts we follow">Followed</div>
                            <div class="maxpland-chip-toggle" id="toggle-filter-notfollowing" title="Show only accounts we do not follow">Not Followed</div>
                        </div>
                        <div class="maxpland-chip-group">
                            <button class="maxpland-btn-secondary" id="maxpland-btn-smart-pick" style="padding:4px 9px;font-size:11.5px;color:#38bdf8;border-color:rgba(56,189,248,0.35);" title="Auto-select non-whitelisted, non-verified accounts up to remaining daily quota">
                                ${ICONS.BOLT} Smart Pick Quota
                            </button>
                            <button class="maxpland-btn-secondary" id="maxpland-btn-copy-usernames" style="padding:4px 9px;font-size:11.5px;" title="Copy all visible usernames to clipboard">
                                ${ICONS.COPY} Copy
                            </button>
                            <button class="maxpland-btn-secondary" id="maxpland-btn-export-csv" style="padding:4px 9px;font-size:11.5px;">
                                ${ICONS.DOWNLOAD} CSV
                            </button>
                            <button class="maxpland-btn-secondary" id="maxpland-btn-export-json" style="padding:4px 9px;font-size:11.5px;">
                                JSON
                            </button>
                        </div>
                    </div>

                    <div class="maxpland-toolbar">
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            <button class="maxpland-btn-primary" id="maxpland-btn-scan-relationships">
                                ${ICONS.USERS} Scan Relationships
                            </button>
                            <button class="maxpland-btn-secondary" id="maxpland-btn-scan-inactive" title="Scan Following accounts for inactivity beyond threshold">
                                ${ICONS.CLOCK} Inactive Radar
                            </button>
                            <button class="maxpland-btn-secondary" id="maxpland-btn-backup-whitelist" title="Export starred accounts whitelist as JSON file">
                                ${ICONS.BACKUP} Backup Whitelist
                            </button>
                            <button class="maxpland-btn-secondary" id="maxpland-btn-restore-whitelist" title="Import starred accounts from backup JSON file">
                                ${ICONS.RESTORE} Restore Whitelist
                            </button>
                            <input type="file" id="maxpland-whitelist-file-input" accept=".json" style="display:none;">
                        </div>
                        <span id="maxpland-scan-status-summary" style="font-size:12px;color:var(--mp-text-muted);font-variant-numeric:tabular-nums;"></span>
                    </div>

                    <div class="maxpland-bulk-bar" id="maxpland-bulk-bar">
                        <div class="maxpland-bulk-info">
                            <span id="maxpland-bulk-count-label">0 selected</span>
                            <button type="button" class="maxpland-btn-secondary" id="maxpland-btn-select-all" style="padding:3px 8px;font-size:11px;">Select Page</button>
                            <button type="button" class="maxpland-btn-secondary" id="maxpland-btn-deselect-all" style="padding:3px 8px;font-size:11px;">Clear</button>
                        </div>
                        <div class="maxpland-bulk-actions">
                            <button type="button" class="maxpland-btn-secondary" id="maxpland-btn-batch-whitelist" style="padding:5px 11px;font-size:11.5px;">
                                ${ICONS.STAR_FILLED} Whitelist Selected
                            </button>
                            <button type="button" class="maxpland-btn-danger" id="maxpland-btn-batch-unfollow">
                                ${ICONS.UNFOLLOW} Unfollow Selected
                            </button>
                        </div>
                    </div>

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
                        <p style="font-size:12px;color:var(--mp-text-muted);margin:0;">Computed locally from IndexedDB snapshots with zero extra API calls.</p>
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

                    <div class="maxpland-chart-box">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            <div>
                                <span style="font-size:13px;font-weight:700;">📈 Follower Count Trend (Historical Snapshots)</span>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">Archived automatically in IndexedDB after each complete scan</div>
                            </div>
                            <span id="health-drift-delta" style="font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;"></span>
                        </div>
                        <div id="health-chart-container" style="min-height:130px;display:grid;place-items:center;color:var(--mp-text-muted);font-size:12px;">
                            Run at least 1 relationship scan to begin plotting history trend.
                        </div>
                    </div>

                    <div style="background:var(--mp-bg-card);border:1px solid var(--mp-border-card);border-radius:8px;padding:14px 16px;">
                        <span style="font-size:13px;font-weight:700;color:#38bdf8;">💡 Strategic Account Health Advice:</span>
                        <div id="health-advice-text" style="font-size:12px;color:var(--mp-text-secondary);margin-top:6px;line-height:1.5;">
                            Run a relationship scan in the first tab to receive tailored account structure insights.
                        </div>
                    </div>
                </div>

                <!-- TAB 3: Features Control Panel -->
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
                                Blocks story seen telemetry beacons across Fetch, XHR, and Beacon APIs. View stories anonymously without appearing on the viewer list.
                            </div>
                        </div>
                        <label class="maxpland-switch">
                            <input type="checkbox" id="pref-switch-stealth-story">
                            <span class="maxpland-slider"></span>
                        </label>
                    </div>

                    <div class="maxpland-feature-card">
                        <div class="maxpland-feature-info">
                            <div class="maxpland-feature-title">${ICONS.SHIELD} Clean Feed Mode (Ad & Suggestion Blocker)</div>
                            <div class="maxpland-feature-desc">
                                Automatically collapses sponsored ads and suggested posts in your feed without breaking scroll anchoring.
                            </div>
                        </div>
                        <label class="maxpland-switch">
                            <input type="checkbox" id="pref-switch-clean-feed">
                            <span class="maxpland-slider"></span>
                        </label>
                    </div>

                    <div class="maxpland-feature-card">
                        <div class="maxpland-feature-info">
                            <div class="maxpland-feature-title">${ICONS.DOWNLOAD} In-Feed Media Download Buttons (Zero-API Fiber First)</div>
                            <div class="maxpland-feature-desc">
                                Injects HD download buttons on every post. Supports Shift+Click or Double-Click for instant 1-click download via React Fiber.
                            </div>
                        </div>
                        <label class="maxpland-switch">
                            <input type="checkbox" id="pref-switch-feed-download">
                            <span class="maxpland-slider"></span>
                        </label>
                    </div>

                    <div class="maxpland-feature-card">
                        <div class="maxpland-feature-info">
                            <div class="maxpland-feature-title">${ICONS.THUMBNAIL} Story Toolbar & Downloader</div>
                            <div class="maxpland-feature-desc">
                                Floating toolbar in story view for instant HD video/image download, raw stream link, viewer list, and stealth toggle.
                            </div>
                        </div>
                        <label class="maxpland-switch">
                            <input type="checkbox" id="pref-switch-story-toolbar">
                            <span class="maxpland-slider"></span>
                        </label>
                    </div>

                    <div class="maxpland-feature-card">
                        <div class="maxpland-feature-info">
                            <div class="maxpland-feature-title">${ICONS.CLOCK} Auto-Cooldown on Soft Rate Limit (429)</div>
                            <div class="maxpland-feature-desc">
                                During batch unfollow, automatically waits out temporary soft rate limits instead of aborting the queue (hard blocks still halt immediately).
                            </div>
                        </div>
                        <label class="maxpland-switch">
                            <input type="checkbox" id="pref-switch-auto-wait">
                            <span class="maxpland-slider"></span>
                        </label>
                    </div>
                </div>

                <!-- TAB 4: Settings & Configuration -->
                <div class="maxpland-tab-content" id="tab-settings">
                    <div style="margin-bottom:16px;">
                        <h2 style="font-size:15px;font-weight:700;margin:0 0 4px;">Settings & Safety Configuration</h2>
                        <p style="font-size:12px;color:var(--mp-text-muted);margin:0;">Configure detection thresholds, pacing parameters, and vault maintenance.</p>
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
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">Randomized pacing interval between unfollow actions to emulate natural human behavior.</div>
                            </div>
                            <span style="font-size:12px;font-weight:600;color:var(--mp-emerald);">${APP_CONFIG.UNFOLLOW_DELAY_MIN.toLocaleString()} - ${APP_CONFIG.UNFOLLOW_DELAY_MAX.toLocaleString()} ms</span>
                        </div>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">Scan Speed</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">A: Safe 6–12s/page · B: Fast 3–6s/page · C: Fastest 1.5–3s/page (with breathing rests)</div>
                            </div>
                            <select id="pref-setting-scan-speed" class="maxpland-select">
                                <option value="A">A — Safe (recommended)</option>
                                <option value="B">B — Fast ~2x</option>
                                <option value="C">C — Fastest ~4x (high risk)</option>
                            </select>
                        </div>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">Daily Unfollow Ceiling</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">Hard stop for unfollow actions per local day.</div>
                            </div>
                            <select id="pref-setting-daily-cap" class="maxpland-select">
                                <option value="90">90 / day (strict)</option>
                                <option value="180">180 / day (recommended)</option>
                                <option value="300">300 / day (aggressive)</option>
                                <option value="0">No ceiling (delay only)</option>
                            </select>
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
                                <button type="button" class="maxpland-btn-secondary" id="setting-btn-backup-whitelist">${ICONS.BACKUP} Backup</button>
                                <button type="button" class="maxpland-btn-secondary" id="setting-btn-restore-whitelist">${ICONS.RESTORE} Restore</button>
                            </div>
                        </div>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">Activity Radar Cache</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">Purge stored last-post timestamps from IndexedDB to force fresh scanning.</div>
                            </div>
                            <button type="button" class="maxpland-btn-danger" id="setting-btn-clear-cache">Purge Radar Cache</button>
                        </div>
                        <div class="maxpland-settings-row" id="maxpland-block-row" style="display:none;">
                            <div>
                                <div style="font-weight:600;font-size:13px;color:var(--mp-rose);">Account Block Active</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">Instagram returned feedback_required. Wait 6+ hours before clearing.</div>
                            </div>
                            <button type="button" class="maxpland-btn-danger" id="setting-btn-clear-block">Clear Block</button>
                        </div>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">Unfollow Activity Today</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);" id="maxpland-budget-label">${escapeHtml(formatBudget())}</div>
                            </div>
                            <button type="button" class="maxpland-btn-secondary" id="setting-btn-reset-budget">Reset Counter</button>
                        </div>
                    </div>
                </div>

                <!-- TAB 5: Media Vault -->
                <div class="maxpland-tab-content" id="tab-vault">
                    <div style="margin-bottom:12px;">
                        <h2 style="font-size:15px;font-weight:700;margin:0 0 4px;">Direct Media Downloader & Vault</h2>
                        <p style="font-size:12px;color:var(--mp-text-muted);margin:0;">Paste post or Reel links to batch download full-resolution assets or browse download history.</p>
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
            </div>

            <div class="maxpland-footer">
                <span>MaxPland v${APP_CONFIG.VERSION} · Clean Minimal Precision (Zero-Leak Sandbox)</span>
                <span>Shortcut <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd> · Feed <kbd>Shift</kbd> + <kbd>Click</kbd> Quick DL</span>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        bindUIEvents(triggerBtn, overlay, modal);
    }
/* ==========================================================================
       8. UI EVENTS, SMART PICK & MODULE CONTROLLERS
       ========================================================================== */

    async function clearResumeCheckpoints() {
        await MaxPlandVault.clearCheckpoint();
        for (const ep of ['followers', 'following']) {
            try { localStorage.removeItem(`mp_scan_resume_${ep}`); } catch (_) {}
        }
        STATE.scanResumedFrom = 0;
    }

    function bindUIEvents(triggerBtn, overlay, modal) {
        const el = (id) => document.getElementById(id);

        const openModal = async () => {
            overlay.style.display = 'block';
            modal.style.display = 'grid';
            triggerBtn.style.visibility = 'hidden';
            el('maxpland-close-btn')?.focus();

            const user = await IgBridge.resolveCurrentUser();
            const badge = el('maxpland-account-badge');
            if (user?.username) {
                badge.textContent = `@${user.username}`;
                STATE.currentUser = user;
            } else if (user?.id) {
                badge.textContent = `UID: ${user.id}`;
                STATE.currentUser = user;
            } else {
                badge.textContent = 'Not logged in';
            }

            if (user?.id && !STATE.isScanning && (STATE.followers.length === 0 || String(STATE.relationshipAccountId) !== String(user.id))) {
                await hydrateFromLatestSnapshot(user.id);
            }

            syncFeaturesTab();
            syncSettingsTab();
            syncBudgetLabels();
            if (STATE.activeTab === 'health') renderHealthDashboard();
        };

        const closeModal = () => {
            if (STATE.isScanning || STATE.isUnfollowing || STATE.isScanningInactive) {
                if (!confirm('A task is currently running. Close window anyway?')) return;
            }
            overlay.style.display = 'none';
            modal.style.display = 'none';
            triggerBtn.style.visibility = 'visible';
            triggerBtn.focus();
        };

        StudioController.open = openModal;
        StudioController.close = closeModal;

        // Draggable Floating Launcher
        let isPointerDown = false, isDragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

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
            if (Math.hypot(e.clientX - startX, e.clientY - startY) > 4) {
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
                try {
                    localStorage.setItem(STORAGE_KEYS.LAUNCHER_POS, JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }));
                } catch (_) {}
            } else {
                openModal();
            }
        };

        triggerBtn.addEventListener('pointerup', handlePointerEnd);
        triggerBtn.addEventListener('pointercancel', handlePointerEnd);

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
        });

        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.shiftKey && e.code === 'KeyM' && !e.repeat) {
                e.preventDefault();
                if (modal.style.display === 'none') openModal(); else closeModal();
            }
        });

        overlay.addEventListener('click', closeModal);
        el('maxpland-close-btn').addEventListener('click', closeModal);

        // Navigation Tabs
        const tabs = modal.querySelectorAll('.maxpland-tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
                modal.querySelectorAll('.maxpland-tab-content').forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                el(`tab-${tab.dataset.tab}`)?.classList.add('active');
                STATE.activeTab = tab.dataset.tab;

                if (STATE.activeTab === 'vault') renderMediaVault();
                else if (STATE.activeTab === 'health') renderHealthDashboard();
                else if (STATE.activeTab === 'features') syncFeaturesTab();
                else if (STATE.activeTab === 'settings') syncSettingsTab();
            });
        });

        // Category Filter Pills & Stat Cards
        const filterBtns = el('tab-relationship').querySelectorAll('.maxpland-pill-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                STATE.relationshipFilter = btn.dataset.filter;
                STATE.relationshipLimit = 100;
                STATE.selectedIds.clear();
                updateBulkActionBar();
                renderRelationshipList();
                if (STATE.relationshipFilter === 'churn') loadChurnHistory();
            });
        });

        modal.querySelectorAll('.maxpland-stat-card').forEach(card => {
            card.addEventListener('click', () => {
                modal.querySelector(`.maxpland-pill-btn[data-filter="${card.dataset.targetFilter}"]`)?.click();
            });
        });

        // Sub-filter Toggles (Consolidated handler)
        const bindSubFilter = (id, key) => {
            const node = el(id);
            if (!node) return;
            node.addEventListener('click', () => {
                STATE.subFilters[key] = !STATE.subFilters[key];
                STATE.relationshipLimit = 100;
                node.classList.toggle('active', STATE.subFilters[key]);
                renderRelationshipList();
            });
        };
        bindSubFilter('toggle-filter-whitelist', 'excludeWhitelist');
        bindSubFilter('toggle-filter-verified', 'excludeVerified');
        bindSubFilter('toggle-filter-private', 'excludePrivate');
        bindSubFilter('toggle-filter-noavatar', 'excludeNoAvatar');

        el('toggle-filter-following').addEventListener('click', () => setFollowStateChip('onlyFollowing'));
        el('toggle-filter-notfollowing').addEventListener('click', () => setFollowStateChip('onlyNotFollowed'));

        el('maxpland-user-search').addEventListener('input', (e) => {
            STATE.searchQuery = e.target.value.trim().toLowerCase();
            STATE.relationshipLimit = 100;
            clearTimeout(STATE.searchRenderTimer);
            STATE.searchRenderTimer = setTimeout(() => { STATE.searchRenderTimer = null; renderRelationshipList(); }, 100);
        });

        // Scan & Control Buttons
        el('maxpland-btn-scan-relationships').addEventListener('click', runRelationshipScan);
        el('maxpland-btn-scan-inactive').addEventListener('click', runInactiveScan);

        el('maxpland-btn-stop-scan').addEventListener('click', () => {
            STATE.stopScanFlag = true;
            STATE.scanController?.abort();
            STATE.stopInactiveScanFlag = true;
            STATE.inactiveController?.abort();
            STATE.stopUnfollowFlag = true;
            el('maxpland-scan-phase').textContent = 'Stopping operation...';
        });

        el('maxpland-btn-pause-scan').addEventListener('click', () => {
            STATE.scanPaused = !STATE.scanPaused;
            const pb = el('maxpland-btn-pause-scan');
            pb.textContent = STATE.scanPaused ? '▶ Resume' : '⏸ Pause';
            el('maxpland-scan-phase').textContent = STATE.scanPaused ? 'Scan paused — checkpoint saved in IndexedDB' : 'Fetching relationship pages...';
        });

        el('maxpland-btn-fresh-scan').addEventListener('click', async () => {
            await clearResumeCheckpoints();
            STATE.stopScanFlag = true;
            STATE.scanPaused = false;
            STATE.scanController?.abort();
            showToast('Saved checkpoint discarded — click Scan Relationships to start from page 1', 4500);
        });

        // Whitelist & Selection Actions
        const restoreInput = el('maxpland-whitelist-file-input');
        el('maxpland-btn-backup-whitelist').addEventListener('click', exportWhitelistBackup);
        el('maxpland-btn-restore-whitelist').addEventListener('click', () => restoreInput.click());
        restoreInput.addEventListener('change', handleWhitelistRestoreFile);

        el('maxpland-btn-smart-pick').addEventListener('click', smartPickQuota);
        el('maxpland-btn-select-all').addEventListener('click', selectAllVisible);
        el('maxpland-btn-deselect-all').addEventListener('click', () => {
            STATE.selectedIds.clear();
            updateBulkActionBar();
            renderRelationshipList();
        });

        el('maxpland-btn-batch-whitelist').addEventListener('click', async () => {
            if (!STATE.selectedIds.size) return;
            const toAdd = getFilteredUsers().filter(u => STATE.selectedIds.has(getUid(u)));
            if (!toAdd.length) return;
            try {
                const count = await MaxPlandVault.importWhitelist(toAdd);
                STATE.whitelist = await MaxPlandVault.getWhitelist();
                syncRelationshipStatCounters();
                STATE.selectedIds.clear();
                updateBulkActionBar();
                renderRelationshipList();
                showToast(`Added ${count.toLocaleString()} account(s) to Whitelist`);
            } catch (err) {
                alert(`Failed to update Whitelist: ${err.message || err}`);
            }
        });

        el('maxpland-btn-batch-unfollow').addEventListener('click', runBatchUnfollow);

        // Exports & Media Queue
        el('maxpland-btn-copy-usernames').addEventListener('click', copyVisibleUsernames);
        el('maxpland-btn-export-csv').addEventListener('click', exportRelationshipCSV);
        el('maxpland-btn-export-json').addEventListener('click', exportRelationshipJSON);

        el('maxpland-btn-run-media-queue').addEventListener('click', () => runMediaQueue({ skipExisting: true }));
        el('maxpland-btn-run-media-all').addEventListener('click', () => runMediaQueue({ skipExisting: false }));
        el('maxpland-btn-refresh-vault').addEventListener('click', renderMediaVault);

        // Feature Switches
        const bindPrefSwitch = (id, key, onMsg, offMsg, afterChange) => {
            const sw = el(id);
            if (!sw) return;
            sw.addEventListener('change', (e) => {
                STATE.prefs[key] = e.target.checked;
                savePrefs(STATE.prefs);
                afterChange?.(e.target.checked);
                showToast(e.target.checked ? onMsg : offMsg);
            });
        };

        bindPrefSwitch('pref-switch-stealth-story', 'stealthStory', 'Stealth Story Viewer enabled', 'Stealth Story Viewer disabled');
        bindPrefSwitch('pref-switch-clean-feed', 'cleanFeed', 'Clean Feed Mode enabled', 'Clean Feed Mode disabled', () => {
            DOMEngine.syncCleanFeedStyles();
            DOMEngine.tick();
        });
        bindPrefSwitch('pref-switch-feed-download', 'quickDownloadFeed', 'In-feed download buttons enabled', 'In-feed download buttons disabled', () => DOMEngine.tick());
        bindPrefSwitch('pref-switch-story-toolbar', 'quickDownloadStory', 'Story toolbar enabled', 'Story toolbar disabled', () => DOMEngine.tick());
        bindPrefSwitch('pref-switch-auto-wait', 'autoWaitRateLimit', 'Auto-cooldown on Soft 429 enabled', 'Auto-cooldown on Soft 429 disabled');

        // Settings Controls
        el('pref-setting-inactive-threshold')?.addEventListener('change', (e) => {
            STATE.prefs.inactiveThresholdDays = Number(e.target.value) || 180;
            savePrefs(STATE.prefs);
            showToast(`Inactive threshold set to ${STATE.prefs.inactiveThresholdDays} days`);
        });

        el('pref-setting-scan-speed')?.addEventListener('change', (e) => {
            STATE.prefs.scanSpeed = e.target.value;
            savePrefs(STATE.prefs);
            showToast(`Scan speed set to Mode ${e.target.value}`);
        });

        el('pref-setting-daily-cap')?.addEventListener('change', (e) => {
            STATE.prefs.dailyUnfollowCap = Math.max(0, Number(e.target.value) || 0);
            savePrefs(STATE.prefs);
            syncBudgetLabels();
            showToast(STATE.prefs.dailyUnfollowCap ? `Daily ceiling set to ${STATE.prefs.dailyUnfollowCap}` : 'Daily unfollow ceiling disabled');
        });

        el('setting-btn-backup-whitelist')?.addEventListener('click', exportWhitelistBackup);
        el('setting-btn-restore-whitelist')?.addEventListener('click', () => restoreInput.click());

        el('setting-btn-clear-block')?.addEventListener('click', () => {
            if (!confirm('Clear account block only if you have waited 6+ hours since Instagram blocked this account.\n\nProceed?')) return;
            IgBridge.clearHardBlock();
            const row = el('maxpland-block-row');
            if (row) row.style.display = 'none';
            showToast('Account block cleared.');
        });

        el('setting-btn-reset-budget')?.addEventListener('click', () => {
            if (!confirm('Reset the daily unfollow counter to 0?')) return;
            resetWriteBudget();
            showToast('Daily unfollow counter reset to 0.');
        });

        el('setting-btn-clear-cache')?.addEventListener('click', async () => {
            if (!confirm('Purge all cached Inactive Radar timestamps from IndexedDB?')) return;
            await MaxPlandVault.clearActivityCache();
            STATE.inactiveFollowing = [];
            const pill = el('pill-count-inactive');
            if (pill) pill.textContent = '-';
            showToast('Inactive Radar cache purged.');
        });

        // Delegated List Events (Checkbox, Star Whitelist, Single Unfollow)
        const relList = el('maxpland-relationship-list');
        relList.addEventListener('change', (e) => {
            const box = e.target.closest('.user-select-checkbox');
            if (!box) return;
            if (box.checked) STATE.selectedIds.add(box.dataset.id);
            else STATE.selectedIds.delete(box.dataset.id);
            updateBulkActionBar();
        });

        relList.addEventListener('click', async (e) => {
            const star = e.target.closest('.maxpland-star-btn');
            if (star && !star.disabled) {
                const uid = star.dataset.id;
                const user = getFilteredUsers().find(u => getUid(u) === uid) || STATE.whitelist.get(uid);
                if (!user) return;
                star.disabled = true;
                try {
                    const added = await MaxPlandVault.toggleWhitelist(user);
                    STATE.whitelist = await MaxPlandVault.getWhitelist();
                    syncRelationshipStatCounters();
                    if (added) STATE.selectedIds.delete(uid);
                    showToast(added ? `Added @${user.username} to Whitelist` : `Removed @${user.username} from Whitelist`);
                    updateBulkActionBar();
                    renderRelationshipList();
                } catch (err) {
                    alert(err.message || String(err));
                } finally {
                    star.disabled = false;
                }
                return;
            }

            const btn = e.target.closest('.maxpland-row-unfollow-btn');
            if (btn && !btn.disabled) {
                if (STATE.isScanning || STATE.isUnfollowing || STATE.isScanningInactive || STATE.scanIncomplete) return;
                const wait = APP_CONFIG.UNFOLLOW_DELAY_MAX - (Date.now() - (STATE.lastUnfollowAt || 0));
                if (wait > 0) {
                    showToast(`⏳ Safety pacing: wait ${Math.ceil(wait / 1000)}s before next unfollow`, 3500);
                    return;
                }
                const cap = budgetState();
                if (cap.blocked) {
                    showToast(`⛔ Daily ceiling reached (${cap.used}/${cap.cap})`, 4500);
                    return;
                }
                const uid = btn.dataset.id;
                const uname = btn.dataset.user;
                if (!confirm(`Unfollow @${uname}?`)) return;

                STATE.isUnfollowing = true;
                btn.disabled = true;
                btn.textContent = 'Unfollowing...';
                try {
                    await IgBridge.unfollowUser(uid);
                    STATE.lastUnfollowAt = Date.now();
                    noteWrite();
                    applyUnfollowResult(uid, uname);
                    STATE.selectedIds.delete(uid);
                    syncRelationshipStatCounters();
                    updateBulkActionBar();
                    renderRelationshipList();
                    showToast(`Unfollowed @${uname}`);
                } catch (err) {
                    alert(`Unfollow failed: ${err.message || err}`);
                    btn.disabled = false;
                    btn.innerHTML = `${ICONS.UNFOLLOW} Unfollow`;
                } finally {
                    STATE.isUnfollowing = false;
                }
            }
        });
    }

    /* ==========================================================================
       9. RELATIONSHIP ENGINE, SMART PICK & AUTO-COOLDOWN UNFOLLOW
       ========================================================================== */

    function computeRelationshipBuckets(followers, following) {
        const followerIdSet = new Set();
        const followerUsernameSet = new Set();
        for (const u of followers) {
            const uid = getUid(u), uname = getUname(u).toLowerCase();
            if (uid) followerIdSet.add(uid);
            if (uname) followerUsernameSet.add(uname);
        }

        const followingIdSet = new Set();
        const followingUsernameSet = new Set();
        for (const u of following) {
            const uid = getUid(u), uname = getUname(u).toLowerCase();
            if (uid) followingIdSet.add(uid);
            if (uname) followingUsernameSet.add(uname);
        }

        const isFollower = (u) => {
            if (u?.friendship_status?.followed_by === true) return true;
            const uid = getUid(u), uname = getUname(u).toLowerCase();
            return (Boolean(uid) && followerIdSet.has(uid)) || (Boolean(uname) && followerUsernameSet.has(uname));
        };

        const isFollowing = (u) => {
            if (u?.friendship_status?.following === true) return true;
            const uid = getUid(u), uname = getUname(u).toLowerCase();
            return (Boolean(uid) && followingIdSet.has(uid)) || (Boolean(uname) && followingUsernameSet.has(uname));
        };

        return {
            followerIdSet,
            followingIdSet,
            followingUsernameSet,
            notFollowingBack: following.filter(u => !isFollower(u)),
            fans: followers.filter(u => !isFollowing(u)),
            mutual: following.filter(u => isFollower(u)),
            ghostFollowers: followers.filter(u => hasNoAvatar(u))
        };
    }

    function syncRelationshipStatCounters() {
        const el = (id) => document.getElementById(id);
        const pairs = [
            ['not-following-back', 'not', 'notFollowingBack'],
            ['fans', 'fans', 'fans'],
            ['mutual', 'mutual', 'mutual'],
            ['lost', 'lost', 'lostFollowers'],
            ['ghost', 'ghost', 'ghostFollowers'],
            ['renamed', 'renamed', 'renamed']
        ];
        for (const [stat, pill, key] of pairs) {
            const val = (STATE[key] || []).length.toLocaleString();
            if (el(`stat-${stat}`)) el(`stat-${stat}`).textContent = val;
            if (el(`pill-count-${pill}`)) el(`pill-count-${pill}`).textContent = val;
        }
        if (el('pill-count-inactive')) el('pill-count-inactive').textContent = STATE.inactiveFollowing.length ? STATE.inactiveFollowing.length.toLocaleString() : '-';
        if (el('pill-count-churn')) el('pill-count-churn').textContent = (STATE.churnLost30 || []).length.toLocaleString();
        if (el('pill-count-white')) el('pill-count-white').textContent = STATE.whitelist.size.toLocaleString();
    }

    function flattenChurnLost(cycles) {
        const byId = new Map();
        for (const cycle of cycles || []) {
            for (const entry of cycle.lost || []) {
                const id = String(entry.id || '');
                if (!id || byId.has(id)) continue;
                byId.set(id, {
                    id, pk: id,
                    username: entry.username || `user_${id}`,
                    full_name: `Unfollowed · detected ${new Date(cycle.timestamp).toLocaleDateString()}`,
                    profile_pic_url: '',
                    churn_detected_at: cycle.timestamp
                });
            }
        }
        return [...byId.values()];
    }

    async function loadChurnHistory() {
        try {
            const accountId = STATE.relationshipAccountId || (await IgBridge.resolveCurrentUser()).id;
            const cycles = await MaxPlandVault.getChurnHistory(accountId, APP_CONFIG.SNAPSHOT_RETENTION);
            STATE.churnLost30 = flattenChurnLost(cycles);
            STATE.churnCycles = cycles.length;
            syncRelationshipStatCounters();
            if (STATE.relationshipFilter === 'churn') renderRelationshipList();
        } catch (_) {}
    }

    async function hydrateFromLatestSnapshot(accountId) {
        if (!accountId || STATE.isScanning) return false;
        try {
            const [snap, whitelist, churnCycles] = await Promise.all([
                MaxPlandVault.getLatestSnapshot(accountId),
                MaxPlandVault.getWhitelist(),
                MaxPlandVault.getChurnHistory(accountId, APP_CONFIG.SNAPSHOT_RETENTION)
            ]);
            STATE.whitelist = whitelist;
            STATE.churnLost30 = flattenChurnLost(churnCycles);
            STATE.churnCycles = churnCycles.length;

            if (!snap || !Array.isArray(snap.followers_compact) || !Array.isArray(snap.following_compact)) {
                syncRelationshipStatCounters();
                return false;
            }

            const followers = snap.followers_compact;
            const following = snap.following_compact;
            const buckets = computeRelationshipBuckets(followers, following);
            const latestChurn = churnCycles[0];
            const lostFollowers = (latestChurn?.lost || []).map(entry => ({
                pk: String(entry.id),
                id: String(entry.id),
                username: entry.username || `user_${entry.id}`,
                profile_pic_url: '',
                full_name: 'Unfollowed in last recorded scan'
            }));

            Object.assign(STATE, {
                relationshipAccountId: String(accountId),
                followers,
                following,
                notFollowingBack: buckets.notFollowingBack,
                fans: buckets.fans,
                mutual: buckets.mutual,
                ghostFollowers: buckets.ghostFollowers,
                lostFollowers,
                renamed: [],
                scanIncomplete: false
            });

            syncRelationshipStatCounters();
            const summary = document.getElementById('maxpland-scan-status-summary');
            if (summary) {
                summary.textContent = `Cached (${new Date(snap.timestamp).toLocaleString()}) · Followers ${followers.length.toLocaleString()} · Following ${following.length.toLocaleString()}`;
            }
            renderRelationshipList();
            return true;
        } catch (_) {
            return false;
        }
    }

    async function runRelationshipScan() {
        if (STATE.isScanning || STATE.isUnfollowing || STATE.isScanningInactive) return;
        const speedMode = ['B', 'C'].includes(STATE.prefs?.scanSpeed) ? STATE.prefs.scanSpeed : 'A';
        if (speedMode === 'C' && !confirm('⚠️ Mode C pages at 1.5–3s. Higher rate-limit risk than Mode A.\nProceed?')) return;
        if (speedMode === 'B' && !confirm('⚠️ Mode B pages at 3–6s (~2x faster than Safe mode).\nProceed?')) return;

        STATE.isScanning = true;
        STATE.stopScanFlag = false;
        STATE.scanController = new AbortController();
        STATE.scanStartTime = Date.now();
        clearTimeout(STATE.progressHideTimer);

        const el = (id) => document.getElementById(id);
        const btn = el('maxpland-btn-scan-relationships');
        const progress = el('maxpland-global-progress');
        const phase = el('maxpland-scan-phase');
        const notice = el('maxpland-scan-notice');
        const summary = el('maxpland-scan-status-summary');
        const pauseBtn = el('maxpland-btn-pause-scan');
        const freshBtn = el('maxpland-btn-fresh-scan');

        STATE.scanIncomplete = true;
        for (const key of ['followers', 'following', 'notFollowingBack', 'fans', 'mutual', 'lostFollowers', 'ghostFollowers', 'renamed']) {
            STATE[key] = [];
        }
        STATE.selectedIds.clear();
        updateBulkActionBar();
        syncRelationshipStatCounters();
        renderRelationshipList();

        const timer = setInterval(() => {
            el('maxpland-scan-stat-timer').textContent = `⏱️ ${formatTime(Math.floor((Date.now() - STATE.scanStartTime) / 1000))}`;
        }, 1000);

        try {
            btn.disabled = true;
            progress.style.display = 'block';
            STATE.scanPaused = false;
            pauseBtn.style.display = '';
            pauseBtn.textContent = '⏸ Pause';
            STATE.scanResumedFrom = 0;
            if (freshBtn) freshBtn.style.display = 'none';

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
            for (const endpoint of ['followers', 'following']) {
                if (STATE.stopScanFlag) throw new DOMException('Scan aborted by user', 'AbortError');
                phase.textContent = endpoint === 'followers' ? '[1/2] Fetching Followers...' : '[2/2] Fetching Following...';
                const limit = endpoint === 'followers' ? APP_CONFIG.FOLLOWERS_PAGE_SAFETY_LIMIT : APP_CONFIG.FOLLOWING_PAGE_SAFETY_LIMIT;
                const result = await IgBridge.fetchAllRelationships(endpoint, currentUser.id, limit, (count, page, msg) => {
                    el('maxpland-scan-stat-count').textContent = `${endpoint}: ${count.toLocaleString()}`;
                    el('maxpland-scan-stat-page').textContent = `Pages: ${page}`;
                    el('maxpland-progress-fill').style.width = `${Math.min(95, Math.min(45, page * 3) + (lists.followers ? 45 : 0))}%`;
                    if (msg) { notice.textContent = msg; notice.style.display = 'block'; }
                    if (freshBtn) freshBtn.style.display = STATE.scanResumedFrom ? '' : 'none';
                }, speedMode);

                if (STATE.stopScanFlag) throw new DOMException('Scan aborted by user', 'AbortError');
                if (!result.completed) throw result.lastError || new Error(`Incomplete fetch for ${endpoint}`);
                lists[endpoint] = result;
            }

            const { followers, following } = lists;
            const buckets = computeRelationshipBuckets(followers, following);
            const { followerIdSet, followingIdSet, followingUsernameSet } = buckets;

            const [prev, whitelist] = await Promise.all([
                MaxPlandVault.getLatestSnapshot(currentUser.id),
                MaxPlandVault.getWhitelist()
            ]);
            IgBridge.assertAccount(currentUser.id);
            if (STATE.stopScanFlag) throw new DOMException('Scan aborted by user', 'AbortError');

            const prevUsernames = { ...(prev?.follower_usernames || {}), ...(prev?.usernames || {}) };
            const lostFollowers = (prev?.follower_ids || [])
                .filter(id => !followerIdSet.has(String(id)))
                .map(id => {
                    const sid = String(id);
                    const uname = prevUsernames[sid] || `user_${sid}`;
                    const gone = !followingIdSet.has(sid) && !followingUsernameSet.has(String(uname).toLowerCase());
                    return {
                        pk: sid, id: sid, username: uname, profile_pic_url: '',
                        full_name: gone ? 'Gone — blocked us or deactivated' : 'Unfollowed since previous scan'
                    };
                });

            const renamed = [];
            if (prev && typeof prevUsernames === 'object') {
                const currentById = new Map(followers.map(f => [getUid(f), f]));
                for (const [sid, oldName] of Object.entries(prevUsernames)) {
                    if (!oldName) continue;
                    const now = currentById.get(sid);
                    const newName = getUname(now);
                    if (now && newName && newName.toLowerCase() !== oldName.toLowerCase()) {
                        renamed.push({
                            pk: sid, id: sid, username: newName,
                            full_name: `Renamed from @${oldName}`,
                            profile_pic_url: now.profile_pic_url || '',
                            is_verified: Boolean(now.is_verified),
                            is_private: Boolean(now.is_private),
                            has_anonymous_profile_picture: Boolean(now.has_anonymous_profile_picture)
                        });
                    }
                }
            }

            await MaxPlandVault.saveSnapshot(followers, following, currentUser.id, STATE.scanController.signal);

            try {
                const history = await MaxPlandVault.getChurnHistory(currentUser.id, APP_CONFIG.SNAPSHOT_RETENTION - 1);
                const everLost = new Set();
                for (const cycle of history) for (const entry of cycle.lost || []) everLost.add(String(entry.id));
                const prevFollowerIds = new Set((prev?.follower_ids || []).map(String));
                const rejoined = followers
                    .filter(u => { const id = getUid(u); return Boolean(id) && !prevFollowerIds.has(id) && everLost.has(id); })
                    .map(u => ({ id: getUid(u), username: getUname(u) }));

                const cap = 1000;
                const churnRecord = {
                    lost: lostFollowers.slice(0, cap).map(u => ({ id: String(u.id), username: getUname(u) })),
                    rejoined: rejoined.slice(0, cap),
                    renamed: renamed.slice(0, cap).map(u => ({ id: String(u.id), to: getUname(u) })),
                    truncated: lostFollowers.length > cap || rejoined.length > cap || renamed.length > cap,
                    follower_count: followers.length,
                    following_count: following.length
                };
                await MaxPlandVault.saveChurn(churnRecord, currentUser.id, STATE.scanController.signal);
                const cycles = [{ ...churnRecord, timestamp: Date.now() }, ...history];
                STATE.churnLost30 = flattenChurnLost(cycles);
                STATE.churnCycles = cycles.length;
            } catch (_) {}

            Object.assign(STATE, {
                followers, following, whitelist, lostFollowers, renamed, scanIncomplete: false,
                notFollowingBack: buckets.notFollowingBack,
                fans: buckets.fans,
                mutual: buckets.mutual,
                ghostFollowers: buckets.ghostFollowers
            });

            syncRelationshipStatCounters();
            el('maxpland-progress-fill').style.width = '100%';
            phase.textContent = 'Scan completed';
            notice.style.display = 'none';

            const fs = lists.followers.fetchStats || { requestMs: 0, waitMs: 0 };
            const fw = lists.following.fetchStats || { requestMs: 0, waitMs: 0 };
            STATE.scanStatus = {
                requestMs: fs.requestMs + fw.requestMs,
                waitMs: fs.waitMs + fw.waitMs,
                wallMs: Date.now() - STATE.scanStartTime
            };
            summary.textContent = `Followers ${followers.length.toLocaleString()} · Following ${following.length.toLocaleString()} · Fetch ${formatDurationMs(STATE.scanStatus.requestMs)} · Pacing ${formatDurationMs(STATE.scanStatus.waitMs)} · Total ${formatDurationMs(STATE.scanStatus.wallMs)}`;
            showToast('Relationship scan completed');
        } catch (err) {
            const cooling = err?.code === 'RATE_LIMIT';
            phase.textContent = STATE.stopScanFlag || err.name === 'AbortError' ? 'Scan stopped' : cooling ? 'Paused · rate limit' : 'Scan halted';
            notice.textContent = `⚠️ ${err.message} · Checkpoint saved in IndexedDB`;
            notice.style.display = 'block';
            summary.textContent = phase.textContent;
        } finally {
            clearInterval(timer);
            btn.disabled = false;
            STATE.isScanning = false;
            STATE.scanController = null;
            STATE.scanPaused = false;
            pauseBtn.style.display = 'none';
            if (freshBtn) freshBtn.style.display = 'none';
            renderRelationshipList();
            if (!STATE.scanIncomplete) {
                STATE.progressHideTimer = setTimeout(() => { progress.style.display = 'none'; }, 2500);
            }
        }
    }

    let followedIdIndex = new Set(), followedIdSource = null, followedIdCount = -1;
    function getFollowedIdIndex() {
        if (followedIdSource !== STATE.following || followedIdCount !== STATE.following.length) {
            followedIdSource = STATE.following;
            followedIdCount = STATE.following.length;
            followedIdIndex = new Set(STATE.following.map(getUid));
        }
        return followedIdIndex;
    }

    function getFilteredUsers() {
        const poolMap = {
            not_following_back: STATE.notFollowingBack,
            fans: STATE.fans,
            mutual: STATE.mutual,
            lost: STATE.lostFollowers,
            ghost: STATE.ghostFollowers,
            renamed: STATE.renamed || [],
            inactive: STATE.inactiveFollowing,
            churn: STATE.churnLost30 || [],
            whitelist: Array.from(STATE.whitelist.values())
        };
        const pool = poolMap[STATE.relationshipFilter] || [];
        const followedIds = getFollowedIdIndex();

        return pool.filter(u => {
            const uid = getUid(u);
            const uname = getUname(u).toLowerCase();
            const isFollowedByUs = uid !== '' && followedIds.has(uid);
            if (STATE.subFilters.onlyFollowing && !isFollowedByUs) return false;
            if (STATE.subFilters.onlyNotFollowed && isFollowedByUs) return false;
            if (STATE.subFilters.excludeWhitelist && isProtectedUser(uid, uname)) return false;
            if (STATE.subFilters.excludeVerified && u.is_verified) return false;
            if (STATE.subFilters.excludePrivate && u.is_private) return false;
            if (STATE.subFilters.excludeNoAvatar && hasNoAvatar(u)) return false;
            if (STATE.searchQuery) {
                const q = STATE.searchQuery;
                const matchUser = uname.includes(q);
                const matchName = String(u.full_name || '').toLowerCase().includes(q);
                if (!matchUser && !matchName) return false;
            }
            return true;
        });
    }

    function setFollowStateChip(which) {
        const next = !STATE.subFilters[which];
        STATE.subFilters.onlyFollowing = which === 'onlyFollowing' && next;
        STATE.subFilters.onlyNotFollowed = which === 'onlyNotFollowed' && next;
        STATE.relationshipLimit = 100;
        document.getElementById('toggle-filter-following')?.classList.toggle('active', STATE.subFilters.onlyFollowing);
        document.getElementById('toggle-filter-notfollowing')?.classList.toggle('active', STATE.subFilters.onlyNotFollowed);
        renderRelationshipList();
    }

    function renderRelationshipList() {
        const listEl = document.getElementById('maxpland-relationship-list');
        if (!listEl) return;
        const currentPool = getFilteredUsers();

        const tagConfig = {
            not_following_back: ['not_following', 'Not Following Back'],
            fans: ['fan', 'Fan'],
            mutual: ['mutual', 'Mutual'],
            lost: ['lost', 'Lost'],
            ghost: ['ghost', '👻 Ghost'],
            renamed: ['fan', '✏️ Renamed'],
            inactive: ['ghost', '⏱️ Inactive'],
            churn: ['lost', '🔻 Lost 30d'],
            whitelist: ['mutual', '⭐ Whitelist']
        };
        const [tagClass, tagText] = tagConfig[STATE.relationshipFilter] || ['not_following', 'Not Following Back'];

        if (STATE.scanIncomplete && STATE.followers.length === 0 && ['not_following_back', 'mutual', 'fans'].includes(STATE.relationshipFilter)) {
            listEl.innerHTML = `
                <div style="padding: 48px 24px; text-align: center; color: var(--mp-rose); line-height: 1.6;">
                    <div style="font-size: 15px; font-weight: 600; margin-bottom: 8px;">${STATE.isScanning ? 'Scanning relationships...' : 'No complete scan results yet'}</div>
                    <div style="color: var(--mp-text-secondary); font-size: 13px; max-width: 500px; margin: 0 auto;">
                        ${STATE.isScanning ? 'Please wait for followers and following to finish fetching.' : 'Click Scan Relationships to start or resume from checkpoint.'}
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
        const canUnfollowInTab = ['not_following_back', 'mutual', 'inactive'].includes(STATE.relationshipFilter);

        listEl.innerHTML = visibleUsers.map(user => {
            const uid = getUid(user);
            const uname = getUname(user);
            const isWhitelisted = isProtectedUser(uid, uname.toLowerCase());
            const isChecked = STATE.selectedIds.has(uid);
            const avatar = user.profile_pic_url || '';
            const initial = (uname || '?').slice(0, 1).toUpperCase();
            let displayTag = tagText;
            if (STATE.relationshipFilter === 'inactive' && user.dormant_days !== undefined) {
                displayTag = typeof user.dormant_days === 'number' ? `⏱️ Inactive ${user.dormant_days}d` : `⏱️ ${user.dormant_days}`;
            }

            return `
                <div class="maxpland-user-row" data-id="${escapeHtml(uid)}">
                    <div class="maxpland-user-left">
                        <input type="checkbox" class="maxpland-checkbox user-select-checkbox" data-id="${escapeHtml(uid)}" aria-label="Select @${escapeHtml(uname || uid)}" ${isChecked ? 'checked' : ''} ${isWhitelisted ? 'disabled title="Protected in Whitelist"' : ''}>
                        ${avatar ? `<img class="maxpland-avatar" src="${escapeHtml(avatar)}" loading="lazy" alt="">` : `<span class="maxpland-avatar">${escapeHtml(initial)}</span>`}
                        <div class="maxpland-user-names">
                            <div class="maxpland-username-wrap">
                                <a href="https://www.instagram.com/${encodeURIComponent(uname)}/" target="_blank" rel="noopener noreferrer" class="maxpland-username">${escapeHtml(uname || 'unknown')}</a>
                                ${user.is_verified ? `<span title="Verified">${ICONS.VERIFIED}</span>` : ''}
                                ${user.is_private ? `<span title="Private Account" style="color:var(--mp-text-muted);display:flex;align-items:center;">${ICONS.LOCK}</span>` : ''}
                                <span class="maxpland-status-tag ${tagClass}">${escapeHtml(displayTag)}</span>
                            </div>
                            <span class="maxpland-fullname">${escapeHtml(user.full_name || '')}</span>
                        </div>
                    </div>
                    <div class="maxpland-user-actions">
                        <a href="https://www.instagram.com/${encodeURIComponent(uname)}/" target="_blank" rel="noopener noreferrer" class="maxpland-icon-action" title="Open Instagram Profile">
                            ${ICONS.EXTERNAL}
                        </a>
                        <button type="button" class="maxpland-icon-action maxpland-star-btn" data-id="${escapeHtml(uid)}" title="${isWhitelisted ? 'Remove from Whitelist' : 'Add to Whitelist'}">
                            ${isWhitelisted ? ICONS.STAR_FILLED : ICONS.STAR}
                        </button>
                        ${canUnfollowInTab ? `
                            <button type="button" class="maxpland-row-unfollow-btn" data-id="${escapeHtml(uid)}" data-user="${escapeHtml(uname)}" ${isWhitelisted ? 'disabled title="Protected in Whitelist"' : ''}>
                                ${ICONS.UNFOLLOW} Unfollow
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        if (visibleUsers.length < currentPool.length) {
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'maxpland-btn-secondary';
            more.style.cssText = 'margin: 10px auto; display: block;';
            more.textContent = `Show more (${visibleUsers.length.toLocaleString()} / ${currentPool.length.toLocaleString()})`;
            more.onclick = () => { STATE.relationshipLimit += 100; renderRelationshipList(); };
            listEl.append(more);
        }
    }

    function applyUnfollowResult(uid, username = '') {
        const targetName = String(username || '').toLowerCase();
        const isTarget = (u) => (uid && getUid(u) === uid) || (targetName && getUname(u).toLowerCase() === targetName);

        STATE.following = STATE.following.filter(u => !isTarget(u));
        STATE.notFollowingBack = STATE.notFollowingBack.filter(u => !isTarget(u));
        STATE.mutual = STATE.mutual.filter(u => !isTarget(u));
        STATE.inactiveFollowing = STATE.inactiveFollowing.filter(u => !isTarget(u));

        const fan = STATE.followers.find(isTarget);
        if (fan && !STATE.fans.some(isTarget)) STATE.fans.push(fan);
        syncRelationshipStatCounters();
    }

    function updateBulkActionBar() {
        const bar = document.getElementById('maxpland-bulk-bar');
        const countLabel = document.getElementById('maxpland-bulk-count-label');
        if (!bar || !countLabel) return;
        const count = STATE.selectedIds.size;
        bar.style.display = count > 0 ? 'flex' : 'none';
        countLabel.textContent = `${count.toLocaleString()} selected`;
    }

    function selectAllVisible() {
        const visiblePool = getFilteredUsers().slice(0, STATE.relationshipLimit || 100);
        visiblePool.forEach(u => {
            const uid = getUid(u);
            if (uid && !isProtectedUser(uid, getUname(u).toLowerCase())) {
                STATE.selectedIds.add(uid);
            }
        });
        updateBulkActionBar();
        renderRelationshipList();
    }

    // High-Value Feature: Smart Pick Quota (1-click safe selection up to remaining daily quota)
    function smartPickQuota() {
        const { remaining, blocked, cap } = budgetState();
        if (blocked) {
            showToast('⛔ Daily unfollow ceiling already reached for today', 4000);
            return;
        }
        const targetLimit = Number.isFinite(remaining) ? remaining : 50;
        const candidates = getFilteredUsers().filter(u => {
            const uid = getUid(u);
            return Boolean(uid) && !u.is_verified && !isProtectedUser(uid, getUname(u).toLowerCase());
        });

        if (!candidates.length) {
            showToast('No eligible non-verified, non-whitelisted accounts in current view');
            return;
        }

        STATE.selectedIds.clear();
        const picked = candidates.slice(0, targetLimit);
        for (const u of picked) STATE.selectedIds.add(getUid(u));
        if (picked.length > STATE.relationshipLimit) STATE.relationshipLimit = Math.ceil(picked.length / 100) * 100;

        updateBulkActionBar();
        renderRelationshipList();
        showToast(`⚡ Smart Picked ${picked.length} safe account(s)${cap ? ` (matches remaining daily quota)` : ''}`);
    }

    async function runBatchUnfollow() {
        if (STATE.isUnfollowing || STATE.isScanning || STATE.isScanningInactive || STATE.scanIncomplete) return;
        const count = STATE.selectedIds.size;
        if (count === 0) return;

        const estSeconds = Math.round(count * ((APP_CONFIG.UNFOLLOW_DELAY_MIN + APP_CONFIG.UNFOLLOW_DELAY_MAX) / 2000));
        if (!confirm(`⚠️ Unfollow ${count} selected account(s)?\nEstimated time: ~${Math.ceil(estSeconds / 60)} min (${APP_CONFIG.UNFOLLOW_DELAY_MIN / 1000}–${APP_CONFIG.UNFOLLOW_DELAY_MAX / 1000}s random jitter)\nStatus: ${formatBudget()}\n\nStart now?`)) return;

        STATE.isUnfollowing = true;
        STATE.stopUnfollowFlag = false;
        clearTimeout(STATE.progressHideTimer);

        const el = (id) => document.getElementById(id);
        const progressCont = el('maxpland-global-progress');
        const progressFill = el('maxpland-progress-fill');
        const phaseEl = el('maxpland-scan-phase');
        const statCount = el('maxpland-scan-stat-count');
        const statPage = el('maxpland-scan-stat-page');
        const noticeEl = el('maxpland-scan-notice');

        progressCont.style.display = 'block';
        phaseEl.textContent = 'Starting safe unfollow queue...';
        noticeEl.style.display = 'none';

        const idsToUnfollow = Array.from(STATE.selectedIds);
        let successCount = 0, failCount = 0;

        try {
            for (let i = 0; i < idsToUnfollow.length; i++) {
                if (STATE.stopUnfollowFlag) {
                    phaseEl.textContent = 'Unfollow batch stopped by user';
                    break;
                }

                const uid = idsToUnfollow[i];
                const userObj = STATE.notFollowingBack.find(u => getUid(u) === uid) || STATE.following.find(u => getUid(u) === uid);
                if (isProtectedUser(uid, userObj?.username)) {
                    STATE.selectedIds.delete(uid);
                    continue;
                }
                const uname = userObj?.username ? `@${userObj.username}` : `UID ${uid}`;

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
                    if (err?.code === 'DAILY_CAP') {
                        noticeEl.textContent = err.message;
                        noticeEl.style.display = 'block';
                        break;
                    }
                    // Auto-Cooldown on Soft 429 Rate Limit if enabled
                    if (err?.code === 'RATE_LIMIT' && STATE.prefs?.autoWaitRateLimit && !IgBridge.hardBlockAccount) {
                        const waitSecs = Math.max(10, Math.ceil((IgBridge.cooldownUntil - Date.now()) / 1000));
                        noticeEl.textContent = `⏳ Soft rate limit detected — auto-cooling down for ${waitSecs}s before retrying ${uname}`;
                        noticeEl.style.display = 'block';
                        for (let s = waitSecs; s > 0 && !STATE.stopUnfollowFlag; s--) {
                            phaseEl.textContent = `Cooling down Soft 429... ${s}s remaining`;
                            await sleep(1000);
                        }
                        if (!STATE.stopUnfollowFlag) {
                            noticeEl.style.display = 'none';
                            i--; // Retry current user after cooldown
                            continue;
                        }
                        break;
                    }

                    failCount++;
                    noticeEl.textContent = err.message || 'Unfollow failed';
                    noticeEl.style.display = 'block';
                    STATE.stopUnfollowFlag = true;
                    break;
                }

                if (i < idsToUnfollow.length - 1 && !STATE.stopUnfollowFlag) {
                    const delay = Math.floor(Math.random() * (APP_CONFIG.UNFOLLOW_DELAY_MAX - APP_CONFIG.UNFOLLOW_DELAY_MIN + 1)) + APP_CONFIG.UNFOLLOW_DELAY_MIN;
                    for (let s = Math.ceil(delay / 1000); s > 0 && !STATE.stopUnfollowFlag; s--) {
                        phaseEl.textContent = `Safety jitter delay... ${s}s (${uname} unfollowed)`;
                        await sleep(1000);
                    }
                }
            }

            syncRelationshipStatCounters();
            updateBulkActionBar();
            renderRelationshipList();
            syncBudgetLabels();
            showToast(`Unfollow finished: ${successCount} succeeded, ${failCount} failed`);
        } finally {
            STATE.isUnfollowing = false;
            if (!STATE.stopUnfollowFlag) {
                STATE.progressHideTimer = setTimeout(() => { progressCont.style.display = 'none'; }, 2500);
            }
        }
    }

    /* ==========================================================================
       10. EXPORT, BACKUP, INACTIVE RADAR & ANALYTICS
       ========================================================================== */

    async function copyVisibleUsernames() {
        const pool = getFilteredUsers();
        if (!pool.length) { showToast('No usernames in current view'); return; }
        const text = pool.map(getUname).filter(Boolean).join('\n');
        try {
            if (typeof GM_setClipboard === 'function') GM_setClipboard(text, 'text');
            else await navigator.clipboard.writeText(text);
            showToast(`Copied ${pool.length.toLocaleString()} usernames to clipboard`);
        } catch (_) {
            alert('Failed to copy to clipboard.');
        }
    }

    function exportRelationshipCSV() {
        const pool = getFilteredUsers();
        if (!pool.length) { showToast('No data to export'); return; }
        const rows = [['User ID', 'Username', 'Full Name', 'Is Verified', 'Is Private', 'Category', 'Whitelisted', 'Profile URL']];
        pool.forEach(u => {
            const uid = getUid(u), uname = getUname(u);
            rows.push([
                uid, uname, u.full_name || '',
                u.is_verified ? 'Yes' : 'No',
                u.is_private ? 'Yes' : 'No',
                STATE.relationshipFilter,
                isProtectedUser(uid, uname) ? 'Yes' : 'No',
                uname ? `https://www.instagram.com/${uname}/` : ''
            ]);
        });
        const csv = '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
        downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `IG_MaxPland_${STATE.relationshipFilter}_${localDayKey()}.csv`);
    }

    function exportRelationshipJSON() {
        const pool = getFilteredUsers();
        if (!pool.length) { showToast('No data to export'); return; }
        downloadBlob(new Blob([JSON.stringify(pool, null, 2)], { type: 'application/json;charset=utf-8;' }), `IG_MaxPland_${STATE.relationshipFilter}_${localDayKey()}.json`);
    }

    function exportWhitelistBackup() {
        const arr = Array.from(STATE.whitelist.values());
        if (!arr.length) { showToast('Whitelist is empty'); return; }
        downloadBlob(new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json;charset=utf-8;' }), `IG_MaxPland_Whitelist_Backup_${localDayKey()}.json`);
        showToast(`Exported ${arr.length} whitelisted accounts`);
    }

    async function handleWhitelistRestoreFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            if (!Array.isArray(data)) throw new Error('Backup file must be a JSON array');
            const count = await MaxPlandVault.importWhitelist(data);
            STATE.whitelist = await MaxPlandVault.getWhitelist();
            syncRelationshipStatCounters();
            renderRelationshipList();
            showToast(`Restored ${count} accounts to Whitelist`);
        } catch (err) {
            alert(`Restore failed: ${err.message || err}`);
        } finally {
            e.target.value = '';
        }
    }

    function syncFeaturesTab() {
        const el = (id) => document.getElementById(id);
        const p = STATE.prefs || {};
        if (el('pref-switch-stealth-story')) el('pref-switch-stealth-story').checked = Boolean(p.stealthStory);
        if (el('pref-switch-clean-feed')) el('pref-switch-clean-feed').checked = Boolean(p.cleanFeed);
        if (el('pref-switch-feed-download')) el('pref-switch-feed-download').checked = Boolean(p.quickDownloadFeed);
        if (el('pref-switch-story-toolbar')) el('pref-switch-story-toolbar').checked = Boolean(p.quickDownloadStory);
        if (el('pref-switch-auto-wait')) el('pref-switch-auto-wait').checked = p.autoWaitRateLimit !== false;
    }

    function syncSettingsTab() {
        const el = (id) => document.getElementById(id);
        const p = STATE.prefs || {};
        if (el('pref-setting-inactive-threshold')) el('pref-setting-inactive-threshold').value = String(p.inactiveThresholdDays || 180);
        if (el('pref-setting-scan-speed')) el('pref-setting-scan-speed').value = ['B', 'C'].includes(p.scanSpeed) ? p.scanSpeed : 'A';
        if (el('pref-setting-daily-cap')) el('pref-setting-daily-cap').value = String(getDailyUnfollowCap());
        syncBudgetLabels();
    }

    async function runInactiveScan() {
        if (STATE.isScanning || STATE.isUnfollowing || STATE.isScanningInactive) return;
        if (STATE.scanIncomplete || !STATE.following.length) {
            alert('Run or hydrate a Relationship Scan first.');
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

        const el = (id) => document.getElementById(id);
        const progress = el('maxpland-global-progress');
        const phase = el('maxpland-scan-phase');
        const btn = el('maxpland-btn-scan-inactive');

        btn.disabled = true;
        progress.style.display = 'block';
        phase.textContent = '[Inactive Radar] Starting scan...';
        el('maxpland-scan-notice').style.display = 'none';
        el('maxpland-scan-stat-count').textContent = 'Inactive: 0';
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
                const uid = getUid(user);
                const cached = await MaxPlandVault.getUserActivity(uid);
                if (signal.aborted) break;

                const cacheValid = cached?.checked_at && (Date.now() - cached.checked_at < APP_CONFIG.INACTIVE_CACHE_TTL_MS);
                if (!cacheValid && newFetches >= APP_CONFIG.INACTIVE_FETCH_CAP_PER_RUN) break;

                phase.textContent = `[Inactive Radar] Checking @${user.username || uid} (${checked + 1}/${pool.length})...`;
                let lastTakenAt = cached?.last_post_taken_at;
                let hasPosts = cached?.has_posts !== false;
                let known = Boolean(cacheValid);

                if (!cacheValid) {
                    newFetches++;
                    try {
                        const info = await IgBridge.fetchUserLastPost(uid, { signal });
                        if (signal.aborted) break;
                        lastTakenAt = info.last_taken_at;
                        hasPosts = info.has_posts;
                        known = true;
                        await MaxPlandVault.saveUserActivity({
                            id: uid,
                            username: user.username || '',
                            last_post_taken_at: lastTakenAt,
                            has_posts: hasPosts,
                            checked_at: Date.now()
                        });
                    } catch (err) {
                        if (signal.aborted || err.name === 'AbortError' || IgBridge.isSessionError(err)) throw err;
                        failed++;
                        known = false;
                    }
                }

                checked++;
                if (known && (!hasPosts || (lastTakenAt && nowSec - lastTakenAt > thresholdSeconds))) {
                    STATE.inactiveFollowing.push({
                        ...user,
                        dormant_days: lastTakenAt ? Math.floor((nowSec - lastTakenAt) / 86400) : 'No posts'
                    });
                }

                el('maxpland-progress-fill').style.width = `${Math.round((checked / pool.length) * 100)}%`;
                el('maxpland-scan-stat-page').textContent = `Checked: ${checked}/${pool.length}`;
                el('maxpland-scan-stat-count').textContent = `Inactive: ${STATE.inactiveFollowing.length} · Unavail: ${failed}`;

                if (!cacheValid && checked < pool.length && newFetches < APP_CONFIG.INACTIVE_FETCH_CAP_PER_RUN) {
                    const jitter = 3200 + Math.floor(Math.random() * 2300);
                    for (let ms = 0; ms < jitter && !signal.aborted; ms += 250) await sleep(250);
                }
            }

            const statusMsg = signal.aborted
                ? 'Stopped by user'
                : checked < pool.length
                    ? `Batch limit (${APP_CONFIG.INACTIVE_FETCH_CAP_PER_RUN} live fetches) reached — click Inactive Radar again to continue`
                    : 'Scan complete';
            phase.textContent = `[Inactive Radar] ${statusMsg} (${checked}/${pool.length}) · Found ${STATE.inactiveFollowing.length}`;
            showToast(phase.textContent, 4500);
            if (!signal.aborted && checked === pool.length && !failed) {
                STATE.progressHideTimer = setTimeout(() => { progress.style.display = 'none'; }, 3000);
            }
        } catch (err) {
            phase.textContent = `[Inactive Radar] Halted: ${err.message} (${checked}/${pool.length})`;
            showToast(phase.textContent, 4000);
        } finally {
            clearInterval(timer);
            btn.disabled = false;
            STATE.isScanningInactive = false;
            STATE.inactiveController = null;
            syncRelationshipStatCounters();
            document.querySelector('.maxpland-pill-btn[data-filter="inactive"]')?.click();
        }
    }

    async function renderHealthDashboard() {
        const el = (id) => document.getElementById(id);
        const followerCount = STATE.followers.length;
        const followingCount = STATE.following.length;
        const ratio = followingCount > 0 ? (followerCount / followingCount) : 0;

        const ratioVal = el('health-ratio-val'), ratioBadge = el('health-ratio-badge');
        if (ratioVal && ratioBadge) {
            if (!followerCount && !followingCount) {
                ratioVal.textContent = '-';
                ratioBadge.textContent = 'Run relationship scan first';
            } else {
                ratioVal.textContent = `${ratio.toFixed(2)}x`;
                if (ratio >= 1.5) {
                    ratioBadge.textContent = '⭐ Creator / Authority';
                    ratioBadge.style.cssText = 'background:var(--mp-emerald-bg);color:var(--mp-emerald);';
                } else if (ratio >= 0.8) {
                    ratioBadge.textContent = '⚖️ Balanced Ratio';
                    ratioBadge.style.cssText = 'background:var(--mp-cyan-bg);color:var(--mp-cyan);';
                } else {
                    ratioBadge.textContent = '🔍 Following Heavy';
                    ratioBadge.style.cssText = 'background:var(--mp-amber-bg);color:var(--mp-amber);';
                }
            }
        }

        if (el('health-mutual-val') && el('health-mutual-badge')) {
            el('health-mutual-val').textContent = followingCount ? `${Math.round((STATE.mutual.length / followingCount) * 100)}%` : '-';
            el('health-mutual-badge').textContent = followingCount ? `${STATE.mutual.length.toLocaleString()} of ${followingCount.toLocaleString()} following` : 'No data';
        }

        if (el('health-notback-val') && el('health-notback-badge')) {
            el('health-notback-val').textContent = followingCount ? `${Math.round((STATE.notFollowingBack.length / followingCount) * 100)}%` : '-';
            el('health-notback-badge').textContent = followingCount ? `${STATE.notFollowingBack.length.toLocaleString()} accounts` : 'No data';
        }

        if (el('health-ghost-val') && el('health-ghost-badge')) {
            const totalGhost = STATE.ghostFollowers.length + STATE.inactiveFollowing.length;
            el('health-ghost-val').textContent = (followerCount || followingCount) ? `${totalGhost.toLocaleString()} accounts` : '-';
            el('health-ghost-badge').textContent = `Ghost: ${STATE.ghostFollowers.length} · Inactive: ${STATE.inactiveFollowing.length}`;
        }

        const chartBox = el('health-chart-container'), deltaLabel = el('health-drift-delta');
        try {
            const accountId = STATE.relationshipAccountId || STATE.currentUser?.id;
            const snapshots = await MaxPlandVault.getAllSnapshots(accountId, 10);
            if (snapshots.length >= 2) {
                const sorted = [...snapshots].reverse();
                const counts = sorted.map(s => s.follower_count || 0);
                const min = Math.min(...counts), max = Math.max(...counts);
                const diff = counts[counts.length - 1] - counts[0];

                if (deltaLabel) {
                    deltaLabel.textContent = `${diff >= 0 ? '+' : ''}${diff.toLocaleString()} followers`;
                    deltaLabel.style.color = diff >= 0 ? 'var(--mp-emerald)' : 'var(--mp-rose)';
                }

                const w = 700, h = 110, pad = 24, range = (max - min) || 1;
                const points = counts.map((c, i) => ({
                    x: pad + (i / (counts.length - 1)) * (w - pad * 2),
                    y: h - pad - ((c - min) / range) * (h - pad * 2),
                    val: c,
                    date: new Date(sorted[i].timestamp).toLocaleDateString('en-GB')
                }));

                const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                const dots = points.map(p => `
                    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#38bdf8" stroke="#090b0e" stroke-width="2">
                        <title>${escapeHtml(p.date)}: ${p.val.toLocaleString()} followers</title>
                    </circle>
                    <text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" font-size="10" fill="#94a3b8" text-anchor="middle">${p.val}</text>
                `).join('');

                chartBox.innerHTML = `
                    <svg viewBox="0 0 ${w} ${h}" class="maxpland-sparkline">
                        <polyline fill="none" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />
                        ${dots}
                    </svg>
                `;
            } else if (snapshots.length === 1) {
                if (deltaLabel) deltaLabel.textContent = '1 snapshot recorded';
                chartBox.innerHTML = `<div style="padding:20px;text-align:center;color:var(--mp-text-muted);">Baseline snapshot saved (${snapshots[0].follower_count.toLocaleString()} followers). Run another scan later to plot trend curve.</div>`;
            }
        } catch (_) {}

        const advice = el('health-advice-text');
        if (advice && (followerCount || followingCount)) {
            if (STATE.notFollowingBack.length > 50) {
                advice.textContent = `You have ${STATE.notFollowingBack.length.toLocaleString()} unrequited follows. Use "⚡ Smart Pick Quota" in the Relationships tab to prune non-verified, non-whitelisted accounts within safe daily limits.`;
            } else if (ratio >= 1.0) {
                advice.textContent = `Healthy follower-to-following ratio (${ratio.toFixed(2)}x) with ${Math.round((STATE.mutual.length / (followingCount || 1)) * 100)}% mutual reciprocity.`;
            } else {
                advice.textContent = `Your following list exceeds your followers. Run Inactive Radar to identify and remove dormant accounts that haven't posted in ${STATE.prefs?.inactiveThresholdDays || 180}+ days.`;
            }
        }
    }

    async function renderMediaVault() {
        const list = document.getElementById('maxpland-vault-list');
        if (!list) return;
        const rows = await MaxPlandVault.getMediaVault(100);
        if (!rows.length) {
            list.innerHTML = '<div style="padding:48px;text-align:center;color:var(--mp-text-muted);">No download history yet</div>';
            return;
        }
        list.innerHTML = rows.map(r => `
            <div class="maxpland-user-row">
                <div class="maxpland-user-names">
                    <span class="maxpland-username">${escapeHtml(r.username || 'instagram')} · ${escapeHtml(r.shortcode || '')}</span>
                    <span class="maxpland-fullname">${escapeHtml(r.media_type || '')} · ${escapeHtml(new Date(r.downloaded_at).toLocaleString())}</span>
                </div>
                <a class="maxpland-btn-secondary" target="_blank" rel="noopener noreferrer" href="https://www.instagram.com/p/${encodeURIComponent(r.shortcode || '')}/" style="text-decoration:none;padding:3px 8px;font-size:11px;">View</a>
            </div>
        `).join('');
    }

    async function runMediaQueue({ skipExisting = false } = {}) {
        if (STATE.isMediaQueueRunning) return;
        const input = document.getElementById('maxpland-media-queue-input');
        const status = document.getElementById('maxpland-media-queue-status');
        const codes = extractShortcodesFromText(input.value || '');
        if (!codes.length) { alert('Please paste Instagram post/Reel URLs or shortcodes first.'); return; }

        const accountId = IgBridge.getCookie('ds_user_id');
        const key = JSON.stringify([accountId, codes, skipExisting]);
        if (STATE.mediaQueue?.key !== key) STATE.mediaQueue = { key, finished: new Set(), attempted: new Set() };
        const queue = STATE.mediaQueue;

        STATE.isMediaQueueRunning = true;
        const buttons = ['maxpland-btn-run-media-queue', 'maxpland-btn-run-media-all'].map(id => document.getElementById(id)).filter(Boolean);
        buttons.forEach(b => { b.disabled = true; });
        input.disabled = true;

        let done = 0, skipped = 0, failed = 0, stopped = false;
        try {
            IgBridge.assertAccount(accountId);
            for (let i = 0; i < codes.length; i++) {
                const code = codes[i];
                if (queue.finished.has(code)) continue;
                status.textContent = `${i + 1}/${codes.length} · Fetching ${code}...`;
                try {
                    const retry = queue.attempted.has(code);
                    queue.attempted.add(code);
                    const res = await downloadByShortcode(code, { skipExisting: skipExisting || retry, allCarousel: true });
                    for (const item of res) {
                        if (item.status === 'done') done++;
                        else if (item.status === 'skipped') skipped++;
                    }
                    queue.finished.add(code);
                } catch (err) {
                    failed++;
                    if (IgBridge.isSessionError(err)) {
                        stopped = true;
                        status.textContent = `Queue paused: ${err.message} · ${codes.length - queue.finished.size} remaining.`;
                        break;
                    }
                }
                if (i < codes.length - 1) await sleep(1800 + Math.floor(Math.random() * 1200));
            }
            if (!stopped) {
                status.textContent = `Downloaded: ${done} · Skipped: ${skipped} · Failed: ${failed} (${queue.finished.size}/${codes.length})`;
            }
        } catch (err) {
            status.textContent = err.message;
        } finally {
            STATE.isMediaQueueRunning = false;
            if (queue.finished.size === codes.length) STATE.mediaQueue = null;
            buttons.forEach(b => { b.disabled = false; });
            input.disabled = false;
            await renderMediaVault();
        }
    }

    /* ==========================================================================
       11. BOOTSTRAP & INITIALIZATION
       ========================================================================== */

    function safeStep(label, fn) {
        try { return fn(); } catch (err) { console.warn(`[MaxPland] ${label} failed`, err); return null; }
    }

    async function init() {
        if (document.getElementById('maxpland-trigger-btn')) return;
        createUI();

        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('Open IG MaxPland', () => StudioController.open());
        }

        try {
            await MaxPlandVault.init();
            STATE.whitelist = await MaxPlandVault.getWhitelist();
            syncRelationshipStatCounters();
        } catch (err) {
            console.warn('[MaxPland] Vault init warning', err);
        }

        IgBridge.restoreHardBlock();
        const blockRow = document.getElementById('maxpland-block-row');
        if (blockRow && IgBridge.hardBlockAccount) blockRow.style.display = '';
        syncBudgetLabels();

        safeStep('DOMEngine', () => DOMEngine.start());
        safeStep('menu close listener', () => document.addEventListener('click', closeAllMenus));
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init, { once: true });
    }

})();
