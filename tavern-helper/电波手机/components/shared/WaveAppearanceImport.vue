<template>
  <div class="wave-appearance-import">
    <label
      >生图外貌<textarea
        :value="modelValue"
        rows="4"
        maxlength="12000"
        placeholder="固定外貌、发色、瞳色、服装；仅绘制此人物时使用。"
        @change="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>
    <button type="button" @click="load">读取柏宝绘角色库</button>
    <div v-if="characters.length" class="appearance-selection">
      <label
        >选择角色<WaveSelect
          v-model="selected"
          :options="
            characters.map((c, i) => ({
              value: String(i),
              label: `${c.name} · ${c.scope === 'global' ? '全局' : '当前聊天'}`,
            }))
          "
      /></label>
      <button type="button" @click="apply">使用此外貌</button>
    </div>
    <p v-if="status" role="status">{{ status }}</p>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { baibaiCharacters } from '../../services/image/baibai';
import WaveSelect from './WaveSelect.vue';
const props = defineProps<{ modelValue: string; provider?: 'novelai' | 'openai'; name?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const characters = ref<ReturnType<typeof baibaiCharacters>>([]),
  selected = ref('0'),
  status = ref('');
function load() {
  try {
    characters.value = baibaiCharacters();
    selected.value = String(
      Math.max(
        0,
        characters.value.findIndex(c => c.name === props.name),
      ),
    );
    status.value = characters.value.length
      ? '选择角色后注入外貌；不会修改柏宝绘原档案。'
      : '角色库为空，请先在柏宝绘的角色管理中保存外貌。';
  } catch (e) {
    status.value = e instanceof Error ? e.message : '读取失败';
  }
}
function apply() {
  const c = characters.value[Number(selected.value)];
  if (!c) return;
  emit('update:modelValue', props.provider === 'openai' ? c.nl || c.tag : c.tag || c.nl);
  status.value = `已读取 ${c.name} 的固定外貌，可继续编辑。`;
}
</script>
<style scoped lang="scss">
#wave-phone-script-root .wave-appearance-import {
  display: grid;
  gap: 14px;
  min-width: 0;
  font-weight: 400;
  label {
    display: grid;
    gap: 10px;
    margin: 0;
    font-weight: 400;
    min-width: 0;
  }
  textarea {
    box-sizing: border-box;
    width: 100%;
    padding: 12px;
    border: 1px solid #8882;
    border-radius: 14px;
    background: var(--wave-card, #fff);
    color: inherit;
    font: inherit;
    font-weight: 400;
    resize: vertical;
  }
  button:not(.wave-select-trigger):not([role='option']) {
    appearance: none;
    width: auto;
    justify-self: start;
    margin: 0;
    padding: 11px 14px;
    border: 1px solid #8883;
    border-radius: 14px;
    background: #8881;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .appearance-selection {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 10px;
  }
  p {
    margin: 0;
    padding: 0;
    text-indent: 0;
    font-size: 12px;
    opacity: 0.7;
  }
}
</style>
