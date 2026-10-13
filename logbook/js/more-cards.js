// The More page's cards: privacy, credits and Sign out (with the demo's Leave and Reset). Their own small file, so
// More opens without loading the settings pages (ui-settings.js re-exports them).

import { h, cloud, writes, confirmBox, hooks } from './ui-core.js';

export const privacyCard = () => (
    h('section', { class: 'card' },
      h('h2', {}, 'Privacy'),
      h('p', { class: 'hint', style: 'margin:0' },
        'Your cases are stored in your own logbook in Google Cloud Firestore. Only you can read them (and the app owner, who runs the import from the old Google Form); programme admins cannot. ',
        'Log patient initials only — no names, NRIC or hospital numbers. Programme residents share case counts per tag (Analytics → Compare with your intake); details are never shared. ',
        'This device keeps an offline copy of your cases until you sign out — sign out on shared computers.')));
export const creditsCard = () => (
    h('section', { class: 'card credits' },
      h('h2', {}, 'Credits'),
      h('p', { style: 'margin:0' }, 'Code by ', h('b', {}, 'Abigail Sim')),
      h('p', { style: 'margin:4px 0 0' }, 'Design and UX/UI by ', h('b', {}, 'Koh Wenjun'))));

export function signOutCard() {
  return h('section', { class: 'card' },
    h('div', { class: 'bar', style: 'margin:0' },
      h('button', { onclick: async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        const ok = await writes.flush() && await cloud.synced();
        btn.disabled = false;
        if (!ok && !(await confirmBox('Not synced yet', 'Some cases or changes on this device have not reached the server yet (no signal?). Signing out now deletes them. Wait for signal and try again, or sign out anyway?', 'Sign out anyway', true))) return;
        cloud.signOut();
      } }, 'Sign out'),
      // the demo: Leave demo beside Sign out (the header badge can be hidden now), Reset as a link that asks first
      cloud.demo ? h('a', { href: location.pathname, class: 'btn' }, 'Leave demo') : null,
      cloud.demo ? h('button', { type: 'button', class: 'link', style: 'margin-left:auto;padding:10px 4px;min-height:44px', onclick: () => hooks.resetDemo?.() }, 'Reset demo') : null),
    cloud.demo ? h('p', { class: 'muted', style: 'margin:8px 0 0' }, 'Demo mode: data stays in this browser.') : null);
}
