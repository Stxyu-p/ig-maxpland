/**
 * Phase 3 Verification Test Suite
 * Tests MediaDownloader, DOMInjector, StoryStealth, and CleanFeed.
 */

const assert = require('assert');
const { MediaDownloader } = require('../src/features/MediaDownloader.js');
const { DOMInjector } = require('../src/features/DOMInjector.js');
const { StoryStealth, LRUBoundedRegistry } = require('../src/features/StoryStealth.js');
const { CleanFeed, DEFAULT_AD_KEYWORDS, CLEAN_FEED_CSS } = require('../src/features/CleanFeed.js');

console.log('--- Testing Phase 3 Feature Modules ---');

(async () => {
    // 1. MediaDownloader Tests
    console.log('1. Testing MediaDownloader...');
    {
        // 1.1 Static Helpers
        const text = `
            https://www.instagram.com/p/C1234567890/
            Check this reel: https://instagram.com/reel/D0987654321/?igsh=xyz
            Random text
            ShortcodeOnly_123
        `;
        const codes = MediaDownloader.extractShortcodesFromText(text);
        assert.ok(codes.includes('C1234567890'), 'Extracted post shortcode');
        assert.ok(codes.includes('D0987654321'), 'Extracted reel shortcode');
        assert.ok(codes.includes('ShortcodeOnly_123'), 'Extracted bare shortcode');

        assert.strictEqual(MediaDownloader.safeFilename('bad/file:name*?'), 'bad_file_name_');
        assert.strictEqual(MediaDownloader.extensionFromUrl('https://example.com/photo.webp?token=123'), 'webp');
        assert.strictEqual(MediaDownloader.extensionFromUrl('https://example.com/video.mp4'), 'mp4');

        // 1.2 downloadResolvedMedia
        const downloadedFiles = [];
        const vaultRecords = [];
        const mockVault = {
            hasMedia: async (key) => key.includes('skip_me'),
            markMediaDownloaded: async (rec) => vaultRecords.push(rec)
        };
        const mockAuth = {
            getCookie: () => '12345',
            assertAccount: () => {}
        };
        const downloader = new MediaDownloader({
            igAuth: mockAuth,
            vault: mockVault,
            gmDownloadFn: (opts) => {
                downloadedFiles.push(opts.name);
                if (typeof opts.onload === 'function') opts.onload();
                return Promise.resolve(opts.name);
            }
        });

        const mockResolved = {
            shortcode: 'POST123',
            username: 'testuser',
            nodes: [
                { id: '1', index: 0, mediaType: 'image', imageUrl: 'https://cdn.example.com/img1.jpg' },
                { id: '2', index: 1, mediaType: 'video', progressiveVideoUrl: 'https://cdn.example.com/vid1.mp4' }
            ]
        };

        // Single download (nodes[0])
        const singleRes = await downloader.downloadResolvedMedia(mockResolved, { allCarousel: false });
        assert.strictEqual(singleRes.length, 1, 'Only first node downloaded when allCarousel is false');
        assert.strictEqual(singleRes[0].status, 'done');
        assert.strictEqual(downloadedFiles.length, 1);

        // All carousel download
        const allRes = await downloader.downloadResolvedMedia(mockResolved, { allCarousel: true });
        assert.strictEqual(allRes.length, 2, 'All carousel nodes downloaded');
        assert.strictEqual(downloadedFiles.length, 3); // 1 + 2

        // Skip existing
        const skipResolved = {
            shortcode: 'skip_me',
            username: 'testuser',
            nodes: [{ id: '1', index: 0, mediaType: 'image', imageUrl: 'https://cdn.example.com/img.jpg' }]
        };
        const skipRes = await downloader.downloadResolvedMedia(skipResolved, { skipExisting: true });
        assert.strictEqual(skipRes[0].status, 'skipped');

        // 1.3 downloadShortcode with retry
        let attempts = 0;
        const mockIgMedia = {
            resolve: async (code) => {
                attempts++;
                if (attempts < 2) throw new Error('Transient network timeout');
                return mockResolved;
            }
        };
        const retryDownloader = new MediaDownloader({
            igMedia: mockIgMedia,
            igAuth: mockAuth,
            vault: mockVault,
            gmDownloadFn: (opts) => {
                if (typeof opts?.onload === 'function') opts.onload();
                return Promise.resolve('ok');
            }
        });
        const retryRes = await retryDownloader.downloadShortcode('RETRY123');
        assert.strictEqual(retryRes[0].status, 'done');
        assert.strictEqual(attempts, 2, 'Successfully retried after transient failure');

        // 1.4 downloadQueue
        let progressUpdates = 0;
        const queueRes = await retryDownloader.downloadQueue(['C123', 'C456'], {
            onProgress: () => { progressUpdates++; }
        });
        assert.strictEqual(queueRes.total, 2, 'Total posts in queue is 2');
        assert.strictEqual(queueRes.done, 4, 'Total items downloaded is 4 (2 items per post)');
        assert.ok(progressUpdates >= 2, 'Received queue progress callbacks');

        console.log('PASS: MediaDownloader');
    }

    // 2. DOMInjector Tests
    console.log('2. Testing DOMInjector...');
    {
        const injector = new DOMInjector();
        assert.strictEqual(typeof injector.observe, 'function');
        assert.strictEqual(typeof injector.start, 'function');
        assert.strictEqual(typeof injector.destroy, 'function');

        let customObserved = false;
        injector.observe('.custom-element', () => { customObserved = true; });
        assert.strictEqual(injector.observers.has('.custom-element'), true);

        // Test mock article
        const mockArticle = {
            querySelector: (sel) => {
                if (sel === 'section') {
                    return {
                        querySelector: () => null,
                        lastElementChild: null,
                        appendChild: () => {}
                    };
                }
                return null;
            }
        };
        // Should not throw in Node mock environment
        injector.injectFeedButton(mockArticle);

        injector.destroy();
        assert.strictEqual(injector.observers.size, 0, 'Observers cleared on destroy');
        assert.strictEqual(injector.isStarted, false);

        console.log('PASS: DOMInjector');
    }

    // 3. StoryStealth Tests
    console.log('3. Testing StoryStealth...');
    {
        // 3.1 LRUBoundedRegistry
        const lru = new LRUBoundedRegistry(3);
        lru.set('1', { id: '1' });
        lru.set('2', { id: '2' });
        lru.set('3', { id: '3' });
        assert.strictEqual(lru.size, 3);
        assert.strictEqual(lru.has('1'), true);

        // Access 1 so 2 becomes oldest
        lru.get('1');
        // Add 4th item -> 2 should be evicted
        lru.set('4', { id: '4' });
        assert.strictEqual(lru.size, 3);
        assert.strictEqual(lru.has('2'), false, 'Oldest unaccessed item evicted');
        assert.strictEqual(lru.has('1'), true, 'Recently accessed item preserved');
        assert.strictEqual(lru.has('4'), true, 'New item preserved');

        // 3.2 Interception Rule Verification
        const stealth = new StoryStealth();
        stealth.enable();
        assert.strictEqual(stealth.isEnabled(), true);

        // Seen requests MUST be intercepted
        assert.strictEqual(stealth.isStorySeenRequest('https://www.instagram.com/api/v1/stories/reel/seen'), true);
        assert.strictEqual(stealth.isStorySeenRequest('https://www.instagram.com/graphql/query', '{"viewSeenAt": 12345678}'), true);
        assert.strictEqual(stealth.isStorySeenRequest('https://www.instagram.com/graphql/query', '{"operationName": "reels_media_seen"}'), true);

        // Read queries MUST NEVER be intercepted
        assert.strictEqual(stealth.isStorySeenRequest('https://www.instagram.com/graphql/query?operationName=PolarisProfileStoryRingQuery'), false);
        assert.strictEqual(stealth.isStorySeenRequest('https://www.instagram.com/api/v1/users/web_profile_info/'), false);

        // Disable stealth -> no interception
        stealth.disable();
        assert.strictEqual(stealth.isStorySeenRequest('https://www.instagram.com/api/v1/stories/reel/seen'), false);

        // 3.3 Fiber Walker Depth Limit
        // Create a circular return chain to verify depth cap
        const cyclicFiber = { memoizedProps: null };
        cyclicFiber.return = cyclicFiber;
        const mockEl = { __reactFiber$test: cyclicFiber };
        const result = StoryStealth.extractMediaFromFiber(mockEl);
        assert.strictEqual(result, null, 'Cyclic fiber returned null without hanging/stack overflow');

        // Valid fiber extraction
        const validFiber = {
            memoizedProps: {
                item: {
                    id: 'STORY_123',
                    video_versions: [{ width: 1080, height: 1920, url: 'https://cdn.example.com/story.mp4' }]
                }
            },
            return: null
        };
        const validEl = { __reactFiber$valid: validFiber };
        const fiberMedia = StoryStealth.extractMediaFromFiber(validEl);
        assert.ok(fiberMedia);
        assert.strictEqual(fiberMedia.id, 'STORY_123');
        assert.strictEqual(fiberMedia.isVideo, true);
        assert.strictEqual(fiberMedia.url, 'https://cdn.example.com/story.mp4');

        console.log('PASS: StoryStealth');
    }

    // 4. CleanFeed Tests
    console.log('4. Testing CleanFeed...');
    {
        const cleanFeed = new CleanFeed();
        assert.ok(Array.isArray(DEFAULT_AD_KEYWORDS));
        assert.ok(CLEAN_FEED_CSS.includes('visibility: hidden !important'));
        assert.ok(CLEAN_FEED_CSS.includes('overflow-anchor: none !important'));

        // 4.1 Link-based Ad Detection
        const adLinkArticle = {
            querySelector: (sel) => {
                if (sel.includes('/ads/ig_redirect/')) return { href: '/ads/ig_redirect/' };
                return null;
            },
            textContent: 'Regular post content'
        };
        assert.strictEqual(cleanFeed.isAdArticle(adLinkArticle), true, 'Detected ad via redirect link');

        // 4.2 Keyword-based Ad Detection
        const sponsoredArticle = {
            querySelector: (sel) => null,
            textContent: 'User Name Sponsored 2 hours ago'
        };
        assert.strictEqual(cleanFeed.isAdArticle(sponsoredArticle), true, 'Detected sponsored keyword');

        const thaiAdArticle = {
            querySelector: (sel) => null,
            textContent: 'Brand TH ได้รับการสนับสนุน โปรโมชั่นพิเศษ'
        };
        assert.strictEqual(cleanFeed.isAdArticle(thaiAdArticle), true, 'Detected Thai sponsored keyword');

        const regularArticle = {
            querySelector: (sel) => null,
            textContent: 'Friends enjoying the weekend in Chiang Mai'
        };
        assert.strictEqual(cleanFeed.isAdArticle(regularArticle), false, 'Normal post not flagged as ad');

        // 4.3 scanArticles
        cleanFeed.enable();
        let taggedCount = 0;
        const mockArticleNode = {
            querySelector: (sel) => (sel.includes('header') ? { textContent: 'ได้รับการสนับสนุน' } : null),
            setAttribute: (attr, val) => {
                if (attr === 'data-mp-hidden-ad' && val === 'true') taggedCount++;
            },
            dataset: {}
        };
        const mockRoot = {
            querySelectorAll: () => [mockArticleNode]
        };
        const count = cleanFeed.scanArticles(mockRoot);
        assert.strictEqual(count, 1, 'Scanned and identified 1 ad article');
        assert.strictEqual(taggedCount, 1, 'Set data-mp-hidden-ad attribute');

        cleanFeed.disable();
        assert.strictEqual(cleanFeed.isEnabled(), false);

        console.log('PASS: CleanFeed');
    }

    console.log('\nAll Phase 3 feature modules verified successfully!');
})().catch(err => {
    console.error('FATAL TEST ERROR:', err);
    process.exit(1);
});
