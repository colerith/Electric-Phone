<template>
  <div
    class="wave-mention-field"
    :class="{ 'is-inline': inline }"
    @input="inspect"
    @click="inspect"
    @keydown.capture="onKey"
    @beforeinput.capture="onBeforeInput"
    @focusout="onBlur"
  >
    <slot />
    <div v-if="range" class="wave-mention-menu" role="listbox" aria-label="选择要艾特的联系人">
      <button
        v-for="(person, index) in matches"
        :key="person.charKey"
        type="button"
        role="option"
        :aria-selected="index === highlighted"
        @mousedown.prevent
        @click.stop="choose(person)"
      >
        <span class="mention-symbol" aria-hidden="true">@</span>
        <span class="mention-details">
          <span class="mention-name">{{ person.name }}</span>
          <small v-if="person.remark && person.remark !== person.name" class="mention-remark">{{ person.remark }}</small>
        </span>
      </button>
      <small v-if="!matches.length" class="mention-empty">没有匹配的联系人</small>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { Identity } from '../../schemas';
const props = defineProps<{ contacts: Identity[]; inline?: boolean }>();
const emit = defineEmits<{ select: [person: Identity] }>();
const highlighted = ref(0);
const range = ref<{ start: number; end: number; query: string } | null>(null);
let input: HTMLTextAreaElement | HTMLInputElement | null = null;
const matches = computed(() =>
  props.contacts
    .filter(
      person =>
        person.source !== 'local_group' &&
        `${person.name} ${person.remark}`.toLowerCase().includes(range.value?.query.toLowerCase() || ''),
    )
    .slice(0, 30),
);
function close() {
  range.value = null;
}
function inspect(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  if (!['TEXTAREA', 'INPUT'].includes(target?.tagName) || target.selectionStart === null) return;
  input = target;
  const before = target.value.slice(0, target.selectionStart);
  const match = /@([^@\s]{0,40})$/.exec(before);
  highlighted.value = 0;
  range.value = match ? { start: before.lastIndexOf('@'), end: target.selectionStart, query: match[1] } : null;
}
function onBlur(event: FocusEvent) {
  const wrapper = event.currentTarget as HTMLElement;
  if (!wrapper.contains(event.relatedTarget as Node | null)) close();
}
function onBeforeInput(event: InputEvent) {
  if (!range.value || event.isComposing || !['insertParagraph', 'insertLineBreak'].includes(event.inputType)) return;
  event.preventDefault();
  event.stopPropagation();
  const person = matches.value[highlighted.value];
  if (person) void choose(person);
}
function onKey(event: KeyboardEvent) {
  if (!range.value || event.isComposing) return;
  if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') close();
  else if (event.key === 'Enter') {
    const person = matches.value[highlighted.value];
    if (person) void choose(person);
  } else if (matches.value.length)
    highlighted.value =
      (highlighted.value + (event.key === 'ArrowDown' ? 1 : -1) + matches.value.length) % matches.value.length;
}
async function choose(person: Identity) {
  if (!input || !range.value) return;
  const target = input,
    { start, end } = range.value;
  const text = `@${person.name} `;
  const value = target.value.slice(0, start) + text + target.value.slice(end);
  if (target.maxLength >= 0 && value.length > target.maxLength) return;
  target.value = value;
  target.dispatchEvent(new Event('input', { bubbles: true }));
  close();
  emit('select', person);
  await nextTick();
  target.focus();
  target.setSelectionRange(start + text.length, start + text.length);
}
</script>
<style scoped>
.wave-mention-field {
  position: relative;
  min-width: 0;
  width: 100%;
}
#wave-phone-script-root .wave-device .wave-mention-menu {
  position: absolute;
  z-index: 40;
  bottom: calc(100% + 8px);
  left: 0;
  width: 100%;
  max-height: 210px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--wave-line, #e8e5e9);
  border-radius: 16px;
  background: var(--wave-card, #fff);
  color: var(--wave-text, #26354d);
  box-shadow: 0 3px 12px #20232a12;
  padding: 5px;
  box-sizing: border-box;
  scrollbar-width: thin;
}
#wave-phone-script-root .wave-device .wave-mention-menu button {
  display: flex;
  gap: 9px;
  align-items: center;
  width: 100%;
  min-height: 40px;
  height: auto;
  margin: 0;
  padding: 7px 9px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  box-shadow: none;
  color: inherit;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  white-space: normal;
  cursor: pointer;
  transition: background 0.15s ease;
}
#wave-phone-script-root .wave-device .wave-mention-menu button[aria-selected='true'],
#wave-phone-script-root .wave-device .wave-mention-menu button:hover {
  background: #c78ca51a;
}
#wave-phone-script-root .wave-device .wave-mention-menu .mention-symbol {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 27px;
  height: 27px;
  border-radius: 9px;
  background: #c78ca51a;
  color: #b77792;
  font-size: 14px;
  line-height: 1;
}
#wave-phone-script-root .wave-device .wave-mention-menu .mention-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
#wave-phone-script-root .wave-device .wave-mention-menu .mention-name {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
#wave-phone-script-root .wave-device .wave-mention-menu .mention-remark,
#wave-phone-script-root .wave-device .wave-mention-menu .mention-empty {
  color: var(--wave-muted, #8e8790);
  font-size: 10px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
#wave-phone-script-root .wave-device .wave-mention-menu .mention-empty {
  display: block;
  padding: 12px;
  text-align: center;
}
.wave-mention-field :slotted(textarea),
.wave-mention-field :slotted(input) {
  width: 100%;
  box-sizing: border-box;
}
#wave-phone-script-root .wave-device .is-inline .wave-mention-menu {
  position: static;
  margin-top: 8px;
}
#wave-phone-script-root .wave-device .moment-comment-form > .wave-mention-field {
  flex: 1;
  width: auto;
}
</style>
