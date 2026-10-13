// Device options a profile switches on (js/device-presets.js).
import assert from 'node:assert/strict';
import { deviceOn, barAtBottom, DEVICE_PRESETS, deviceChanges, deviceReset } from '../js/device-presets.js';

// Hide the tab bar while typing: off unless switched on, on by default in the Personal profile
assert.equal(deviceOn({}, 'basic', 'hideTabsTyping'), false);
assert.equal(deviceOn({}, 'advanced', 'hideTabsTyping'), false);
assert.equal(deviceOn(null, '', 'hideTabsTyping'), false);
assert.equal(deviceOn({}, 'personal', 'hideTabsTyping'), true);
assert.equal(DEVICE_PRESETS.personal.hideTabsTyping, true);
// the device's own choice wins either way
assert.equal(deviceOn({ hideTabsTyping: false }, 'personal', 'hideTabsTyping'), false);
assert.equal(deviceOn({ hideTabsTyping: true }, 'basic', 'hideTabsTyping'), true);
// a cleared value (null) goes back to the profile's default
assert.equal(deviceOn({ hideTabsTyping: null }, 'personal', 'hideTabsTyping'), true);
assert.equal(deviceOn({ hideTabsTyping: null }, 'basic', 'hideTabsTyping'), false);
// unknown keys and profiles are off
assert.equal(deviceOn({}, 'personal', 'nope'), false);
assert.equal(deviceOn({}, 'nope', 'hideTabsTyping'), false);

// where the tab bar is: at the bottom on phone widths unless moved to the top, or put at the bottom anywhere
assert.equal(barAtBottom({ width: 390 }), true);
assert.equal(barAtBottom({ width: 600 }), true);
assert.equal(barAtBottom({ width: 390, tabBar: 'top' }), false);
assert.equal(barAtBottom({ width: 1024 }), false);
assert.equal(barAtBottom({ width: 1024, tabBar: 'bottom' }), true);
assert.equal(barAtBottom({ width: 1024, tabBar: 'auto' }), false);

// picking a profile: what changes on this device, and the saved values that go
assert.deepEqual(deviceChanges({}, 'basic', 'personal'), { on: ['hideTabsTyping'], off: [] });
assert.deepEqual(deviceChanges({}, 'personal', 'advanced'), { on: [], off: ['hideTabsTyping'] });
assert.deepEqual(deviceChanges({ hideTabsTyping: true }, 'basic', 'personal'), { on: [], off: [] }, 'already on by hand');
assert.deepEqual(deviceChanges({}, 'personal'), { on: [], off: [] }, 'not Custom');
assert.deepEqual(deviceChanges({ hideTabsTyping: false }, 'personal'), { on: ['hideTabsTyping'], off: [] }, 'switched off by hand: Custom');
assert.deepEqual(deviceReset(), { hideTabsTyping: null });

console.log('device-presets tests passed');
