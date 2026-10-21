// Device options a profile switches on by default (the device half of a profile's preset, next to its tabs): the value
// saved on this device, else the profile's default, else off. Pure: tested in device-presets.test.mjs.
//
// hideTabsTyping (Layout → "Hide the tab bar while typing"; phones): off unless switched on, and on by default
// in the Personal profile (settings.mode 'personal').
export const DEVICE_PRESETS = { personal: { hideTabsTyping: true } };
// every device option a profile governs, with its name for the profile's list of changes
export const DEVICE_SWITCHES = [['hideTabsTyping', 'Hide the tab bar while typing']];
export const DEVICE_KEYS = DEVICE_SWITCHES.map(([k]) => k);

export function deviceOn(d, mode, key) {
  const v = d && d[key];
  if (typeof v === 'boolean') return v;
  return !!(DEVICE_PRESETS[mode] && DEVICE_PRESETS[mode][key]);
}

// On a phone: the tab bar is at the bottom (phone width, unless moved to the top; or put at the bottom anywhere) and
// the keyboard is up. Then, with the option on, the bar goes while typing, so the box and its Save keep the room.
export const barAtBottom = ({ width, tabBar, navStyle }) => !(navStyle === 'rail' && width > 900) && (tabBar === 'bottom' || (tabBar !== 'top' && width <= 600));

// Picking a profile (Settings → Profile): what it turns on and off on this device ({ on: [keys], off: [keys] }), as for
// the account's switches. Picking it clears the device's own values for these keys (deviceReset), so the device then
// follows the profile; a value switched by hand afterwards makes the profile "Custom" again.
export function deviceChanges(d, from, to = from) {
  const on = [], off = [];
  for (const k of DEVICE_KEYS) {
    const now = deviceOn(d, from, k), next = deviceOn({}, to, k);
    if (now !== next) (next ? on : off).push(k);
  }
  return { on, off };
}
export const deviceReset = () => Object.fromEntries(DEVICE_KEYS.map(k => [k, null]));

// Layout choices belong to this device; an explicit row layout wins over the older short-row switch.
export const NAV_STYLES = [['tabs', 'Tabs (default)'], ['rail', 'Left rail (wide screens)']];
export const ROW_LAYOUTS = [['card', 'Cards (default)'], ['compact', 'Compact'], ['chat', 'Chat'], ['timeline', 'Timeline']];
export const FORM_LAYOUTS = [['page', 'Page (default)'], ['sections', 'Collapsible sections']];
export const rowLayoutOf = d => ROW_LAYOUTS.some(([k]) => k === d.rowLayout) ? d.rowLayout : d.rowShort ? 'compact' : 'card';
