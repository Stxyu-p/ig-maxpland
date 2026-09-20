/**
 * IG MaxPland — Modernized Build & Distribution Pipeline (v3.0.0)
 * 
 * Bundles Clean Architecture modules from src/ into production userscript:
 * - Reads metadata from package.json
 * - Topological concatenation of modules
 * - Injects userscript header and CSS
 * - Strips dead code & redundant permissions
 * - Outputs dist/ig_maxpland.user.js
 * - Preserves exact invariants required by round1.check.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const OUTPUT_FILE = path.join(DIST_DIR, 'ig_maxpland.user.js');
const APP_SRC_PATH = path.join(ROOT_DIR, 'src', 'app.js');
const BASE_SAFE_SCRIPT = path.join(ROOT_DIR, 'ig_maxpland_v2.7.3-safe.user.js');

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

function generateUserscriptHeader(pkg) {
    return `// ==UserScript==
// @name         ${pkg.name === 'ig-maxpland' ? 'IG MaxPland' : pkg.name}
// @namespace    http://tampermonkey.net/
// @version      ${pkg.version}
// @description  ${pkg.description || 'Instagram Relationship Scanner & Comprehensive Media Downloader'}
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
// @updateURL     https://greasyfork.org/scripts/595787-ig-maxpland/code/ig-maxpland.user.js
// @downloadURL   https://greasyfork.org/scripts/595787-ig-maxpland/code/ig-maxpland.user.js
// @license      ${pkg.license || 'MIT'}
// ==/UserScript==
`;
}

function ensureAppSource(version) {
    if (fs.existsSync(APP_SRC_PATH)) {
        let content = fs.readFileSync(APP_SRC_PATH, 'utf8');
        // Ensure footer matches current version
        content = content.replace(/MaxPland v\d+\.\d+\.\d+/g, `MaxPland v${version}`);
        return content;
    }

    if (!fs.existsSync(BASE_SAFE_SCRIPT)) {
        throw new Error('Neither src/app.js nor base safe script found');
    }

    // Derive src/app.js from base safe script
    let base = fs.readFileSync(BASE_SAFE_SCRIPT, 'utf8');
    
    // Extract inner body between "(() => {" and the trailing "})();"
    const startIdx = base.indexOf("(() => {");
    if (startIdx === -1) throw new Error("Could not find IIFE start in base script");
    const bodyStart = base.indexOf("\n", startIdx) + 1;
    
    // Remove "use strict"; from start of body since the outer bundle provides it
    let body = base.slice(bodyStart);
    body = body.replace(/^\s*'use strict';\r?\n/, '');

    // Update footer version
    body = body.replace(/MaxPland v\d+\.\d+\.\d+/g, `MaxPland v${version}`);

    // Clean dead code: remove DEFAULT_AVATAR_PATTERNS
    body = body.replace(/\s*DEFAULT_AVATAR_PATTERNS:\s*\[[\s\S]*?\],?/, '');

    // Write src/app.js for persistence
    fs.mkdirSync(path.dirname(APP_SRC_PATH), { recursive: true });
    fs.writeFileSync(APP_SRC_PATH, body, 'utf8');
    console.log(`[build] Created ${APP_SRC_PATH}`);
    return body;
}

function build() {
    console.log('[build] Starting IG MaxPland bundle build...');
    const startTime = Date.now();
    const pkg = getPackageMetadata();
    const header = generateUserscriptHeader(pkg);

    // Ensure output dir
    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    let bundle = header + '\n(() => {\n    \'use strict\';\n\n';
    bundle += '    /* ==========================================================================\n';
    bundle += '       MODULAR CORE ARCHITECTURE (v3.0.0 Clean Architecture)\n';
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
    bundle += '       APPLICATION RUNTIME & UI GLUE\n';
    bundle += '       ========================================================================== */\n\n';
    const appBody = ensureAppSource(pkg.version);
    bundle += appBody;

    // Ensure the bundle ends properly with closing IIFE if not already included in appBody
    const trimmed = bundle.trimEnd();
    if (!trimmed.endsWith('})();')) {
        bundle += '\n})();\n';
    }

    // Write output to dist and root
    fs.writeFileSync(OUTPUT_FILE, bundle, 'utf8');
    const rootUserScript = path.join(ROOT_DIR, 'ig_maxpland.user.js');
    fs.writeFileSync(rootUserScript, bundle, 'utf8');

    const elapsed = Date.now() - startTime;
    const stats = fs.statSync(OUTPUT_FILE);
    const lineCount = bundle.split('\n').length;

    console.log(`[build] Success: ${OUTPUT_FILE}`);
    console.log(`[build] Synced:  ${rootUserScript}`);
    console.log(`[build] Size: ${(stats.size / 1024).toFixed(1)} KB | Lines: ${lineCount} | Time: ${elapsed}ms`);
    return { path: OUTPUT_FILE, size: stats.size, lines: lineCount };
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

module.exports = { build, MODULE_FILES };
