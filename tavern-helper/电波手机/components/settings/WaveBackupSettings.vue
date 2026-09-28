<template>
  <div class="system-settings wave-backup-settings">
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
    <Teleport v-if="batchOpen" :to="surface || 'body'">
      <div class="backup-modal" @click.self="batchOpen = false" @keydown.esc.stop="batchOpen = false">
        <section
          ref="batchDialog"
          class="backup-dialog settings-card system-settings-card"
          role="dialog"
          aria-modal="true"
          aria-label="分批导出备份"
          tabindex="-1"
        >
          <div class="wave-settings-title">分批导出备份</div>
          <p>选择需要的模块。消息设置与角色设定不包含聊天记录。</p>
          <label class="backup-select-all"
            ><input
              type="checkbox"
              :checked="exportModules.length === BACKUP_MODULES.length"
              :indeterminate.prop="exportModules.length > 0 && exportModules.length < BACKUP_MODULES.length"
              @change="toggleAll"
            />全选模块</label
          >
          <div class="backup-modules">
            <label v-for="item in BACKUP_MODULES" :key="item.id"
              ><input v-model="exportModules" type="checkbox" :value="item.id" />{{ item.name }}</label
            >
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
import { computed, inject, nextTick, ref, watch } from 'vue';
import { createPhoneBackup, importPhoneBackup, inspectPhoneBackup } from '../../services/core/backup';
import { BACKUP_MODULES, type BackupModule } from '../../services/core/backup-modules';
import { usePhoneStore } from '../../stores/phone';
import { phoneSurfaceKey } from '../../services/core/ui-context';

const phone = usePhoneStore();
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

function toggleAll(): void {
  exportModules.value = exportModules.value.length === BACKUP_MODULES.length ? [] : BACKUP_MODULES.map(item => item.id);
}
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
#wave-phone-script-root .wave-device .backup-modules {
  display: grid;
  gap: 4px;
  margin: 8px 0 16px;
  label {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 8px;
    margin: 0;
    min-width: 0;
    line-height: 1.5;
    cursor: pointer;
    font-size: 14px;
    border-radius: 10px;
    &:hover {
      background: var(--settings-control);
    }
  }
  input[type='checkbox'] {
    appearance: none !important;
    width: 20px;
    height: 20px;
    min-height: 20px;
    padding: 0;
    margin: 0;
    flex: 0 0 20px;
    flex-shrink: 0;
    border: 1.5px solid var(--settings-muted);
    border-radius: 6px;
    background: var(--wave-card, #fff);
    cursor: pointer;
    &:checked {
      background: var(--settings-accent);
      border-color: var(--settings-accent);
    }
    &:checked::after {
      content: '✓';
      display: block;
      color: #fff;
      text-align: center;
      font: 700 15px/18px sans-serif;
    }
  }
}
#wave-phone-script-root .wave-device .wave-backup-settings {
  .backup-export-actions {
    display: grid;
    gap: 10px;
    padding: 16px 0 18px;
  }
}
#wave-phone-script-root .wave-device {
  .backup-modal {
    position: absolute;
    inset: 0;
    z-index: 200;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(20, 33, 57, 0.36);
  }
  .backup-modal .backup-dialog {
    width: min(100%, 380px);
    max-height: 88%;
    overflow-y: auto;
    padding: 18px;
    box-sizing: border-box;
  }
  .backup-select-all {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    padding: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--settings-text);
  }
  .backup-select-all input {
    appearance: none !important;
    width: 20px;
    height: 20px;
    margin: 0;
    border: 1.5px solid var(--settings-muted);
    border-radius: 6px;
    background: var(--wave-card, #fff);
    cursor: pointer;
    &:checked,
    &:indeterminate {
      background: var(--settings-accent);
      border-color: var(--settings-accent);
    }
    &:checked::after {
      content: '✓';
      display: block;
      color: #fff;
      text-align: center;
      font: 700 15px/18px sans-serif;
    }
    &:indeterminate::after {
      content: '−';
      display: block;
      color: #fff;
      text-align: center;
      font: 700 16px/18px sans-serif;
    }
  }
  .backup-dialog .system-button-row {
    justify-content: flex-end;
    padding: 8px 0 0;
  }
}
</style>
