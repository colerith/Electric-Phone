<template>
  <div class="system-settings wave-backup-settings">
    <section v-if="isExtensionRuntime" class="settings-card system-settings-card">
      <div class="wave-settings-title">迁移旧脚本设置</div>
      <p>
        一键读取同一酒馆用户下的旧脚本设置，包括 API、外观、角色配置和各 App
        设置。聊天记录继续沿用，旧脚本和迁移前快照会保留。
      </p>
      <label v-if="migrationSources.length > 1"
        >迁移来源
        <WaveSelect
          v-model="migrationSource"
          :disabled="busy"
          :options="migrationSources.map(source => ({ value: source.id, label: source.name || source.id }))"
          aria-label="迁移来源"
        />
      </label>
      <button
        class="system-action backup-action"
        type="button"
        :disabled="busy || (migrationSources.length > 1 && !migrationSource)"
        @click="migrateSettings"
      >
        <i class="fa-solid fa-file-import"></i>{{ migrating ? '正在迁移…' : '一键迁移脚本所有设置' }}
      </button>
      <p v-if="migrationNotice" role="status" :class="{ 'backup-error': migrationFailed }">{{ migrationNotice }}</p>
    </section>
    <section class="settings-card system-settings-card">
      <div class="wave-settings-title">存储状态</div>
      <label
        >自动保存间隔（秒）
        <input
          v-model.number="phone.settings.basic.storageIntervalSeconds"
          type="number"
          min="5"
          max="600"
          @change="phone.saveSettings()"
        />
      </label>
      <p>默认每 30 秒合并保存一次，可设为 5–600 秒；没有变化时不上传。需要立即落盘时可点击下方按钮。</p>
      <p role="status">{{ storageMessage }}</p>
      <p v-if="phoneStorageStatus.recovery">{{ phoneStorageStatus.recovery }}</p>
      <button class="system-action backup-action" type="button" :disabled="storageSaving" @click="saveStorage">
        {{ storageSaving ? '正在保存…' : phoneStorageStatus.error ? '重试保存' : '立即保存到服务器' }}
      </button>
    </section>
    <section class="settings-card system-settings-card">
      <div class="wave-settings-title">导出 ZIP 备份</div>
      <p>全量导出包含所有模块；分批导出时选择所需模块。备份可能包含 API 密钥，请妥善保管。</p>
      <div class="backup-export-actions">
        <button
          class="system-action backup-action"
          type="button"
          :disabled="busy"
          @click="exportBackup(BACKUP_MODULES.map(item => item.id))"
        >
          <i class="fa-solid fa-file-zipper"></i>全量导出备份
        </button>
        <button class="system-action backup-action" type="button" :disabled="busy" @click="batchOpen = true">
          <i class="fa-solid fa-layer-group"></i>分批导出备份
        </button>
      </div>
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
          ><i class="fa-solid fa-file-zipper"></i><b :title="pendingFile.name">{{ pendingFile.name }}</b
          ><small>{{ fileSize }}</small></span
        >
        <WaveBackupModulePicker v-model="importModules" :options="availableModuleOptions" :disabled="busy" />
        <p class="backup-import-hint">仅覆盖勾选内容，完成后自动重新载入。</p>
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
    <Teleport v-if="batchOpen" :to="surface || 'body'">
      <div class="backup-modal" @click.self="batchOpen = false" @keydown.esc.stop="batchOpen = false">
        <section
          ref="batchDialog"
          class="backup-dialog wave-backup-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="分批导出备份"
          tabindex="-1"
        >
          <div class="wave-settings-title">分批导出备份</div>
          <p>选择需要的模块。消息设置与角色设定不包含聊天记录。</p>
          <div class="wave-backup-dialog-body">
            <WaveBackupModulePicker v-model="exportModules" :options="BACKUP_MODULES" :disabled="busy" />
          </div>
          <p v-if="exportModules.includes('general')" class="backup-warning">
            <i class="fa-solid fa-shield-halved"></i>备份可能包含 API 密钥，请妥善保管。
          </p>
          <div class="system-button-row">
            <button class="system-action" type="button" @click="batchOpen = false">取消</button>
            <button
              class="system-action backup-action"
              type="button"
              :disabled="busy || !exportModules.length"
              @click="exportBackup(exportModules)"
            >
              <i class="fa-solid fa-file-zipper"></i>导出备份
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import WaveBackupModulePicker from './WaveBackupModulePicker.vue';
import { phoneStorageStatus, flushPhoneStorage } from '../../services/core/durable-storage';
import { computed, inject, nextTick, ref, watch } from 'vue';
import { createPhoneBackup, importPhoneBackup, inspectPhoneBackup } from '../../services/core/backup';
import { BACKUP_MODULES, type BackupModule } from '../../services/core/backup-modules';
import { usePhoneStore } from '../../stores/phone';
import { phoneSurfaceKey } from '../../services/core/ui-context';

import WaveSelect from '../shared/WaveSelect.vue';
import { isExtensionRuntime } from '../../services/core/runtime';
import { legacyScripts } from '../../extension/bridge';
import { migrateScriptSettings } from '../../extension/migration';

