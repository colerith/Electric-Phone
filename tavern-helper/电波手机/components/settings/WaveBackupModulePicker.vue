<template>
  <div class="wave-backup-picker">
    <div class="wave-backup-picker-bar">
      <label class="wave-backup-choice backup-select-all">
        <input type="checkbox" :checked="all" :indeterminate.prop="partial" :disabled="disabled" @change="toggleAll" />
        <span class="wave-backup-check" aria-hidden="true">{{ partial ? '−' : all ? '✓' : '' }}</span>
        <span class="wave-backup-choice-text">全选模块</span>
      </label>
      <small aria-live="polite">已选 {{ model.length }} / {{ options.length }}</small>
    </div>
    <div class="backup-modules wave-backup-picker-list">
      <label
        v-for="item in options"
        :key="item.id"
        class="wave-backup-choice"
        :class="{ 'is-selected': model.includes(item.id) }"
      >
        <input v-model="model" type="checkbox" :value="item.id" :disabled="disabled" />
        <span class="wave-backup-check" aria-hidden="true">{{ model.includes(item.id) ? '✓' : '' }}</span>
        <span class="wave-backup-choice-text">{{ item.name }}</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BackupModule } from '../../services/core/backup-modules';
const props = defineProps<{ options: readonly { id: BackupModule; name: string }[]; disabled?: boolean }>();
const model = defineModel<BackupModule[]>({ required: true });
const all = computed(() => props.options.length > 0 && model.value.length === props.options.length);
const partial = computed(() => model.value.length > 0 && !all.value);
function toggleAll() {
  model.value = all.value ? [] : props.options.map(item => item.id);
}
</script>

<style scoped lang="scss">
// Dedicated namespace + scoped selectors. Native inputs remain accessible, but host checkbox skins cannot size the visual box.
#wave-phone-script-root .wave-backup-picker {
  display: grid;
  min-width: 0;
  gap: 8px;
  .wave-backup-picker-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--settings-line);
    padding-bottom: 8px;
  }
  .wave-backup-picker-bar small {
    margin: 0;
    font: 400 11px/1.5 var(--wave-ui-font);
    color: var(--settings-muted);
    white-space: nowrap;
  }
  .wave-backup-picker-list {
    display: grid;
    gap: 4px;
    margin: 0;
  }
  label.wave-backup-choice {
    all: unset;
    box-sizing: border-box;
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: 10px;
    color: var(--settings-text);
    font: 400 13px/1.45 var(--wave-ui-font);
    cursor: pointer;
    &.backup-select-all {
      padding: 4px 0;
      font-weight: 600;
    }
    &.is-selected {
      background: var(--wave-card, #fff);
      border-color: var(--settings-line);
    }
    &:hover {
      background: var(--settings-control);
    }
  }
  .wave-backup-choice input[type='checkbox'] {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: 1px !important;
    max-height: 1px !important;
    padding: 0 !important;
    margin: 0 !important;
    border: 0 !important;
    overflow: hidden !important;
    clip-path: inset(50%) !important;
    opacity: 0 !important;
  }
  .wave-backup-choice .wave-backup-check {
    all: unset;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
    border: 1.5px solid var(--settings-muted);
    border-radius: 6px;
    background: var(--wave-card, #fff);
    color: #fff;
    font: 700 15px/1 sans-serif;
  }
  input:checked + .wave-backup-check,
  input:indeterminate + .wave-backup-check {
    background: var(--settings-accent);
    border-color: var(--settings-accent);
  }
  input:focus-visible + .wave-backup-check {
    outline: 2px solid var(--settings-accent);
    outline-offset: 3px;
  }
  input:disabled ~ span {
    opacity: 0.55;
    cursor: wait;
  }
  .wave-backup-choice .wave-backup-choice-text {
    all: unset;
    display: block;
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font: inherit;
    color: inherit;
  }
}
</style>
