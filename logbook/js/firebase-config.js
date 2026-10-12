// Firebase web app config for the APMES Logbook (project apmes-logbook).
// These values are public by design: access is controlled by firestore.rules on Google's side.
// Setup steps: see logbook/README.md.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDRC7COpi86H0K6oe98XZ8m1sQWJUkP63E',
  // Sign-in helper pages are served from this site (/__/auth/), so redirect sign-in keeps working
  // when the browser partitions storage. Needs https://anawj.com/__/auth/handler on the OAuth client.
  authDomain: 'anawj.com',
  projectId: 'apmes-logbook',
  storageBucket: 'apmes-logbook.firebasestorage.app',
  messagingSenderId: '474134277199',
  appId: '1:474134277199:web:bc32d5c25f257c2905ce3a',
};
