// Firebase web app config: a copy of logbook/js/firebase-config.js (evals shares the apmes-logbook project).
// These values are public by design: access is controlled by firestore.rules on Google's side.
// Setup steps: see logbook/README.md.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDRC7COpi86H0K6oe98XZ8m1sQWJUkP63E',
  // Sign-in helper pages are served from this site (/__/auth/), so redirect sign-in keeps working
  // when the browser partitions storage. Needs https://apmes.anawj.com/__/auth/handler on the OAuth client.
  authDomain: 'apmes.anawj.com',
  projectId: 'apmes-logbook',
  storageBucket: 'apmes-logbook.firebasestorage.app',
  messagingSenderId: '474134277199',
  appId: '1:474134277199:web:bc32d5c25f257c2905ce3a',
};
