// Sign-in by redirect where a popup leaves a blank tab (js/cloud.js redirectFirst): the installed app, Firefox on Android.
import assert from 'node:assert/strict';
import { redirectFirst } from '../js/cloud.js';

const FF_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const FF_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
assert.equal(redirectFirst({ ua: FF_ANDROID }), true);
assert.equal(redirectFirst({ ua: CHROME_ANDROID }), false);
assert.equal(redirectFirst({ ua: FF_DESKTOP }), false);
assert.equal(redirectFirst({ ua: SAFARI_IPHONE }), false);
for (const ua of [CHROME_ANDROID, FF_DESKTOP, SAFARI_IPHONE]) assert.equal(redirectFirst({ standalone: true, ua }), true);
assert.equal(redirectFirst(), false);
console.log('sign-in mode tests passed');
