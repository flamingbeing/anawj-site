// The More page's fine print (privacy, credits) and Sign out (with the demo's Leave and Reset). Their own small file, so
// More opens without loading the settings pages (ui-settings.js re-exports them).

import { h, cloud, writes, confirmBox, hooks } from './ui-core.js';

// Privacy and credits as plain fine print at the bottom of More (owner, 15 Oct 2026: shorter, no cards)
export const finePrint = () => h('div', { class: 'fine-print' },
  h('p', {}, h('b', {}, 'Privacy'), ' · Only you can read your cases (and the app owner, for the old Google Form import). Log initials only, never names or NRIC. Programme residents share counts per tag, never details. Sign out on shared devices.'),
  h('p', {}, 'Code by Abigail Sim · Design and UX/UI by Koh Wenjun'));

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
