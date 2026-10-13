// Device options a profile switches on by default (the device half of a profile's preset, next to its tabs): the value
// saved on this device, else the profile's default, else off. Pure: tested in device-presets.test.mjs.
//
// hideTabsTyping (Accessibility → "Hide the tab bar while typing"; phones): off unless switched on, and on by default
// in the Personal profile (settings.mode 'personal').
export const DEVICE_PRESETS = { personal: { hideTabsTyping: true } };

export function deviceOn(d, mode, key) {
  const v = d && d[key];
  if (typeof v === 'boolean') return v;
  return !!(DEVICE_PRESETS[mode] && DEVICE_PRESETS[mode][key]);
}

// On a phone: the tab bar is at the bottom (phone width, unless moved to the top; or put at the bottom anywhere) and
// the keyboard is up. Then, with the option on, the bar goes while typing, so the box and its Save keep the room.
export const barAtBottom = ({ width, tabBar }) => tabBar === 'bottom' || (tabBar !== 'top' && width <= 600);
