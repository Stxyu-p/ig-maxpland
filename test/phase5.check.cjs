/**
 * Phase 5 Verification Test Suite
 * Tests EventDelegator, delegation routing, and leak-free destruction.
 */

const assert = require('assert');
const { EventDelegator } = require('../src/ui/EventDelegator.js');
const { LRUBoundedRegistry } = require('../src/features/StoryStealth.js');

console.log('--- Testing Phase 5 Event System & Cleanup ---');

(async () => {
    // 1. Selector Normalization
    console.log('1. Testing Selector Normalization...');
    {
        assert.strictEqual(EventDelegator.normalizeSelector('unfollow'), '[data-action="unfollow"]');
        assert.strictEqual(EventDelegator.normalizeSelector('scan-relationships'), '[data-action="scan-relationships"]');
        assert.strictEqual(EventDelegator.normalizeSelector('.maxpland-pill-btn'), '.maxpland-pill-btn');
        assert.strictEqual(EventDelegator.normalizeSelector('[data-filter="mutual"]'), '[data-filter="mutual"]');
        assert.strictEqual(EventDelegator.normalizeSelector('#trigger-btn'), '#trigger-btn');
        assert.strictEqual(EventDelegator.normalizeSelector(''), '');
        console.log('PASS: Selector Normalization');
    }

    // 2. Delegated Event Handling & Routing
    console.log('2. Testing Delegated Event Handling...');
    {
        let rootListenerAttached = 0;
        let eventListeners = new Map();

        const mockRoot = {
            addEventListener(type, fn, opts) {
                rootListenerAttached++;
                eventListeners.set(type, fn);
            },
            removeEventListener(type) {
                rootListenerAttached--;
                eventListeners.delete(type);
            },
            contains(el) {
                return true;
            }
        };

        const delegator = new EventDelegator(mockRoot);

        let unfollowClicked = false;
        let unfollowId = null;
        let batchClicked = false;

        const unbindUnfollow = delegator.on('click', 'unfollow', function(e, el) {
            unfollowClicked = true;
            unfollowId = el.dataset.id;
        });

        delegator.on('click', 'batch-unfollow', function() {
            batchClicked = true;
        });

        assert.strictEqual(rootListenerAttached, 1, 'Only 1 root listener attached for click event type');

        // Simulate click on an unfollow button
        const targetBtn = {
            dataset: { action: 'unfollow', id: 'UID_456' },
            closest(sel) {
                return sel === '[data-action="unfollow"]' ? targetBtn : null;
            }
        };

        const clickListener = eventListeners.get('click');
        clickListener({ target: targetBtn });

        assert.strictEqual(unfollowClicked, true, 'Delegated unfollow handler executed');
        assert.strictEqual(unfollowId, 'UID_456', 'Payload correctly extracted from matching element');
        assert.strictEqual(batchClicked, false, 'Non-matching handler was not executed');

        // Unbind specific handler
        unbindUnfollow();
        unfollowClicked = false;
        clickListener({ target: targetBtn });
        assert.strictEqual(unfollowClicked, false, 'Unbound handler is no longer executed');

        // Programmatic dispatch
        let programRun = false;
        delegator.on('click', 'custom-run', () => { programRun = true; });
        const dispatched = delegator.dispatch('custom-run');
        assert.strictEqual(dispatched, true);
        assert.strictEqual(programRun, true);

        // Teardown / destroy
        delegator.destroy();
        assert.strictEqual(delegator.routes.size, 0, 'Routes map cleared on destroy');
        assert.strictEqual(delegator._isDestroyed, true, 'Marked as destroyed');

        console.log('PASS: Delegated Event Handling');
    }

    // 3. Memory Optimization Verification
    console.log('3. Testing Memory Optimizations...');
    {
        // 3.1 LRU bounded capacity verification
        const lru = new LRUBoundedRegistry(5);
        for (let i = 0; i < 50; i++) {
            lru.set(`key_${i}`, { index: i });
        }
        assert.strictEqual(lru.size, 5, 'LRU cache stays bounded at 5 items without growing indefinitely');
        assert.strictEqual(lru.has('key_49'), true);
        assert.strictEqual(lru.has('key_0'), false);

        console.log('PASS: Memory Optimizations');
    }

    console.log('\nAll Phase 5 event delegation and cleanup tests verified successfully!');
})().catch(err => {
    console.error('FATAL TEST ERROR:', err);
    process.exit(1);
});
