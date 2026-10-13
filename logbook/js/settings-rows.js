// Settings rows (owner, 13 Oct 2026): a switch for on or off, help in one line with ⓘ for the rest, and the
// "Reset this page" link. Shared by the settings pages (ui-settings.js) and the Notes settings (ui-notepad.js).

import { h, info, toast, confirmBox, hooks } from './ui-core.js';

// "Reset this page" (owner): puts only this page's choices back to their defaults, after asking
export const resetLink = (what, run) => h('p', { class: 'reset-row' }, h('button', { class: 'small linkish', type: 'button', onclick: async () => {
  if (!await confirmBox('Reset this page', `Put ${what} back to the defaults?`, 'Reset')) return;
  await run(); hooks.render(); toast('Back to the defaults');
} }, 'Reset this page'));

// Settings rows (owner, 13 Oct 2026): a switch for on or off, a ✓ list for two to five choices, help in one line
// with ⓘ for the rest. The pages carry class set-page (style.css, "settings rows").
export const help = (line, ...more) => {
  if (!more.length) return h('p', { class: 'hint help' }, line);
  const [b, p] = info(...more);
  return [h('p', { class: 'hint help' }, line, '\u00a0', b), p];
};
// label: the words, or [words, a shorter name for screen readers and tests]
export const toggle = (label, on, set, line, ...more) => {
  const [text, name] = Array.isArray(label) ? label : [label, label];
  return [h('label', { class: 'check' }, h('input', { type: 'checkbox', role: 'switch', 'aria-label': name, checked: !!on, onchange: e => set(e.target.checked) }), text),
    line ? help(line, ...more) : null];
};
