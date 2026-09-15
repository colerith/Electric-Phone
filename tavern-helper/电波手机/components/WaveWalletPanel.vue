<template>
  <section class="wave-app-content wallet-page">
    <div class="wallet-overview">
      <slot name="account-switch" />
      <span
        >账户余额 · {{ page.currency }}
        <button type="button" :aria-label="visible ? '隐藏余额' : '显示余额'" @click="visible = !visible">
          <i :class="visible ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash'"></i></button></span
      ><strong>{{ visible ? money(page.balance) : '••••••' }}</strong
      ><small class="wallet-account-name">{{ name }}</small>
    </div>
    <div class="wallet-summary">
      <div>
        <small>已记录收入</small><b class="income">{{ visible ? money(totals.income) : '••••' }}</b>
      </div>
      <div>
        <small>已记录支出</small><b>{{ visible ? money(totals.expense) : '••••' }}</b>
      </div>
    </div>
    <component
      :is="cardEditable === false ? 'div' : 'button'"
      class="wallet-bank-card"
      type="button"
      :style="cardStyle"
      :aria-label="cardEditable === false ? '账户银行卡' : '更换银行卡面'"
      @click="cardEditable !== false && $emit('settings')"
    >
      <span>{{ bankName || '日常账户' }}<i class="fa-solid fa-wifi"></i></span
      ><i class="fa-solid fa-sim-card card-chip"></i><strong>{{ name }}</strong
      ><small>{{ cardLabel || '生活的每一笔，都值得记录' }}{{ cardLastFour ? ' · 尾号 ' + cardLastFour : '' }}</small>
    </component>
    <nav class="wallet-tabs" aria-label="账本视图">
      <button type="button" :aria-pressed="tab === 'records'" @click="tab = 'records'">账单</button
      ><button type="button" :aria-pressed="tab === 'stats'" @click="tab = 'stats'">分类统计</button
      ><button type="button" @click="adding = !adding"><i class="fa-solid fa-plus"></i>记一笔</button>
    </nav>
    <form v-if="adding" class="wallet-add-form" @submit.prevent="submit">
      <div class="wallet-form-pair">
        <WaveSelect
          v-model="draft.direction"
          :options="[
            { value: 'expense', label: '支出' },
            { value: 'income', label: '收入' },
          ]"
          aria-label="收支方向"
        /><input
          v-model="draft.amount"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="金额"
          aria-label="金额"
          required
        />
      </div>
      <WaveSelect
        v-model="draft.category"
        :options="walletCategories.map(value => ({ value, label: value }))"
        aria-label="记账分类"
      /><input
        v-model.trim="draft.title"
        placeholder="这笔收支的用途"
        aria-label="用途"
        required
        maxlength="120"
      /><input v-model="draft.date" type="date" aria-label="日期" required /><button type="submit">保存记录</button>
    </form>
    <template v-if="tab === 'records'"
      ><label class="wallet-search"
        ><i class="fa-solid fa-magnifying-glass"></i
        ><input v-model="query" placeholder="搜索用途、分类或账户" aria-label="搜索账单"
      /></label>
      <article v-for="row in filtered" :key="row.id" class="wallet-record">
        <span class="wallet-category-icon" :style="categoryIconStyle(row.category)"
          ><i :class="`fa-solid ${categoryAppearance[row.category].icon}`"></i
        ></span>
        <div>
          <strong>{{ row.title || row.category }}</strong
          ><small>{{ row.date || '日期未记录' }} · {{ row.category }} · {{ row.account }}</small
          ><small v-if="row.state !== 'received'">{{
            row.state === 'pending' ? '待确认 · 未计入收支' : '已退款 · 未计入收支'
          }}</small>
        </div>
        <b :class="{ income: row.direction === 'income' }">{{
          visible ? `${row.direction === 'income' ? '+' : '−'}${money(row.amount)}` : '••••'
        }}</b
        ><button type="button" class="wave-content-delete" aria-label="删除账目" @click="$emit('delete', row.id)">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      </article>
      <p v-if="!filtered.length" class="wallet-empty">
        {{ query ? '没有匹配的账目' : '从第一笔生活记录开始' }}
      </p></template
    >
    <div v-else class="wallet-statistics">
      <svg
        v-if="visible && chartSegments.length"
        class="wallet-donut-chart"
        viewBox="0 0 320 240"
        role="img"
        :aria-label="`总支出 ${money(totals.expense)}，各分类占比见图中标签`"
      >
        <title>支出分类环形统计</title>
        <circle class="wallet-donut-track" cx="160" cy="116" r="68" pathLength="100" />
        <circle
          v-for="item in chartSegments"
          :key="`arc-${item.category}`"
          class="wallet-donut-segment"
          cx="160"
          cy="116"
          r="68"
          pathLength="100"
          :stroke="item.color"
          :stroke-dasharray="`${item.fraction * 100} ${100 - item.fraction * 100}`"
          :stroke-dashoffset="-item.start * 100"
        />
        <g v-for="item in chartSegments" :key="`label-${item.category}`" class="wallet-donut-label">
          <polyline :points="item.leader" :stroke="item.color" />
          <circle :cx="item.endX" :cy="item.labelY" r="2" :fill="item.color" />
          <text :x="item.textX" :y="item.labelY + 3" :text-anchor="item.anchor">
            {{ item.category }} {{ item.percentage }}%
          </text>
        </g>
        <text class="wallet-donut-caption" x="160" y="110" text-anchor="middle">总支出</text>
        <text class="wallet-donut-total" x="160" y="132" text-anchor="middle">{{ chartTotal }}</text>
      </svg>
      <div v-if="visible && statistics.length" class="wallet-pie-legend">
        <div v-for="item in statistics" :key="item.category" class="wallet-pie-legend-row">
          <i :style="{ background: item.color }" aria-hidden="true"></i>
          <span>{{ item.category }}</span
          ><small>{{ ((item.amount / totals.expense) * 100).toFixed(1) }}%</small><b>{{ money(item.amount) }}</b>
        </div>
      </div>
      <p v-else class="wallet-empty">{{ visible ? '暂无支出，记一笔后查看分类占比' : '金额与分类占比已隐藏' }}</p>
      <small v-if="visible && statistics.length" class="wallet-stat-note">仅统计已确认支出 · {{ page.currency }}</small>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import WaveSelect from './WaveSelect.vue';
