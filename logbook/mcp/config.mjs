// Settings for the APMES Logbook MCP server. See README.md ("One-time owner setup").
//
// CLIENT_ID / CLIENT_SECRET: a Google OAuth client of type "Desktop app" in the Google Cloud project
// apmes-logbook. Google documents the secret of an installed-app client as not confidential (it ships
// inside every copy of the app), and its token endpoint still asks for it alongside PKCE. So both
// live here, in a public repo, on purpose. Env overrides: APMES_GOOGLE_CLIENT_ID, APMES_GOOGLE_CLIENT_SECRET.
//
// API_KEY: the Firebase web API key (public by design; access is controlled by firestore.rules).
// Env override APMES_FIREBASE_API_KEY, e.g. for a separate key if the web key is restricted to websites.

import { FIREBASE_CONFIG } from '../js/firebase-config.js';

const PLACEHOLDER_ID = '474134277199-7ma8hij2lirbhk18d9l0i5033c2soc5c.apps.googleusercontent.com';
const PLACEHOLDER_SECRET = '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';

export const CLIENT_ID = process.env.APMES_GOOGLE_CLIENT_ID || PLACEHOLDER_ID;
export const CLIENT_SECRET = process.env.APMES_GOOGLE_CLIENT_SECRET || PLACEHOLDER_SECRET;
export const API_KEY = process.env.APMES_FIREBASE_API_KEY || FIREBASE_CONFIG.apiKey;
export const PROJECT_ID = FIREBASE_CONFIG.projectId;

export const isConfigured = () => !CLIENT_ID.startsWith('REPLACE_ME') && !CLIENT_SECRET.startsWith('REPLACE_ME');
