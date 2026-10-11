<template>
  <div class="wave-version-update">
    <span class="version-label"
      >电波手机 <span class="version-number">v{{ WAVE_PHONE_RELEASE_VERSION }}</span></span
    >
    <button
      class="version-action"
      :class="{ 'has-update': available }"
      type="button"
      :disabled="busy"
      @click="available ? update() : check()"
    >
      <svg
        class="version-icon"
        :class="{ 'is-spinning': busy }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path v-if="available && !busy" d="M12 4v12m-5-5 5 5 5-5M5 20h14" />
        <path v-else d="M20 7v5h-5M19.2 7a8 8 0 1 0 .2 9M20 12l-3-4" />
      </svg>
      <span class="version-action-text">{{ busy ? '处理中…' : available ? '更新' : '检查更新' }}</span>
    </button>
    <small v-if="status" class="version-status" role="status">{{ status }}</small>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { WAVE_PHONE_RELEASE_VERSION } from '../../schemas';
const busy = ref(false),
  available = ref(false),
  status = ref('');
let target: { extensionName: string; global: boolean } | undefined;
async function locate() {
  if (target) return target;
  const response = await fetch('/api/extensions/discover');
  if (!response.ok) throw Error(`无法读取扩展列表（${response.status}）`);
  const rows = await response.json();
  for (const row of rows) {
    if (!['local', 'global'].includes(row.type)) continue;
    const response = await fetch(`/scripts/extensions/${row.name}/manifest.json`, { cache: 'no-store' });
    if (!response.ok) continue;
    const manifest = await response.json();
    if (manifest.homePage?.replace(/\/$/, '').toLowerCase() !== 'https://github.com/colerith/electric-phone') continue;
    target = { extensionName: row.name.replace(/^third-party\//, ''), global: row.type === 'global' };
    return target;
  }
  throw Error('未找到电波手机扩展安装目录，请从扩展管理安装扩展版');
}
async function request(action: string) {
  const body = await locate();
  const host = (window as any).SillyTavern?.getContext?.();
  if (!host?.getRequestHeaders) throw Error('酒馆接口未就绪，请刷新后重试');
  const response = await fetch(`/api/extensions/${action}`, {
    method: 'POST',
    headers: host.getRequestHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw Error(`更新服务返回 ${response.status}，请检查网络、仓库状态和安装目录权限`);
  return response.json();
}
async function check() {
  if (busy.value) return;
  busy.value = true;
  status.value = '正在检测新版本…';
  try {
    const data = await request('version');
    if (!data.remoteUrl) throw Error('当前安装不支持在线更新，请使用 Git 安装的扩展版');
    available.value = !data.isUpToDate;
    status.value = available.value ? '发现更新，点击更新后将自动刷新网页' : '已是最新版本';
  } catch (e) {
    status.value = e instanceof Error ? e.message : '检测失败，请重试';
  } finally {
    busy.value = false;
  }
}
async function update() {
  if (busy.value) return;
  busy.value = true;
  status.value = '正在更新，完成后自动刷新网页…';
  try {
    await request('update');
    window.location.reload();
  } catch (e) {
    status.value = e instanceof Error ? e.message : '更新失败，请重试';
  } finally {
    busy.value = false;
  }
}
onMounted(check);
</script>
<style scoped>
#wave-phone-script-root .wave-device .wave-version-update {
  --version-pink-bg: #f9e7ee;
  --version-pink-line: #f0ccd9;
  --version-pink-text: #a95475;
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  justify-content: center;
  gap: 9px 16px;
  padding: 18px 8px 24px;
  color: var(--wave-muted, #7d7b86);
  font-size: 11px;
  line-height: 1.5;
}
#wave-phone-script-root .wave-device .version-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 11px;
  font-weight: 400;
  line-height: 16px;
  white-space: nowrap;
}
#wave-phone-script-root .wave-device .version-number {
  margin: 0;
  padding: 0;
  background: transparent;
  font-size: 10px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
#wave-phone-script-root .wave-device .version-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  box-sizing: border-box;
  height: 30px;
  min-height: 30px;
  width: auto;
  margin: 0;
  padding: 0 11px;
  border: 1px solid var(--version-pink-line);
  border-radius: 999px;
  background: var(--version-pink-bg);
  color: var(--version-pink-text);
  box-shadow: inset 0 1px 0 #ffffff70;
  font-family: inherit;
  font-size: 10px;
  font-weight: 500;
  line-height: 14px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    filter 0.15s ease,
    transform 0.15s ease;
}
#wave-phone-script-root .wave-device .version-action.has-update {
  border-color: #d68ba7;
  background: #d990ac;
  color: #fff;
}
#wave-phone-script-root .wave-device .version-action .version-icon {
  display: block;
  flex: 0 0 12px;
  width: 12px;
  height: 12px;
  margin: 0;
  padding: 0;
}
#wave-phone-script-root .wave-device .version-action-text {
  display: block;
  margin: 0;
  padding: 0;
  color: inherit;
  font: inherit;
  line-height: 14px;
}
#wave-phone-script-root .wave-device .version-action:hover:not(:disabled) {
  filter: brightness(0.97);
}
#wave-phone-script-root .wave-device .version-action:active:not(:disabled) {
  transform: translateY(1px);
}
#wave-phone-script-root .wave-device .version-action:focus-visible {
  outline: 2px solid #d990ac;
  outline-offset: 3px;
}
#wave-phone-script-root .wave-device .version-action:disabled {
  opacity: 0.65;
  cursor: wait;
}
#wave-phone-script-root .wave-device .version-status {
  grid-column: 1 / -1;
  width: 100%;
  max-width: 260px;
  justify-self: center;
  margin: 0;
  color: var(--wave-muted, #7d7b86);
  font-size: 10px;
  font-weight: 400;
  line-height: 1.6;
  text-align: center;
  overflow-wrap: anywhere;
  opacity: 0.8;
}
#wave-phone-script-root .wave-device.theme-dark .wave-version-update {
  --version-pink-bg: #3d2a36;
  --version-pink-line: #684253;
  --version-pink-text: #edb2c9;
}
.is-spinning {
  animation: version-spin 1s linear infinite;
}
@keyframes version-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .is-spinning {
    animation: none;
  }
}
</style>
