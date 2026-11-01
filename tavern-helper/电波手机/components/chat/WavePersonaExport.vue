<template>
  <section
    v-if="phone.activeIdentity?.source !== 'local_group'"
    class="settings-card system-settings-card persona-export"
  >
    <div class="wave-settings-title">导出人设卡</div>
    <p>保存为 PNG，包含当前角色人设、头像、关系、翻译与时间设置、语音和角色生图设置。导出前自动保存修改。</p>
    <button type="button" class="system-action" :disabled="busy" @click="saveCard()">
      <i class="fa-solid fa-file-export"></i> {{ busy ? '正在打包图片…' : '导出人设卡 · PNG' }}
    </button>
    <template v-if="imageFailed">
      <p>备用导出保留原图片链接，不内嵌网络图片；PNG 封面使用姓名。接收方无法访问原链接时，图片可能不显示。</p>
      <button class="system-action" type="button" :disabled="busy" @click="saveCard(true)">保留图片链接导出 PNG</button>
    </template>
    <p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { useSaveSettingsForms } from '../../services/core/settings-forms';
import { exportPersonaPng, downloadPersona, PersonaImageExportError } from '../../services/chat/persona-card';
const phone = usePhoneStore();
const saveForms = useSaveSettingsForms();
const imageFailed = ref(false);
const busy = ref(false),
  notice = ref('');
async function saveCard(preserveLinks = false) {
  if (busy.value) return;
  busy.value = true;
  notice.value = '';
  try {
    if (!saveForms()) throw Error('请先修正未保存的聊天设置');
    const card = phone.exportPersonaData();
    downloadPersona(await exportPersonaPng(card, preserveLinks), card.identity.name);
    imageFailed.value = false;
    notice.value = preserveLinks
      ? '已导出人设和设置；图片保留原链接，未完整内嵌。请发送原始 PNG 文件。'
      : '已导出，请发送原始 PNG 文件以保留人设数据。';
  } catch (error) {
    imageFailed.value = error instanceof PersonaImageExportError;
    notice.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}
</script>
<style scoped>
#wave-phone-script-root .wave-device .persona-export {
  padding: 18px;
  gap: 12px;
}
#wave-phone-script-root .wave-device .persona-export p {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--wave-muted);
}
</style>
