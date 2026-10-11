<template>
  <div class="wave-version-update">
    <span>电波手机 · v{{ WAVE_PHONE_RELEASE_VERSION }}</span>
    <button type="button" :disabled="busy" @click="available ? update() : check()">
      {{ busy ? '处理中…' : available ? '更新' : '检查更新' }}
    </button>
    <small role="status">{{ status }}</small>
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
.wave-version-update {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  font-size: 13px;
}
button {
  border: 0;
  border-radius: 12px;
  padding: 8px 14px;
  background: #6385bd;
  color: white;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
small {
  width: 100%;
  text-align: center;
  overflow-wrap: anywhere;
}
</style>