const phone = usePhoneStore();
const migrationSources = isExtensionRuntime ? legacyScripts() : [];
const migrationSource = ref(migrationSources.length === 1 ? migrationSources[0].id : '');
const migrating = ref(false);
const migrationNotice = ref('');
const migrationFailed = ref(false);
async function migrateSettings(): Promise<void> {
  if (busy.value) return;
  busy.value = migrating.value = true;
  migrationFailed.value = false;
  migrationNotice.value = '';
  try {
    const count = await migrateScriptSettings(migrationSource.value, phone.reloadPersistentData);
    migrationNotice.value = `已迁移并应用 ${count} 类设置，无需导入导出。`;
  } catch (error) {
    migrationFailed.value = true;
    migrationNotice.value = error instanceof Error ? error.message : '迁移失败，请重试。';
  } finally {
    busy.value = migrating.value = false;
  }
}
const storageSaving = ref(false);
const storageMessage = computed(() =>
  phoneStorageStatus.error
    ? `服务器保存未完成：${phoneStorageStatus.error}`
    : phoneStorageStatus.pending
      ? '有更改等待定时保存到酒馆服务器…'
      : phoneStorageStatus.savedAt
        ? `已保存到酒馆服务器 · ${new Date(phoneStorageStatus.savedAt).toLocaleTimeString()}`
        : '设置与聊天会自动保存到酒馆服务器，并保留上一份存档。',
);
async function saveStorage(): Promise<void> {
  storageSaving.value = true;
  try {
    // Retry the queued snapshot verbatim, including a ZIP import whose server write failed.
    if (!phoneStorageStatus.pending) {
      phone.saveSettings();
      phone.saveChat();
    }
    await flushPhoneStorage();
  } catch {
    /* The shared status displays the error and preserves the pending write. */
  } finally {
    storageSaving.value = false;
  }
}
const surface = inject(phoneSurfaceKey, ref(null));
const exportModules = ref<BackupModule[]>(['messages']);
const batchOpen = ref(false);
const batchDialog = ref<HTMLElement | null>(null);
watch(batchOpen, async open => {
  if (open) {
    await nextTick();
    batchDialog.value?.focus();
  }
});
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

function exportBackup(modules: BackupModule[]): void {
  busy.value = true;
  failed.value = false;
  notice.value = '';
  try {
    phone.saveSettings();
    const { filename, blob } = createPhoneBackup(modules);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice.value = 'ZIP 备份已导出';
    batchOpen.value = false;
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
  if (!pendingFile.value || busy.value || !importModules.value.length) return;
  busy.value = true;
  failed.value = false;
  notice.value = '';
  try {
    const result = await importPhoneBackup(pendingFile.value, importModules.value, phone.reloadPersistentData);
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
#wave-phone-script-root .wave-device .wave-backup-settings .backup-export-actions {
  display: grid;
  gap: 10px;
  padding: 16px 0 18px;
}
#wave-phone-script-root .wave-device .backup-modal {
  position: absolute;
  inset: 0;
  z-index: 200;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  place-items: center;
  padding: 16px;
  box-sizing: border-box;
  background: rgba(20, 33, 57, 0.36);
  .wave-backup-dialog {
    box-sizing: border-box;
    width: min(100%, 380px);
    max-height: 100%;
    min-height: 0;
    margin: 0;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
    border: 1px solid var(--settings-line);
    border-radius: 20px;
    background: var(--wave-card, #fff);
    color: var(--settings-text);
    font: 400 13px/1.5 var(--wave-ui-font);
  }
  .wave-backup-dialog > p {
    margin: 0;
    font: 400 11px/1.5 var(--wave-ui-font);
    color: var(--settings-muted);
    flex-shrink: 0;
  }
  .wave-backup-dialog .wave-settings-title {
    margin: 0;
    font: 700 16px/1.5 var(--wave-ui-font);
    flex-shrink: 0;
  }
  .wave-backup-dialog-body {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .wave-backup-dialog .system-button-row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin: 0;
    padding: 10px 0 0;
    border-top: 1px solid var(--settings-line);
    flex-shrink: 0;
  }
  .wave-backup-dialog .system-action {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 16px;
    border: 1px solid var(--settings-line);
    border-radius: 12px;
    color: var(--settings-text);
    background: var(--settings-control);
    font: 600 13px/1.5 var(--wave-ui-font);
    cursor: pointer;
  }
  .wave-backup-dialog .backup-action {
    color: #fff;
    background: var(--settings-accent);
    border-color: var(--settings-accent);
  }
  .wave-backup-dialog .system-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .wave-backup-dialog .system-action:focus-visible {
    outline: 2px solid var(--settings-accent);
    outline-offset: 2px;
  }
}
#wave-phone-script-root .wave-device .wave-backup-settings .backup-confirm {
  gap: 10px;
  .backup-import-hint {
    margin: 0;
    font-size: 11px;
  }
  .system-button-row {
    display: grid;
    grid-template-columns: 1fr 2fr;
    padding-top: 4px;
  }
}
</style>
