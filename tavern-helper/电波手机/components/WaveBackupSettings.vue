<template>
  <div class="system-settings wave-backup-settings">
    <section class="settings-card system-settings-card">
      <div class="wave-settings-title">导出 ZIP 备份</div>
      <p>保存全局设置、API 配置、角色与用户资料、主要角色名单，以及当前打开聊天的手机内容。</p>
      <p class="backup-warning"><i class="fa-solid fa-shield-halved"></i>备份可能包含 API 密钥，请妥善保管。</p>
      <button class="system-action backup-action" type="button" :disabled="busy" @click="exportBackup">
        <i class="fa-solid fa-file-zipper"></i>导出备份
      </button>
    </section>
    <section class="settings-card system-settings-card">
      <div class="wave-settings-title">导入 ZIP 备份</div>
      <p>导入会覆盖现有全局设置。只有备份与当前角色卡、聊天完全对应时，才会恢复聊天内容。</p>
      <input
        ref="fileInput"
        class="wave-visually-hidden"
        type="file"
        accept=".zip,application/zip"
        @change="selectFile"
      />
      <button
        v-if="!pendingFile"
        class="system-action backup-action"
        type="button"
        :disabled="busy"
        @click="fileInput?.click()"
      >
        <i class="fa-solid fa-box-open"></i>选择 ZIP 备份
      </button>
      <div v-else class="backup-confirm">
        <span
          ><i class="fa-regular fa-file-zipper"></i><b>{{ pendingFile.name }}</b
          ><small>{{ fileSize }}</small></span
        >
        <p>确定覆盖当前电波手机设置吗？导入完成后将自动重新载入。</p>
        <div class="system-button-row">
          <button class="system-action" type="button" :disabled="busy" @click="cancelImport">取消</button>
          <button class="system-action backup-danger" type="button" :disabled="busy" @click="confirmImport">
            {{ busy ? '正在导入…' : '确认导入' }}
          </button>
        </div>
      </div>
      <p v-if="notice" role="status" :class="{ 'backup-error': failed }">{{ notice }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { createPhoneBackup, importPhoneBackup } from '../services/backup';
import { usePhoneStore } from '../stores/phone';

const phone = usePhoneStore();
const fileInput = ref<HTMLInputElement | null>(null);
const pendingFile = ref<File | null>(null);
const busy = ref(false);
const notice = ref('');
const failed = ref(false);
const fileSize = computed(() => {
  const bytes = pendingFile.value?.size || 0;
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
});

function exportBackup(): void {
  busy.value = true;
  failed.value = false;
  notice.value = '';
  try {
    phone.saveSettings();
    const { filename, blob } = createPhoneBackup();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice.value = 'ZIP 备份已导出';
  } catch (error) {
    failed.value = true;
    notice.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

function selectFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  pendingFile.value = input.files?.[0] || null;
  failed.value = false;
  notice.value = '';
}

function cancelImport(): void {
  pendingFile.value = null;
  if (fileInput.value) fileInput.value.value = '';
}

async function confirmImport(): Promise<void> {
  if (!pendingFile.value || busy.value) return;
  busy.value = true;
  failed.value = false;
  notice.value = '';
  try {
    const result = await importPhoneBackup(pendingFile.value);
    notice.value = `${result.message}，正在重新载入…`;
    window.setTimeout(() => window.location.reload(), 700);
  } catch (error) {
    failed.value = true;
    notice.value = error instanceof Error ? error.message : String(error);
    busy.value = false;
  }
}
</script>
