/**
 * Phase 4 Verification Test Suite
 * Tests Utils, IGSelectors, and DOMUtils.
 */

const assert = require('assert');
const { Utils, escapeHtml, csvCell, safeFilename, extensionFromUrl, formatTime, sleep, extractShortcodesFromText } = require('../src/utils/Utils.js');
const { IGSelectors } = require('../src/utils/IGSelectors.js');
const { DOMUtils } = require('../src/utils/DOMUtils.js');

console.log('--- Testing Phase 4 Utilities & Helpers ---');

(async () => {
    // 1. Utils Tests
    console.log('1. Testing Utils...');
    {
        // 1.1 escapeHtml
        assert.strictEqual(escapeHtml('<script>alert("XSS & \'attack\'")</script>'),
            '&lt;script&gt;alert(&quot;XSS &amp; &#39;attack&#39;&quot;)&lt;/script&gt;');
        assert.strictEqual(escapeHtml(null), '');
        assert.strictEqual(escapeHtml(undefined), '');
        assert.strictEqual(escapeHtml(123), '123');

        // 1.2 csvCell Formula Injection & Quotes
        assert.strictEqual(csvCell('Normal Text'), '"Normal Text"');
        assert.strictEqual(csvCell('Text with "quotes"'), '"Text with ""quotes"""');
        assert.strictEqual(csvCell('=1+1'), '"\'=1+1"', 'Formula prefix = escaped');
        assert.strictEqual(csvCell('+cmd|'), '"\'+cmd|"', 'Formula prefix + escaped');
        assert.strictEqual(csvCell('-calc'), '"\'-calc"', 'Formula prefix - escaped');
        assert.strictEqual(csvCell('@SUM'), '"\'@SUM"', 'Formula prefix @ escaped');
        assert.strictEqual(csvCell('  =HYPERLINK'), '"\'  =HYPERLINK"', 'Leading spaces formula escaped');

        // 1.3 safeFilename
        assert.strictEqual(safeFilename('hello/world:name*?"<>|test'), 'hello_world_name_test');
        assert.strictEqual(safeFilename('multiple    spaces___and___underscores'), 'multiple_spaces_and_underscores');
        const longName = 'a'.repeat(200);
        assert.strictEqual(safeFilename(longName).length, 150, 'Truncated to 150 chars');

        // 1.4 extensionFromUrl
        assert.strictEqual(extensionFromUrl('https://example.com/pic.JPG?size=large'), 'jpg');
        assert.strictEqual(extensionFromUrl('https://example.com/video.mp4#t=10'), 'mp4');
        assert.strictEqual(extensionFromUrl('https://example.com/media.unknown', 'png'), 'png');
        assert.strictEqual(extensionFromUrl('not-a-valid-url', 'jpg'), 'jpg');

        // 1.5 formatTime
        assert.strictEqual(formatTime(0), '00:00');
        assert.strictEqual(formatTime(5), '00:05');
        assert.strictEqual(formatTime(65), '01:05');
        assert.strictEqual(formatTime(3600), '60:00');

        // 1.6 sleep
        const t0 = Date.now();
        await sleep(50);
        assert.ok(Date.now() - t0 >= 40, 'Slept at least 40ms');

        // 1.7 extractShortcodesFromText
        const text = `
            https://www.instagram.com/p/ABC12345/
            Check out https://instagram.com/reel/XYZ67890/
            SingleLine_Code123
        `;
        const codes = extractShortcodesFromText(text);
        assert.ok(codes.includes('ABC12345'));
        assert.ok(codes.includes('XYZ67890'));
        assert.ok(codes.includes('SingleLine_Code123'));

        console.log('PASS: Utils');
    }

    // 2. IGSelectors Tests
    console.log('2. Testing IGSelectors...');
    {
        // 2.1 shortcodeFromArticle
        const mockArticle = {
            querySelectorAll: (sel) => {
                if (sel.includes('/p/')) {
                    return [{
                        getAttribute: () => 'https://www.instagram.com/p/SHORTCODE123/'
                    }];
                }
                return [];
            }
        };
        assert.strictEqual(IGSelectors.shortcodeFromArticle(mockArticle), 'SHORTCODE123');
        assert.strictEqual(IGSelectors.shortcodeFromArticle(null), null);

        // 2.2 extractMediaFromFiber
        // Cyclic fiber guard
        const cycle = { memoizedProps: null };
        cycle.return = cycle;
        assert.strictEqual(IGSelectors.extractMediaFromFiber({ __reactFiber$a: cycle }), null);

        // Valid props extraction
        const elWithProps = {
            __reactProps$1: {
                item: {
                    id: 'FIBER_999',
                    video_versions: [{ width: 720, height: 1280, url: 'https://cdn.example.com/video.mp4' }]
                }
            }
        };
        const fiberData = IGSelectors.extractMediaFromFiber(elWithProps);
        assert.ok(fiberData);
        assert.strictEqual(fiberData.id, 'FIBER_999');
        assert.strictEqual(fiberData.isVideo, true);
        assert.strictEqual(fiberData.source, 'fiber-props');

        // 2.3 findCenterElement
        const elLeft = {
            checkVisibility: () => true,
            getBoundingClientRect: () => ({ left: 0, right: 100, width: 100, height: 100, top: 50, bottom: 150 })
        };
        const elCenter = {
            checkVisibility: () => true,
            getBoundingClientRect: () => ({ left: 350, right: 450, width: 100, height: 100, top: 50, bottom: 150 })
        };
        const elRight = {
            checkVisibility: () => true,
            getBoundingClientRect: () => ({ left: 700, right: 800, width: 100, height: 100, top: 50, bottom: 150 })
        };
        const mockRoot = {
            querySelectorAll: () => [elLeft, elCenter, elRight]
        };
        const bestCenter = IGSelectors.findCenterElement('div', mockRoot);
        assert.strictEqual(bestCenter, elCenter, 'Found center element accurately at viewport center');

        // 2.4 getActiveStoryUsername
        const mockDoc = {
            querySelectorAll: (sel) => {
                if (sel.includes('header')) {
                    return [{
                        getBoundingClientRect: () => ({ left: 350, right: 450 }),
                        querySelector: (sub) => (sub.includes('a[href^="/"]') ? { getAttribute: () => '/activeuser/' } : null)
                    }];
                }
                return [];
            }
        };
        const activeUname = IGSelectors.getActiveStoryUsername.call({ targetWindow: { document: mockDoc, innerWidth: 800 } });
        assert.strictEqual(typeof activeUname, 'string');

        console.log('PASS: IGSelectors');
    }

    // 3. DOMUtils Tests
    console.log('3. Testing DOMUtils...');
    {
        // 3.1 isVisible
        const visibleEl = {
            checkVisibility: () => true,
            getBoundingClientRect: () => ({ width: 100, height: 50, top: 10, bottom: 60 })
        };
        const hiddenEl = {
            checkVisibility: () => false,
            getBoundingClientRect: () => ({ width: 100, height: 50, top: 10, bottom: 60 })
        };
        const zeroSizeEl = {
            checkVisibility: () => true,
            getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, bottom: 0 })
        };
        assert.strictEqual(DOMUtils.isVisible(visibleEl), true);
        assert.strictEqual(DOMUtils.isVisible(hiddenEl), false);
        assert.strictEqual(DOMUtils.isVisible(zeroSizeEl), false);

        // 3.2 on and unbind
        let listenerCount = 0;
        const listeners = new Map();
        const mockTarget = {
            addEventListener: (ev, fn) => {
                listenerCount++;
                listeners.set(ev, fn);
            },
            removeEventListener: (ev, fn) => {
                listenerCount--;
                listeners.delete(ev);
            }
        };
        const unbind = DOMUtils.on(mockTarget, 'click', () => {});
        assert.strictEqual(listenerCount, 1);
        unbind();
        assert.strictEqual(listenerCount, 0, 'Unbound event listener cleanly');
        unbind(); // idempotent
        assert.strictEqual(listenerCount, 0);

        // 3.3 delegate
        let delegatedCalled = false;
        let matchedTarget = null;
        const buttonEl = { name: 'btn' };
        buttonEl.closest = (sel) => (sel === '.action-btn' ? buttonEl : null);

        const containerEl = {
            addEventListener: (ev, fn) => {
                listeners.set(ev, fn);
            },
            removeEventListener: (ev, fn) => {
                listeners.delete(ev);
            },
            contains: (el) => el === buttonEl
        };

        const unbindDelegate = DOMUtils.delegate(containerEl, 'click', '.action-btn', function(ev, el) {
            delegatedCalled = true;
            matchedTarget = el;
        });

        // Trigger delegation
        const clickHandler = listeners.get('click');
        clickHandler({ target: buttonEl });
        assert.strictEqual(delegatedCalled, true, 'Delegated handler was invoked');
        assert.strictEqual(matchedTarget, buttonEl, 'Matched delegated element');

        unbindDelegate();

        // 3.4 createElement
        const mockDocForCreate = {
            createElement: (tag) => ({
                tagName: tag.toUpperCase(),
                attributes: {},
                children: [],
                setAttribute(k, v) { this.attributes[k] = v; },
                appendChild(c) { this.children.push(c); }
            }),
            createTextNode: (txt) => ({ nodeType: 3, textContent: txt })
        };
        const created = DOMUtils.createElement('button', {
            className: 'btn-primary',
            'data-action': 'download',
            disabled: true
        }, ['Click Me'], mockDocForCreate);

        assert.strictEqual(created.tagName, 'BUTTON');
        assert.strictEqual(created.className, 'btn-primary');
        assert.strictEqual(created.attributes['data-action'], 'download');
        assert.strictEqual(created.children[0].textContent, 'Click Me');

        console.log('PASS: DOMUtils');
    }

    console.log('\nAll Phase 4 utility modules verified successfully!');
})().catch(err => {
    console.error('FATAL TEST ERROR:', err);
    process.exit(1);
});
