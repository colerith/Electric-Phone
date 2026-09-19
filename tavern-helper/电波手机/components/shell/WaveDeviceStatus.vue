<template>
  <div ref="root" class="device-status">
    <button
      class="device-status-trigger"
      type="button"
      :aria-expanded="open"
      :aria-label="`信号 ${device.signal} 格，电量 ${percent}%，${device.power.charging ? '正在充电' : '未充电'}，点击管理充电`"
      @click="open = !open"
    >
      <svg class="device-signal" viewBox="0 0 24 20" aria-hidden="true">
        <rect
          v-for="bar in 4"
          :key="bar"
          :x="(bar - 1) * 6"
          :y="20 - (5 + bar * 3)"
          width="4"
          :height="5 + bar * 3"
          rx="2"
          :class="{ active: bar <= device.signal }"
        />
      </svg>
      <svg
        class="device-battery"
        :class="{ low: percent <= 20, charging: device.power.charging }"
        viewBox="0 0 34 20"
        aria-hidden="true"
      >
        <rect x="1" y="2" width="28" height="16" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" />
        <rect x="3.5" y="4.5" :width="(23 * percent) / 100" height="11" rx="2.8" fill="currentColor" />
        <rect x="31" y="7" width="2.5" height="6" rx="1.25" fill="currentColor" opacity=".65" />
        <path v-if="device.power.charging" d="M16 4 L11 11 H15 L13 16 L20 8 H16 Z" class="device-charge-mark" />
      </svg>
      <span class="device-percent">{{ percent }}%</span>
    </button>
    <div v-if="open" class="device-power-panel" @keydown.esc="open = false">
      <div class="wave-settings-title">
        手机电量 <span>{{ percent }}%</span>
      </div>
      <p>
        {{
          device.power.charging
            ? percent === 100
              ? '已充满，可拔下充电器'
              : '正在充电 · 每分钟约恢复 1%'
            : '按实际时间耗电 · 每小时约 7.2%'
        }}
      </p>
      <progress :value="device.power.level" max="100" aria-label="剩余电量"></progress>
      <button type="button" @click="device.toggleCharging">
        {{ device.power.charging ? '拔下充电器' : '接上充电器' }}
      </button>
      <small>关闭手机后仍按时间结算。低电量与充电状态会随下一次回复请求同步给角色。</small>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useDeviceStore } from '../../stores/device';
const device = useDeviceStore();
const percent = computed(() => Math.ceil(device.power.level));
const open = ref(false),
  root = ref<HTMLElement | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;
let owner: Document | undefined;
function tick() {
  const warning = device.tick();
  if (warning) toastr.warning(warning, '低电量');
}
function outside(event: Event) {
  if (!root.value?.contains(event.target as Node)) open.value = false;
}
onMounted(() => {
  tick();
  timer = setInterval(tick, 20000);
  owner = root.value?.ownerDocument;
  owner?.addEventListener('pointerdown', outside);
});
onUnmounted(() => {
  clearInterval(timer);
  owner?.removeEventListener('pointerdown', outside);
});
</script>
