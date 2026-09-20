/**
 * IG MaxPland — Modernized Build & Distribution Pipeline (v3.0.0)
 * 
 * Bundles Clean Architecture modules from src/ into production userscripts:
 * - Reads metadata from package.json
 * - Topological concatenation of modules
 * - Builds both Thai Native (ig_maxpland.user.js) and Global English (ig_maxpland_en.user.js)
 * - Injects userscript header and CSS
 * - Strips dead code & redundant permissions
 * - Outputs to dist/ and synchronizes repository root
 * - Preserves exact invariants required by round1.check.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Topological module concatenation list
const MODULE_FILES = [
    // 1. Utilities
    'src/utils/Utils.js',
    'src/utils/DOMUtils.js',
    'src/utils/IGSelectors.js',
    // 2. Core Modules
    'src/modules/IgAuth.js',
    'src/modules/IgTransport.js',
    'src/modules/IgRelationship.js',
    'src/modules/IgMedia.js',
    'src/modules/IgProfile.js',
    'src/modules/IgUnfollow.js',
    // 3. State & UI Engines
    'src/core/StateManager.js',
    'src/core/FilterEngine.js',
    'src/ui/TemplateEngine.js',
    'src/ui/ProgressController.js',
    'src/ui/EventDelegator.js',
    // 4. Feature Modules
    'src/features/MediaDownloader.js',
    'src/features/DOMInjector.js',
    'src/features/StoryStealth.js',
    'src/features/CleanFeed.js'
];

function getPackageMetadata() {
    if (!fs.existsSync(PKG_PATH)) {
        throw new Error('package.json not found');
    }
    return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
}

function generateUserscriptHeader(pkg, isEn = false) {
    const desc = isEn
        ? 'Instagram Relationship Scanner & Clean Media Downloader. Track unfollowers, mutuals, fans, stealth story viewer, clean feed, and full-resolution media downloader (v3.0.0).'
        : (pkg.description || 'Instagram Relationship Scanner & Comprehensive Media Downloader (Clean Architecture v3.0.0)');
    const updateUrl = isEn
        ? 'https://raw.githubusercontent.com/Stxyu-p/ig-maxpland/main/ig_maxpland_en.user.js'
        : 'https://greasyfork.org/scripts/595787-ig-maxpland/code/ig-maxpland.user.js';
    const downloadUrl = isEn
        ? 'https://raw.githubusercontent.com/Stxyu-p/ig-maxpland/main/ig_maxpland_en.user.js'
        : 'https://greasyfork.org/scripts/595787-ig-maxpland/code/ig-maxpland.user.js';

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
// @homepageURL   https://greasyfork.org/th/scripts/595787-ig-maxpland
// @supportURL    https://greasyfork.org/th/scripts/595787-ig-maxpland/feedback
// @updateURL     ${updateUrl}
// @downloadURL   ${downloadUrl}
// @license      ${pkg.license || 'MIT'}
// ==/UserScript==
`;
}

function getAppSource(isEn = false, version = '3.0.0') {
    const appPath = isEn ? path.join(ROOT_DIR, 'src', 'app_en.js') : path.join(ROOT_DIR, 'src', 'app.js');
    if (!fs.existsSync(appPath)) {
        throw new Error(`Application source missing: ${appPath}`);
    }
    let content = fs.readFileSync(appPath, 'utf8');
    // Ensure footer matches current version
    content = content.replace(/MaxPland v\d+\.\d+\.\d+/g, `MaxPland v${version}`);
    return content;
}

function buildTarget(isEn = false) {
    const pkg = getPackageMetadata();
    const editionName = isEn ? 'Global English (EN)' : 'Thai Native (TH)';
    const filename = isEn ? 'ig_maxpland_en.user.js' : 'ig_maxpland.user.js';
    const distPath = path.join(DIST_DIR, filename);
    const rootPath = path.join(ROOT_DIR, filename);

    const startTime = Date.now();
    const header = generateUserscriptHeader(pkg, isEn);

    let bundle = header + '\n(() => {\n    \'use strict\';\n\n';
    bundle += '    /* ==========================================================================\n';
    bundle += `       MODULAR CORE ARCHITECTURE (v3.0.0 Clean Architecture - ${editionName})\n`;
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
    bundle += `       APPLICATION RUNTIME & UI GLUE (${editionName})\n`;
    bundle += '       ========================================================================== */\n\n';
    const appBody = getAppSource(isEn, pkg.version);
    bundle += appBody;

    // Ensure the bundle ends properly with closing IIFE
    const trimmed = bundle.trimEnd();
    if (!trimmed.endsWith('})();')) {
        bundle += '\n})();\n';
    }

    // Write output to dist and root
    fs.writeFileSync(distPath, bundle, 'utf8');
    fs.writeFileSync(rootPath, bundle, 'utf8');

    const elapsed = Date.now() - startTime;
    const stats = fs.statSync(distPath);
    const lineCount = bundle.split('\n').length;

    console.log(`[build:${isEn ? 'en' : 'th'}] Success: ${distPath}`);
    console.log(`[build:${isEn ? 'en' : 'th'}] Synced:  ${rootPath}`);
    console.log(`[build:${isEn ? 'en' : 'th'}] Size: ${(stats.size / 1024).toFixed(1)} KB | Lines: ${lineCount} | Time: ${elapsed}ms`);
    return { path: distPath, rootPath, size: stats.size, lines: lineCount };
}

function build() {
    console.log('[build] Starting IG MaxPland multi-edition build (v3.0.0)...');
    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }
    const thResult = buildTarget(false);
    const enResult = buildTarget(true);
    console.log('[build] Multi-edition build complete.');
    return { th: thResult, en: enResult };
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
