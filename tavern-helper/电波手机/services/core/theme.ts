import { computed } from 'vue';
import { usePreferredDark } from '@vueuse/core';
export type PhoneTheme = 'system' | 'light' | 'dark';
export function usePhoneTheme(preference: () => PhoneTheme) {
  const systemDark = usePreferredDark();
  return computed(() => (preference() === 'system' ? (systemDark.value ? 'dark' : 'light') : preference()));
}
