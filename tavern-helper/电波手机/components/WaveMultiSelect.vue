<template>
  <div class="wave-multiselect">
    <div v-if="modelValue.length" class="system-chip-row">
      <button
        v-for="name in modelValue"
        :key="name"
        class="system-chip"
        type="button"
        :aria-label="`移除排除角色卡 ${name}`"
        @click="select(name)"
      >
        {{ name }} <span aria-hidden="true">×</span>
      </button>
    </div>
    <div ref="rootElement" class="wave-select" :class="{ open: isOpen, 'opens-up': opensUp }">
      <input
        ref="triggerElement"
        v-model="query"
        class="wave-multiselect-search"
        role="combobox"
        autocomplete="off"
        :placeholder="ariaLabel"
        :aria-label="ariaLabel"
        aria-haspopup="listbox"
        :aria-expanded="isOpen"
        :aria-controls="isOpen ? menuId : undefined"
        @click="openMenu()"
        @input="openMenu()"
        @keydown.down.prevent="openMenu(true)"
        @keydown.up.prevent="openMenu(true)"
        @keydown.tab="close()"
      />
      <div
        v-if="isOpen"
        :id="menuId"
        ref="menuElement"
        class="wave-select-menu"
        role="listbox"
        aria-multiselectable="true"
        :aria-label="ariaLabel"
        :style="{ maxHeight: `${menuHeight}px` }"
        @keydown="onMenuKeydown"
      >
        <button
          v-for="(name, index) in filteredOptions"
          :key="name"
          type="button"
          role="option"
          tabindex="-1"
          :aria-selected="modelValue.includes(name)"
          :class="{ selected: modelValue.includes(name) }"
          @focus="focusedIndex = index"
          @click="select(name)"
        >
          <span>{{ name }}</span
          ><span class="wave-multiselect-check" aria-hidden="true">{{ modelValue.includes(name) ? '✓' : '' }}</span>
        </button>
        <div v-if="!filteredOptions.length" class="wave-multiselect-empty">没有匹配的角色卡</div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId } from 'vue';
const props = withDefaults(defineProps<{ modelValue: string[]; options: string[]; ariaLabel?: string }>(), {
  ariaLabel: '搜索角色卡',
});
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();
const rootElement = ref<HTMLElement | null>(null);
const triggerElement = ref<HTMLInputElement | null>(null);
const menuElement = ref<HTMLElement | null>(null);
const menuId = `wave-multiselect-${useId()}`;
const isOpen = ref(false),
  opensUp = ref(false),
  menuHeight = ref(240),
  focusedIndex = ref(0);
const query = ref('');
const filteredOptions = computed(() =>
  props.options.filter(name => name.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())),
);
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
  menuHeight.value = Math.max(0, Math.min(240, Math.floor(opensUp.value ? above : below)));
}
function focusOption(index: number) {
  focusedIndex.value = Math.max(0, Math.min(filteredOptions.value.length - 1, index));
  const menu = menuElement.value;
  const option = menu?.querySelectorAll<HTMLButtonElement>('[role="option"]')[focusedIndex.value];
  if (!menu || !option) return;
  option.focus({ preventScroll: true });
  if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
  else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight)
    menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
}
async function openMenu(focus = false) {
  isOpen.value = true;
  await nextTick();
  placeMenu();
  if (focus) focusOption(0);
}
function close(restoreFocus = false) {
  isOpen.value = false;
  if (restoreFocus) triggerElement.value?.focus({ preventScroll: true });
}
function select(value: string) {
  emit(
    'update:modelValue',
    props.modelValue.includes(value) ? props.modelValue.filter(name => name !== value) : [...props.modelValue, value],
  );
  nextTick(placeMenu);
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
            ? filteredOptions.value.length - 1
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
