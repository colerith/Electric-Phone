import { staticResource } from '../../services/core/static-resource';
import { computed } from 'vue';
import { usePhoneTheme } from '../../services/core/theme';
import type { PhoneTheme } from '../../services/core/theme';
import { appIcons } from './app-icons';
import { presetIcon } from './preset-icon';
const statusDark = staticResource('9e801118f272666356819c9f18380171bfc5b93261ee90337849797763fa35f6.webp');
const appearanceDark = staticResource('38b4ce77a823bce015263015618ba699da08e2921aa8e40b655daf04bcde8d32.webp');
const browseDark = staticResource('67f959a990f870069b77a43ee86e8bffe91c8c95df60d84627789411775c0ebb.webp');
const settingsDark = staticResource('92d0b1c19cf49dbac1fb412ce13a0b0f5d96d8ca272a7a1ff18751cabb282f3a.webp');
const calendarDark = staticResource('a3925ad5fe3c9ffaadac7d5930892ec7287788e4e848ed2685d92a0e95adaec9.webp');
const messagesDark = staticResource('227e192090ae4414f731931d7c010a098cf1a8be5d38558b58470058ffae0788.webp');
const memoDark = staticResource('ba66bc4d898e8463502244eb88b2f69278b399cc66559720a79e370d77fcbac7.webp');
const walletDark = staticResource('8e26cb01ea16153200cbd2176823df6007d24e7db47a5c97ceffc3bd2c913433.webp');
const zoneDark = staticResource('cc9472454973784972cab1f6956f6ed104f4293bbac68c3d43ac55ee71e4542f.webp');
const musicDark = staticResource('4ce2d63985ea52286a9da75cccf7ff4f655fc35e69d0985b9d3b42c7a046095f.webp');
const twitterDark = staticResource('468943fd6edf509770a2fc009a2fc16eb2dd8d2e1713078c59f0c5404294d7a8.webp');
const presetsDark = staticResource('05a46074ba673361bf06ab416de7458b8292fb706a5007183e1144057d94de9f.webp');

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