import { artworkUrl } from '../services/artworks';
import { parseWallet, walletCategories, walletTotals, type WalletTransaction } from '../services/wallet';
const props = defineProps<{
  raw: string;
  name: string;
  artwork: string;
  bankName?: string;
  cardLabel?: string;
  cardLastFour?: string;
  cardEditable?: boolean;
}>();
const emit = defineEmits<{ settings: []; add: [row: WalletTransaction]; delete: [id: string] }>();
const page = computed(() => parseWallet(props.raw));
const visible = ref(true);
const query = ref('');
const tab = ref('records');
const adding = ref(false);
const draft = reactive({
  direction: 'expense',
  category: '餐饮',
  amount: '',
  title: '',
  date: new Date().toLocaleDateString('en-CA'),
});
const money = (amount: number | null) =>
  amount === null ? '—' : amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const totals = computed(() => walletTotals(page.value.transactions));
const cardStyle = computed(() => ({
  backgroundImage: artworkUrl(props.artwork)
    ? `linear-gradient(0deg, #ffffffdd, #ffffff00 85%), url("${artworkUrl(props.artwork).replaceAll('"', '%22')}")`
    : 'linear-gradient(120deg, #dce6f2, #f1e6ec)',
}));
const categoryAppearance: Record<(typeof walletCategories)[number], { icon: string; color: string; tint: string }> = {
  餐饮: { icon: 'fa-utensils', color: '#df7fa5', tint: '#faeaf1' },
  购物: { icon: 'fa-bag-shopping', color: '#ca78b0', tint: '#f7eaf4' },
  交通: { icon: 'fa-bus', color: '#6fa4d8', tint: '#e8f1fa' },
  娱乐: { icon: 'fa-gamepad', color: '#917fd0', tint: '#efebfa' },
  住房: { icon: 'fa-house', color: '#6688bd', tint: '#e8eef7' },
  医疗: { icon: 'fa-kit-medical', color: '#e18b9f', tint: '#faecef' },
  通讯: { icon: 'fa-phone', color: '#65aec5', tint: '#e7f4f7' },
  社交: { icon: 'fa-user-group', color: '#aa8dcc', tint: '#f1ecf8' },
  旅行: { icon: 'fa-plane', color: '#7483c9', tint: '#eaedf8' },
  其他: { icon: 'fa-ellipsis', color: '#969bb5', tint: '#edeef4' },
};
const categoryIconStyle = (category: (typeof walletCategories)[number]) => ({
  color: categoryAppearance[category].color,
  background: categoryAppearance[category].tint,
});
const filtered = computed(() =>
  page.value.transactions
    .filter(row => `${row.title} ${row.category} ${row.account} ${row.note}`.includes(query.value))
    .slice()
    .reverse(),
);
const statistics = computed(() =>
  walletCategories
    .map(category => ({
      category,
      color: categoryAppearance[category].color,
      amount: walletTotals(page.value.transactions.filter(row => row.category === category)).expense,
    }))
    .filter(item => item.amount > 0)
    .sort((a, b) => b.amount - a.amount),
);
const chartTotal = computed(() => {
  const symbols: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€', JPY: '¥', GBP: '£' };
  return `${symbols[page.value.currency] || `${page.value.currency} `}${money(totals.value.expense)}`;
});
const chartSegments = computed(() => {
  if (totals.value.expense <= 0) return [];
  let start = 0;
  const rows = statistics.value.map(item => {
    const fraction = item.amount / totals.value.expense;
    const angle = (start + fraction / 2) * Math.PI * 2 - Math.PI / 2;
    const row = {
      ...item,
      start,
      fraction,
      percentage: (fraction * 100).toFixed(1),
      angle,
      side: Math.cos(angle) >= 0 ? ('right' as const) : ('left' as const),
      labelY: 116 + Math.sin(angle) * 101,
      leader: '',
      endX: 0,
      textX: 0,
      anchor: 'start' as 'start' | 'end',
    };
    start += fraction;
    return row;
  });
  for (const side of ['left', 'right'] as const) {
    const placed = rows.filter(item => item.side === side).sort((a, b) => a.labelY - b.labelY);
    const minY = 14;
    const maxY = 226;
    const gap = placed.length > 1 ? Math.min(18, (maxY - minY) / (placed.length - 1)) : 0;
    placed.forEach((item, index) => {
      item.labelY = Math.max(minY + index * gap, Math.min(maxY, item.labelY));
    });
    for (let index = placed.length - 2; index >= 0; index -= 1)
      placed[index].labelY = Math.min(placed[index].labelY, placed[index + 1].labelY - gap);
  }
  return rows.map(item => {
    const firstX = 160 + Math.cos(item.angle) * 87;
    const firstY = 116 + Math.sin(item.angle) * 87;
    const radialX = 160 + Math.cos(item.angle) * 94;
    const elbowX = item.side === 'right' ? Math.max(firstX + 6, radialX) : Math.min(firstX - 6, radialX);
    const endX = item.side === 'right' ? Math.max(248, elbowX + 7) : Math.min(72, elbowX - 7);
    return {
      ...item,
      endX,
      textX: item.side === 'right' ? endX + 8 : endX - 8,
      anchor: item.side === 'right' ? ('start' as const) : ('end' as const),
      leader: `${firstX.toFixed(1)},${firstY.toFixed(1)} ${elbowX.toFixed(1)},${item.labelY.toFixed(1)} ${endX},${item.labelY.toFixed(1)}`,
    };
  });
});
function submit(): void {
  const amount = Number(draft.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !draft.title.trim()) return;
  emit('add', {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: draft.title.trim(),
    amount,
    direction: draft.direction as 'income' | 'expense',
    category: draft.category as (typeof walletCategories)[number],
    date: draft.date,
    account: '日常账户',
    note: '',
    state: 'received',
  });
  adding.value = false;
  draft.amount = '';
  draft.title = '';
}
</script>
