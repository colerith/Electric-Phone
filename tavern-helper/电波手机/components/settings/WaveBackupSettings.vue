<template>
  <div class="system-settings wave-backup-settings">
    <section class="settings-card system-settings-card">
      <div class="wave-settings-title">导出 ZIP 备份</div>
      <p>选择需要的模块。消息设置与角色设定不包含聊天记录，可单独迁移到当前角色卡。</p>
      <div class="backup-modules">
        <label v-for="item in BACKUP_MODULES" :key="item.id"
          ><input v-model="exportModules" type="checkbox" :value="item.id" />{{ item.name }}</label
        >
      </div>
      <div class="system-button-row">
        <button class="system-action" type="button" @click="exportModules = BACKUP_MODULES.map(item => item.id)">
          全选</button
        ><button class="system-action" type="button" @click="exportModules = ['messages']">仅消息设置与角色</button>
      </div>
      <p v-if="exportModules.includes('general')" class="backup-warning">
        <i class="fa-solid fa-shield-halved"></i>备份可能包含 API 密钥，请妥善保管。
      </p>
      <button
        class="system-action backup-action"
        type="button"
        :disabled="busy || !exportModules.length"
        @click="exportBackup"
      >
        <i class="fa-solid fa-file-zipper"></i>导出备份
      </button>
    </section>
    <section class="settings-card system-settings-card">
      <div class="wave-settings-title">导入 ZIP 备份</div>
      <p>只覆盖勾选的模块。角色设定合并到当前卡片；聊天记录与其他应用内容仅恢复到原角色卡、原聊天。</p>
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
        <p>确认导入勾选的模块吗？未勾选的设置和内容保持不变，完成后自动重新载入。</p>
        <div class="backup-modules">
          <label v-for="item in availableModuleOptions" :key="item.id"
            ><input v-model="importModules" type="checkbox" :value="item.id" :disabled="busy" />{{ item.name }}</label
          >
        </div>
        <div class="system-button-row">
          <button class="system-action" type="button" :disabled="busy" @click="cancelImport">取消</button>
          <button
            class="system-action backup-danger"
            type="button"
            :disabled="busy || !importModules.length"
            @click="confirmImport"
          >
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
import { createPhoneBackup, importPhoneBackup, inspectPhoneBackup } from '../../services/core/backup';
import { BACKUP_MODULES, type BackupModule } from '../../services/core/backup-modules';
import { usePhoneStore } from '../../stores/phone';

const phone = usePhoneStore();
const exportModules = ref<BackupModule[]>(['messages']);
const importModules = ref<BackupModule[]>([]);
const availableModules = ref<BackupModule[]>([]);
const availableModuleOptions = computed(() => BACKUP_MODULES.filter(item => availableModules.value.includes(item.id)));
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
    const { filename, blob } = createPhoneBackup(exportModules.value);
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

async function selectFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  pendingFile.value = input.files?.[0] || null;
  failed.value = false;
  notice.value = '';
  availableModules.value = [];
  importModules.value = [];
  if (!pendingFile.value) return;
  busy.value = true;
  try {
    availableModules.value = await inspectPhoneBackup(pendingFile.value);
    importModules.value = [...availableModules.value];
  } catch (error) {
    failed.value = true;
    notice.value = error instanceof Error ? error.message : String(error);
    cancelImport();
  } finally {
    busy.value = false;
  }
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
    const result = await importPhoneBackup(pendingFile.value, importModules.value);
    notice.value = `${result.message}，正在重新载入…`;
    window.setTimeout(() => window.location.reload(), 700);
  } catch (error) {
    failed.value = true;
    notice.value = error instanceof Error ? error.message : String(error);
    busy.value = false;
  }
}
</script>

<style lang="scss">
#wave-phone-script-root .wave-device .wave-backup-settings .backup-modules {
  display: grid;
  gap: 10px;
  margin: 16px 0;
  label {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    margin: 0;
    min-width: 0;
    line-height: 1.5;
    cursor: pointer;
    font-size: 13px;
  }
  input[type='checkbox'] {
    appearance: auto !important;
    width: 18px;
    height: 18px;
    min-height: 18px;
    padding: 0;
    margin: 0;
    flex: 0 0 18px;
    flex-shrink: 0;
    accent-color: var(--wave-blue, #5e80be);
  }
}
</style>
