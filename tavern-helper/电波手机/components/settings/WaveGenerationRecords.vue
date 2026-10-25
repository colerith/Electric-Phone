<template>
  <div class="generation-records">
    <section class="settings-card">
      <div class="wave-settings-title">生成记录</div>
      <p>
        按正文楼层查看手机更新。补生成按聊天与行为的必更新、随机更新规则选择模块；已有模块保留，没有新事实也会记录为已检查。
      </p>
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
        立即生成检查最新正文的全部模块；批量补生成按设置逐楼抽取模块，从旧到新执行，时间取本楼标记或之前最近的标记。切换聊天或停止后，已完成楼层仍会保留。
      </p>
      <p v-if="notice || phone.generationRecordStatus" role="status" aria-live="polite">
        {{ notice || phone.generationRecordStatus }}
      </p>
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
    <section
      v-for="(row, index) in visibleRows"
      :ref="
        el => {
          if (index === 0) firstRecord = el as HTMLElement;
        }
      "
      :key="row.floor"
      class="settings-card record-card"
    >
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
      <div v-if="row.generated.length" class="module-pills">
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
    <nav v-if="rows.length" class="record-pagination" aria-label="生成记录分页">
      <div class="page-summary">共 {{ rows.length }} 楼 · 每页 10 楼</div>
      <div class="page-controls">
        <button class="system-action" :disabled="page === 1" @click="changePage(page - 1)">
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i><span>上一页</span>
        </button>
        <span aria-live="polite">{{ page }} / {{ pageCount }}</span>
        <button class="system-action" :disabled="page === pageCount" @click="changePage(page + 1)">
          <span>下一页</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    </nav>
    <p v-if="!rows.length">当前聊天还没有可生成的正文楼层。</p>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { MODULE_LABELS } from '../../services/generation/module-protocol';
const moduleLabel = (id: keyof typeof MODULE_LABELS) => MODULE_LABELS[id];
const phone = usePhoneStore();
const rows = computed(() => phone.generationRecords);
const busy = computed(() => phone.moduleGenerating || phone.zoneGenerating);
const missing = computed(() => rows.value.filter(row => !row.generated.length && !row.checked.length));
const selected = ref<number[]>([]);
const notice = ref('');
const page = ref(1);
const firstRecord = ref<HTMLElement | null>(null);
const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / 10)));
const visibleRows = computed(() => [...rows.value].reverse().slice((page.value - 1) * 10, page.value * 10));
watch(pageCount, count => {
  page.value = Math.min(page.value, count);
});
async function changePage(value: number) {
  page.value = Math.max(1, Math.min(pageCount.value, value));
  await nextTick();
  firstRecord.value?.scrollIntoView({ block: 'start', behavior: 'auto' });
}
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
    page.value = 1;
  },
);
onMounted(() => phone.refreshGenerationRecords());
</script>
<style lang="scss">
#wave-phone-script-root .wave-device .generation-records {
  & {
    display: grid;
    gap: 16px;
    color: var(--wave-ink);
  }
  .settings-card {
    padding: 18px;
    gap: 12px;
    margin: 0;
  }
  p {
    margin: 0;
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
    margin: 0;
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
    margin: 0;
    max-height: 180px;
    overflow-y: auto;
    padding: 2px;
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
  .record-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .record-actions > button {
    width: 100%;
  }
  .record-heading > strong {
    line-height: 1.5;
  }
  .record-heading > strong > span {
    margin-left: 6px;
    font-size: 12px;
    color: var(--settings-muted);
  }
  .record-card {
    scroll-margin-top: 12px;
  }
  .record-card > .system-action {
    margin-top: 2px;
  }
  .record-pagination {
    display: grid;
    gap: 10px;
    padding: 16px;
    margin: 0 0 12px;
    border-radius: 18px;
    background: var(--wave-card);
    border: 1px solid var(--settings-line);
  }
  .page-summary {
    text-align: center;
    font-size: 12px;
    color: var(--settings-muted);
  }
  .page-controls {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 12px;
    align-items: center;
  }
  .page-controls > button {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 8px;
    background: var(--settings-control);
    border: 1px solid var(--settings-line);
    border-radius: 12px;
    color: var(--settings-accent);
    font-weight: 600;
    transition:
      background 0.15s,
      opacity 0.15s;
  }
  .page-controls > button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .page-controls > button:not(:disabled):active {
    transform: translateY(1px);
  }
  .page-controls > button:focus-visible {
    outline: 2px solid var(--settings-accent);
    outline-offset: 2px;
  }
  .page-controls > button i {
    font-size: 11px;
  }
  .page-controls > span {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--settings-muted);
  }
  .missing-card {
    border: 1px solid var(--wave-line);
  }
}
</style>
