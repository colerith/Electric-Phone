<template>
  <div ref="rootElement" class="wave-select" :class="{ open: isOpen, 'opens-up': opensUp }">
    <button
      ref="triggerElement"
      class="wave-select-trigger"
      type="button"
      :aria-label="ariaLabel"
      :disabled="disabled"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :aria-controls="isOpen ? menuId : undefined"
      @click="isOpen ? close() : openMenu()"
      @keydown.down.prevent="openMenu()"
      @keydown.up.prevent="openMenu()"
    >
      <slot name="leading" :option="selectedOption" />
      <span
        ><strong>{{ selectedOption?.label || '请选择' }}</strong
        ><small v-if="selectedOption?.description">{{ selectedOption.description }}</small></span
      >
      <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
    </button>
    <div
      v-if="isOpen"
      :id="menuId"
      ref="menuElement"
      :style="{ maxHeight: `${menuHeight}px` }"
      class="wave-select-menu"
      role="listbox"
      :aria-label="ariaLabel"
      @keydown="onMenuKeydown"
    >
      <button
        v-for="(option, index) in options"
        :key="option.value"
        type="button"
        role="option"
        tabindex="-1"
        :aria-selected="option.value === modelValue"
        :class="{ selected: option.value === modelValue }"
        @focus="focusedIndex = index"
        @click="select(option.value)"
      >
        <slot name="option-leading" :option="option" />
        <span
          ><strong>{{ option.label }}</strong
          ><small v-if="option.description">{{ option.description }}</small></span
        >
        <i v-if="option.value === modelValue" class="fa-solid fa-check" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId } from 'vue';
export type WaveSelectOption = { value: string; label: string; description?: string };
const props = withDefaults(
  defineProps<{ modelValue: string; options: WaveSelectOption[]; ariaLabel?: string; disabled?: boolean }>(),
  {
    ariaLabel: '选择一项',
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const rootElement = ref<HTMLElement | null>(null);
const triggerElement = ref<HTMLButtonElement | null>(null);
const menuElement = ref<HTMLElement | null>(null);
const menuId = `wave-select-${useId()}`;
const isOpen = ref(false),
  opensUp = ref(false),
  menuHeight = ref(240),
  focusedIndex = ref(0);
const selectedOption = computed(() => props.options.find(option => option.value === props.modelValue));
let ownerDocument: Document | null = null;
function placeMenu() {
  const root = rootElement.value;
  if (!root || !isOpen.value) return;
  const rect = root.getBoundingClientRect();
  const screen = root.closest('.wave-screen')?.getBoundingClientRect();
  const view = root.ownerDocument.defaultView;
  const scale = rect.height / (root.offsetHeight || rect.height) || 1;
  const top = Math.max(0, screen?.top ?? 0);
  const bottom = Math.min(view?.innerHeight ?? 800, screen?.bottom ?? view?.innerHeight ?? 800);
  const below = (bottom - rect.bottom) / scale - 10;
  const above = (rect.top - top) / scale - 10;
  opensUp.value = below < 200 && above > below;
  menuHeight.value = Math.max(44, Math.min(240, Math.floor(opensUp.value ? above : below)));
}
function focusOption(index: number) {
  focusedIndex.value = Math.max(0, Math.min(props.options.length - 1, index));
  const menu = menuElement.value;
  const option = menu?.querySelectorAll<HTMLButtonElement>('[role="option"]')[focusedIndex.value];
  if (!menu || !option) return;
  option.focus({ preventScroll: true });
  if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
  else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight)
    menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
}
async function openMenu() {
  if (props.disabled) return;
  isOpen.value = true;
  placeMenu();
  await nextTick();
  focusOption(
    Math.max(
      0,
      props.options.findIndex(option => option.value === props.modelValue),
    ),
  );
}
function close(restoreFocus = false) {
  isOpen.value = false;
  if (restoreFocus) triggerElement.value?.focus({ preventScroll: true });
}
function select(value: string) {
  emit('update:modelValue', value);
  close(true);
}
function onMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab') {
    close();
    return;
  }
  const index =
    event.key === 'ArrowDown'
      ? focusedIndex.value + 1
      : event.key === 'ArrowUp'
        ? focusedIndex.value - 1
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? props.options.length - 1
            : null;
  if (index === null) return;
  event.preventDefault();
  focusOption(index);
}
function onDocumentPointerDown(event: PointerEvent) {
  if (!event.composedPath().includes(rootElement.value!)) close();
}
function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault();
    event.stopPropagation();
    close(true);
  }
}
function onScroll(event: Event) {
  if (event.target !== menuElement.value) placeMenu();
}
onMounted(() => {
  ownerDocument = rootElement.value?.ownerDocument || null;
  ownerDocument?.addEventListener('pointerdown', onDocumentPointerDown);
  ownerDocument?.addEventListener('keydown', onDocumentKeydown);
  ownerDocument?.addEventListener('scroll', onScroll, true);
  ownerDocument?.defaultView?.addEventListener('resize', placeMenu);
});
onUnmounted(() => {
  ownerDocument?.removeEventListener('pointerdown', onDocumentPointerDown);
  ownerDocument?.removeEventListener('keydown', onDocumentKeydown);
  ownerDocument?.removeEventListener('scroll', onScroll, true);
  ownerDocument?.defaultView?.removeEventListener('resize', placeMenu);
});
</script>
