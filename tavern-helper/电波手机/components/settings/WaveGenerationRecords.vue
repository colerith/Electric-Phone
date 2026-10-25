<template>
  <div class="generation-records">
    <section class="settings-card">
      <div class="wave-settings-title">生成记录</div>
      <p>按正文楼层查看手机更新。补生成只检查尚未生成的模块，已有内容保留；没有新事实也会记录为已检查。</p>
      <div class="record-actions">
        <button
          class="system-action primary"
          :disabled="busy || !rows.length"
          @click="run([rows[rows.length - 1].floor], true)"
        >
          立即全量生成
        </button>
        <button class="system-action" :disabled="busy" @click="phone.refreshGenerationRecords()">刷新记录</button>
        <button v-if="busy" class="system-action" @click="phone.stopManualGeneration()">停止生成</button>
      </div>
      <p>
        立即生成检查最新正文的全部模块；批量补生成按楼层从旧到新执行，时间取本楼标记或之前最近的标记。切换聊天或停止后，已完成楼层仍会保留。
      </p>
      <p role="status" aria-live="polite">{{ notice || phone.generationRecordStatus }}</p>
    </section>
    <section class="settings-card missing-card">
      <div class="record-heading">
        <strong
          >未生成楼层 <span>{{ missing.length }}</span></strong
        >
        <button class="system-action" :disabled="busy || !selected.length" @click="run(selected)">
          补生成所选 · {{ selected.length }}
        </button>
      </div>
      <p>选择需要补生成的楼层。部分模块已有记录的楼层会在下方单独标注。</p>
      <div class="floor-pills">
        <button
          v-for="row in missing"
          :key="row.floor"
          :class="{ selected: selected.includes(row.floor) }"
          :aria-pressed="selected.includes(row.floor)"
          :disabled="busy"
          @click="toggle(row.floor)"
        >
          #{{ row.floor }}
        </button>
      </div>
      <button
        v-if="missing.length"
        class="system-action"
        :disabled="busy"
        @click="selected = selected.length === missing.length ? [] : missing.map(r => r.floor)"
      >
        {{ selected.length === missing.length ? '取消全选' : '选择全部未生成楼层' }}
      </button>
      <p v-else>暂无未生成楼层</p>
    </section>
    <section v-for="row in visibleRows" :key="row.floor" class="settings-card record-card">
      <div class="record-heading">
        <strong>#{{ row.floor }}</strong
        ><span>{{
          row.generated.length || row.checked.length
            ? row.missing.length
              ? '部分模块已检查'
              : '已检查全部模块'
            : '未生成'
        }}</span>
      </div>
      <div class="record-time">
        <i class="fa-regular fa-clock"></i> {{ row.time || '暂无时间标记'
        }}<small v-if="row.time && row.timeFloor !== row.floor"> · 沿用 #{{ row.timeFloor }}</small>
      </div>
      <div class="module-pills">
        <span v-for="id in row.generated" :key="id">{{ MODULE_LABELS[id] }}</span>
      </div>
      <p v-if="row.checked.filter(id => !row.generated.includes(id)).length">
        已检查、无新增：{{
          row.checked
            .filter(id => !row.generated.includes(id))
            .map(moduleLabel)
            .join('、')
        }}
      </p>
      <p v-if="row.missing.length">待检查：{{ row.missing.map(moduleLabel).join('、') }}</p>
      <button
        v-if="row.missing.length"
        class="system-action"
        :disabled="busy || row.timestamp === null"
        @click="run([row.floor])"
      >
        {{ row.generated.length || row.checked.length ? '补齐本楼模块' : '补生成本楼' }}
      </button>
    </section>
    <button v-if="rows.length > limit" class="system-action" @click="limit += 50">加载更多记录</button>
    <p v-if="!rows.length">当前聊天还没有可生成的正文楼层。</p>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { MODULE_LABELS } from '../../services/generation/module-protocol';
const moduleLabel = (id: keyof typeof MODULE_LABELS) => MODULE_LABELS[id];
const phone = usePhoneStore();
const rows = computed(() => phone.generationRecords);
const busy = computed(() => phone.moduleGenerating || phone.zoneGenerating);
const missing = computed(() => rows.value.filter(row => !row.generated.length && !row.checked.length));
const selected = ref<number[]>([]);
const notice = ref('');
const limit = ref(50);
const visibleRows = computed(() => [...rows.value].reverse().slice(0, limit.value));
function toggle(id: number) {
  selected.value = selected.value.includes(id) ? selected.value.filter(n => n !== id) : [...selected.value, id];
}
async function run(ids: number[], full = false) {
  notice.value = '';
  try {
    await phone.backfillGeneration(ids, full);
    selected.value = [];
  } catch (error) {
    notice.value = error instanceof Error ? error.message : String(error);
  }
}
watch(
  () => phone.context?.chatKey,
  () => {
    selected.value = [];
    notice.value = '';
    limit.value = 50;
  },
);
onMounted(() => phone.refreshGenerationRecords());
</script>
<style scoped>
.generation-records {
  display: grid;
  gap: 16px;
  color: var(--wave-ink);
}
.generation-records .settings-card {
  padding: 20px;
  margin: 0;
}
p {
  color: var(--wave-muted);
  font-size: 12px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.record-actions,
.record-heading,
.floor-pills,
.module-pills {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.record-heading {
  justify-content: space-between;
  font-size: 14px;
}
.record-heading > span,
small {
  color: var(--wave-muted);
  font-size: 11px;
}
.record-time {
  font-size: 13px;
  margin: 14px 0;
  line-height: 1.6;
}
.system-action {
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid var(--wave-line);
  border-radius: 14px;
  background: var(--wave-tint);
  color: var(--wave-ink);
  font-size: 13px;
  cursor: pointer;
}
.primary,
.floor-pills .selected {
  background: var(--wave-blue);
  color: white;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
.floor-pills {
  margin-bottom: 14px;
}
.floor-pills button {
  min-height: 40px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--wave-line);
  background: var(--wave-tint);
  color: var(--wave-ink);
}
.module-pills span {
  background: var(--wave-tint);
  border-radius: 8px;
  padding: 5px 9px;
  color: var(--wave-blue);
  font-size: 12px;
}
.missing-card {
  border: 1px solid var(--wave-line);
}
</style>
