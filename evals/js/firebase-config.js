// Firebase web app config: a copy of logbook/js/firebase-config.js (evals shares the apmes-logbook project). Keep the two in step.
// These values are public by design: access is controlled by firestore.rules on Google's side.
// Setup steps: see logbook/README.md.
const LIVE = {
  apiKey: 'AIzaSyDRC7COpi86H0K6oe98XZ8m1sQWJUkP63E',
  // Sign-in helper pages are served from this site (/__/auth/), so redirect sign-in keeps working
  // when the browser partitions storage. Needs https://apmes.anawj.com/__/auth/handler on the OAuth client.
  authDomain: 'apmes.anawj.com',
  projectId: 'apmes-logbook',
  storageBucket: 'apmes-logbook.firebasestorage.app',
  messagingSenderId: '474134277199',
  appId: '1:474134277199:web:bc32d5c25f257c2905ce3a',
};

// Beta (PREVIEWS.md, "Beta"): on beta- hosts (beta-apmes.anawj.com) the same code uses the test project instead, so
// trying a change never touches real data. Test project apmes-logbook-beta; sign-in helper pages on beta-apmes.anawj.com.
const TEST = {
  apiKey: 'AIzaSyAuepjR9mVnMEXvYT2YGaFvIUvBmw27LuM',
  authDomain: 'beta-apmes.anawj.com',
  projectId: 'apmes-logbook-beta',
  storageBucket: 'apmes-logbook-beta.firebasestorage.app',
  messagingSenderId: '751045551225',
  appId: '1:751045551225:web:ba64643db0bae5bb9aa0a8',
};
const BETA = /^beta-/.test(globalThis.location?.hostname || '');
export const FIREBASE_CONFIG = BETA ? TEST : LIVE;
