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
      <i
        :class="
          busy ? 'fa-solid fa-spinner fa-spin' : available ? 'fa-solid fa-arrow-down' : 'fa-solid fa-rotate-right'
        "
        aria-hidden="true"
      ></i>
      {{ busy ? '处理中…' : available ? '更新' : '检查更新' }}
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 7px 10px;
  padding: 14px 12px 20px;
  color: var(--wave-muted, #737e90);
  font-size: 11px;
  line-height: 1.5;
}
#wave-phone-script-root .wave-device .version-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 500;
}
#wave-phone-script-root .wave-device .version-number {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--wave-tint, #eaf0f8);
  color: var(--wave-muted, #737e90);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
#wave-phone-script-root .wave-device .version-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  width: auto;
  margin: 0;
  padding: 5px 10px;
  border: 1px solid var(--wave-line, #dae3ef);
  border-radius: 9px;
  background: var(--wave-card, #fff);
  color: var(--wave-blue-strong, #4e70a9);
  box-shadow: none;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;
}
#wave-phone-script-root .wave-device .version-action.has-update {
  border-color: transparent;
  background: var(--wave-blue, #6385bd);
  color: #fff;
}
#wave-phone-script-root .wave-device .version-action i {
  font-size: 10px;
}
#wave-phone-script-root .wave-device .version-action:hover:not(:disabled) {
  filter: brightness(0.96);
}
#wave-phone-script-root .wave-device .version-action:active:not(:disabled) {
  transform: translateY(1px);
}
#wave-phone-script-root .wave-device .version-action:focus-visible {
  outline: 2px solid var(--wave-blue, #6385bd);
  outline-offset: 3px;
}
#wave-phone-script-root .wave-device .version-action:disabled {
  opacity: 0.65;
  cursor: wait;
}
#wave-phone-script-root .wave-device .version-status {
  width: 100%;
  margin: 0;
  color: var(--wave-muted, #737e90);
  font-size: 10px;
  font-weight: 400;
  line-height: 1.6;
  text-align: center;
  overflow-wrap: anywhere;
}
</style>
