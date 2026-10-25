import { computed, inject, onUnmounted, provide, shallowReactive, ref, watch, type InjectionKey } from 'vue';
type Form = { active: () => boolean; dirty: () => boolean; save: () => boolean | void; discard: () => void };
const key: InjectionKey<Set<Form>> = Symbol('phone-settings-forms');
export function provideSettingsForms() {
  const forms = shallowReactive(new Set<Form>());
  provide(key, forms);
  return {
    dirty: computed(() => [...forms].some(form => form.active() && form.dirty())),
    save() {
      for (const form of forms) if (form.active() && form.save() === false) return false;
      return true;
    },
    discard() {
      for (const form of forms) if (form.active()) form.discard();
    },
  };
}
export function useSettingsForm(
  read: () => unknown,
  save: () => boolean | void,
  active = () => true,
  restore?: (value: any) => void,
) {
  const forms = inject(key, undefined);
  const baseline = ref('');
  const markSaved = () => {
    baseline.value = JSON.stringify(read());
  };
  watch(
    active,
    enabled => {
      if (enabled) markSaved();
    },
    { immediate: true },
  );
  const form: Form = {
    active,
    dirty: () => JSON.stringify(read()) !== baseline.value,
    save: () => {
      const result = save();
      if (result !== false) markSaved();
      return result;
    },
    discard: () => {
      if (restore && baseline.value) restore(JSON.parse(baseline.value));
      markSaved();
    },
  };
  forms?.add(form);
  onUnmounted(() => forms?.delete(form));
  return { markSaved, managed: Boolean(forms) };
}

/** Save mounted chat setting drafts before exporting a portable persona. */
export function useSaveSettingsForms() {
  const forms = inject(key, undefined);
  return () => {
    for (const form of forms || []) if (form.active() && form.save() === false) return false;
    return true;
  };
}
