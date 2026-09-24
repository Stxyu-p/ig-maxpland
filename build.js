/**
 * IG MaxPland — Build & Distribution Pipeline (EN-only edition)
 *
 * Bundles Clean Architecture modules from src/ into the production userscript:
 * - Reads metadata from package.json
 * - Topological concatenation of modules
 * - Builds the Global English edition (ig_maxpland_en.user.js)
 *   ponytail: TH edition removed by owner decision (2026-09-24) — if a Thai
 *   edition is needed again, restore src/app.js from git history and re-add a
 *   second buildTarget() call.
 * - Injects userscript header and CSS
 * - Outputs to dist/ and synchronizes repository root
 * - Preserves exact invariants required by round1.check.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const OUTPUT_FILENAME = 'ig_maxpland_en.user.js';
const APP_SOURCE_PATH = path.join(ROOT_DIR, 'src', 'app_en.js');

// ponytail: bundle list is empty as of 2026-09-24 — the EN runtime (src/app_en.js)
// implements every flow itself (IgBridge + inline features; only guarded
// IgRelationship.hasNoAvatar is consulted and it has a local fallback), so the
// 17 extracted modules were 190 KB of dead weight parsed at document-start.
// Module files stay in src/ and phase1-5 tests exercise them directly.
// To re-integrate: list a module here once the app actually calls it.
const MODULE_FILES = [];

function getPackageMetadata() {
    if (!fs.existsSync(PKG_PATH)) {
        throw new Error('package.json not found');
    }
    return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
}

function generateUserscriptHeader(pkg) {
    const desc = pkg.description || 'Instagram Relationship Scanner & Comprehensive Media Downloader (Clean Architecture v3.0.0)';
    const updateUrl = 'https://raw.githubusercontent.com/Stxyu-p/ig-maxpland/main/ig_maxpland_en.user.js';
    const downloadUrl = 'https://raw.githubusercontent.com/Stxyu-p/ig-maxpland/main/ig_maxpland_en.user.js';

    return `// ==UserScript==
// @name         IG MaxPland
// @namespace    http://tampermonkey.net/
// @version      ${pkg.version}
// @description  ${desc}
// @author       ${pkg.author || 'P Choke & SORA'}
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
// @updateURL    ${updateUrl}
// @downloadURL  ${downloadUrl}
// @license      ${pkg.license || 'MIT'}
// ==/UserScript==
`;
}

function getAppSource(version = '3.0.0') {
    if (!fs.existsSync(APP_SOURCE_PATH)) {
        throw new Error(`Application source missing: ${APP_SOURCE_PATH}`);
    }
    let content = fs.readFileSync(APP_SOURCE_PATH, 'utf8');
    // Ensure footer matches current version
    content = content.replace(/MaxPland v\d+\.\d+\.\d+/g, `MaxPland v${version}`);
    return content;
}

function buildTarget() {
    const pkg = getPackageMetadata();
    const startTime = Date.now();
    const header = generateUserscriptHeader(pkg);
    const distPath = path.join(DIST_DIR, OUTPUT_FILENAME);
    const rootPath = path.join(ROOT_DIR, OUTPUT_FILENAME);

    let bundle = header + '\n(() => {\n    \'use strict\';\n\n';
    bundle += '    /* ==========================================================================\n';
    bundle += '       APPLICATION RUNTIME - Global English (modules live in src/, covered by phase1-5)\n';
    bundle += '       ========================================================================== */\n\n';

    // 1. Concatenate extracted modules
    for (const relPath of MODULE_FILES) {
        const fullPath = path.join(ROOT_DIR, relPath);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`Module file missing: ${relPath}`);
        }
        const moduleContent = fs.readFileSync(fullPath, 'utf8');
        bundle += `    // ─── Module: ${relPath} ──────────────────────────────────────\n`;
        bundle += moduleContent + '\n\n';
    }

    // 2. Append application runtime
    bundle += '    /* ==========================================================================\n';
    bundle += '       APPLICATION RUNTIME & UI GLUE (Global English)\n';
    bundle += '       ========================================================================== */\n\n';
    bundle += getAppSource(pkg.version);

    // Ensure the bundle ends properly with closing IIFE
    const trimmed = bundle.trimEnd();
    if (!trimmed.endsWith('})();')) {
        bundle += '\n})();\n';
    }

    // Normalize every line break to CRLF: this file's header/glue is LF while
    // src/app_en.js is CRLF — mixed endings make the // header block render as
    // one joined line in CRLF-strict viewers (Tampermonkey, old editors).
    bundle = bundle.replace(/\r\n|\r|\n/g, '\r\n');

    // Write output to dist and root
    fs.writeFileSync(distPath, bundle, 'utf8');
    fs.writeFileSync(rootPath, bundle, 'utf8');

    const elapsed = Date.now() - startTime;
    const stats = fs.statSync(distPath);
    const lineCount = bundle.split('\n').length;
    console.log(`[build] Success: ${distPath}`);
    console.log(`[build] Synced:  ${rootPath}`);
    console.log(`[build] Size: ${(stats.size / 1024).toFixed(1)} KB | Lines: ${lineCount} | Time: ${elapsed}ms`);
    return { path: distPath, rootPath, size: stats.size, lines: lineCount };
}

function build() {
    console.log('[build] Starting IG MaxPland build (EN-only)...');
    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }
    const result = buildTarget();
    console.log('[build] Build complete.');
    return { en: result };
}

// CLI Execution
if (require.main === module) {
    const isWatch = process.argv.includes('--watch');
    build();

    if (isWatch) {
        console.log('[build] Watching src/ for changes...');
        fs.watch(path.join(ROOT_DIR, 'src'), { recursive: true }, (event, filename) => {
            if (filename && (filename.endsWith('.js') || filename.endsWith('.css'))) {
                console.log(`[build] File changed: ${filename}. Rebuilding...`);
                try {
                    build();
                } catch (err) {
                    console.error('[build] Rebuild failed:', err.message);
                }
            }
        });
    }
}

module.exports = { build, buildTarget, MODULE_FILES };
