import { computed } from 'vue';
import { usePhoneTheme } from '../../services/core/theme';
import type { PhoneTheme } from '../../services/core/theme';
import { appIcons } from './app-icons';
import { presetIcon } from './preset-icon';
import statusDark from './dark/status.webp';
import appearanceDark from './dark/appearance.webp';
import browseDark from './dark/browse.webp';
import settingsDark from './dark/settings.webp';
import calendarDark from './dark/calendar.webp';
import messagesDark from './dark/messages.webp';
import memoDark from './dark/memo.webp';
import walletDark from './dark/wallet.webp';
import zoneDark from './dark/zone.webp';
import musicDark from './dark/music.webp';
import twitterDark from './dark/twitter.webp';
import presetsDark from './dark/presets.webp';

const lightIcons: Record<string, string> = { ...appIcons, presets: presetIcon };
const darkIcons: Record<string, string> = {
  status: statusDark,
  appearance: appearanceDark,
  browse: browseDark,
  settings: settingsDark,
  calendar: calendarDark,
  messages: messagesDark,
  memo: memoDark,
  wallet: walletDark,
  zone: zoneDark,
  music: musicDark,
  twitter: twitterDark,
  presets: presetsDark,
};

/** Shared by the desktop, Dock and appearance preview. Custom artwork always wins. */
export function useAppIcons(preference: () => PhoneTheme, customIcons: () => Record<string, string>) {
  const theme = usePhoneTheme(preference);
  return computed(() => ({
    ...(theme.value === 'dark' ? darkIcons : lightIcons),
    ...Object.fromEntries(Object.entries(customIcons()).filter(([, url]) => Boolean(url))),
  }));
}
