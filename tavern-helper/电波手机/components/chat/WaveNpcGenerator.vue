<template>
  <div class="wave-npc-generator">
    <fieldset :disabled="busy">
      <section>
        <label>关联的主要 NPC / 角色</label>
        <div class="npc-related" role="group" aria-label="关联人物">
          <button
            v-for="contact in contacts"
            :key="contact.charKey"
            type="button"
            role="checkbox"
            :aria-checked="options.relatedKeys.includes(contact.charKey)"
            @click="toggleRelated(contact.charKey)"
          >
            <i
              :class="
                options.relatedKeys.includes(contact.charKey) ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'
              "
            ></i
            >{{ contact.name }}
          </button>
        </div>
        <p>可多选；不选则生成独立人物。只参考所选人物资料。</p>
        <label
          ><span
            >生成数量 <b>{{ options.count }} 位</b></span
          ><WaveSlider v-model="options.count" :min="1" :max="10" :step="1" aria-label="生成 NPC 数量"
        /></label>
      </section>
      <section>
        <label class="npc-row"
          ><span>生成头像</span><WaveToggle v-model="options.avatars" aria-label="生成 NPC 头像"
        /></label>
        <template v-if="options.avatars">
          <label
            >头像生图接口<WaveSelect
              v-model="options.imageProfileId"
              :options="phone.settings.imageServices.profiles.map(p => ({ value: p.id, label: p.name }))"
              placeholder="选择已配置的生图接口"
          /></label>
          <p>请先在「设置 → 图像生成」配置接口。每位 NPC 生成一张头像，可能消耗所选服务额度。</p>
        </template>
      </section>
      <section>
        <label class="npc-row"
          ><span>启用双语</span><WaveToggle v-model="options.bilingual" aria-label="NPC 双语配置"
        /></label>
        <template v-if="options.bilingual">
          <label>角色输出语言<WaveSelect v-model="options.sourceLanguage" :options="translationLanguages" /></label>
          <label>翻译为<WaveSelect v-model="options.targetLanguage" :options="translationLanguages" /></label>
          <p>应用于新 NPC 的私聊设置，之后可逐个修改。</p>
        </template>
      </section>
      <section>
        <label
          >补充说明<textarea
            v-model="options.notes"
            rows="4"
            maxlength="6000"
            placeholder="例如：三位与主要角色同校的朋友，性格各不相同"
          />
        </label>
      </section>
    </fieldset>
    <div v-if="busy || status" class="npc-progress" role="status" aria-live="polite">
      <progress
        v-if="busy"
        :value="stage === 'profiles' ? undefined : completed"
        :max="options.count"
        aria-label="NPC 生成进度"
      />
      <p>{{ status }}</p>
      <p v-for="warning in warnings" :key="warning">{{ warning }}</p>
    </div>
    <button v-if="busy" type="button" class="settings-save-wide" @click="cancel">取消生成</button>
    <button v-else type="button" class="settings-save-wide" @click="generate">
      {{ succeeded ? '再生成一批 NPC' : '生成并添加 NPC' }}
    </button>
    <p>使用「API 连接」中的副 API。完成后加入当前角色卡通讯录。</p>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { klona } from 'klona';
import { usePhoneStore } from '../../stores/phone';
import { NpcGenerationOptionsSchema } from '../../services/chat/npc-generation';
import {
  generateNpcContacts,
  createPhoneGenerationId,
  stopPhoneGeneration,
} from '../../services/generation/generation';
import { generateImage } from '../../services/image/generate';
import { CharacterImageSchema } from '../../services/image/schema';
import { buildCustomApi } from '../../services/core/api-config';
import { translationLanguages } from '../../services/generation/translation';
import WaveSelect from '../shared/WaveSelect.vue';
import WaveSlider from '../shared/WaveSlider.vue';
import WaveToggle from '../shared/WaveToggle.vue';
const phone = usePhoneStore();
const options = ref(NpcGenerationOptionsSchema.parse({}));
const contacts = computed(() => phone.identities.filter(c => !['local_group', 'temporary'].includes(c.source)));
const busy = ref(false),
  succeeded = ref(false),
  status = ref(''),
  warnings = ref<string[]>([]),
  stage = ref('profiles'),
  completed = ref(0);
let token = 0,
  generationId = '',
  controller: AbortController | undefined;
function toggleRelated(key: string) {
  if (busy.value) return;
  options.value.relatedKeys = options.value.relatedKeys.includes(key)
    ? options.value.relatedKeys.filter(k => k !== key)
    : [...options.value.relatedKeys, key];
}
function cancel() {
  token++;
  controller?.abort();
  if (generationId) void stopPhoneGeneration(generationId).catch(() => {});
  generationId = '';
  if (busy.value) status.value = '已取消，本批人物未添加。';
  busy.value = false;
}
watch(() => `${phone.context?.cardKey}::${phone.context?.chatKey}`, cancel);
onBeforeUnmount(cancel);
async function generate() {
  if (busy.value) return;
  const run = ++token;
  warnings.value = [];
  succeeded.value = false;
  try {
    const config = NpcGenerationOptionsSchema.parse(klona(options.value));
    const settings = klona(phone.settings);
    buildCustomApi(settings);
    const namespace = phone.context && { cardKey: phone.context.cardKey, chatKey: phone.context.chatKey };
    if (!namespace) throw Error('请先打开角色卡聊天');
    const profile = settings.imageServices.profiles.find(p => p.id === config.imageProfileId);
    if (config.avatars && (!profile || !profile.apiKey.trim() || !profile.model.trim()))
      throw Error('请先选择已填写密钥与模型的生图配置');
    if (config.relatedKeys.some(key => !contacts.value.some(c => c.charKey === key)))
      throw Error('关联人物已变化，请重新选择');
    busy.value = true;
    stage.value = 'profiles';
    completed.value = 0;
    status.value = `副 API 正在生成 ${config.count} 位 NPC 资料…`;
    controller = new AbortController();
    const abort = controller;
    generationId = createPhoneGenerationId();
    const rows = await generateNpcContacts(settings, config, klona(contacts.value), generationId);
    if (run !== token) return;
    generationId = '';
    if (config.avatars && profile) {
      stage.value = 'avatars';
      for (let i = 0; i < rows.length; i++) {
        if (run !== token) return;
        status.value = `正在生成头像 ${i + 1}/${rows.length}：${rows[i].name}`;
        try {
          if (!rows[i].avatarPrompt) throw Error('未返回头像提示词');
          // Use the chosen style, never its saved character reference images for a new NPC.
          rows[i].avatar = await generateImage(
            { ...profile, vibes: [] },
            CharacterImageSchema.parse({ enabled: true }),
            rows[i].avatarPrompt,
            abort.signal,
          );
        } catch (error) {
          if (run !== token) return;
          warnings.value.push(
            `${rows[i].name}：头像生成失败，保留人物资料（${error instanceof Error ? error.message : '接口错误'}）。`,
          );
        }
        completed.value = i + 1;
      }
    }
    if (run !== token) return;
    phone.addGeneratedNpcs(rows, config, namespace);
    status.value = `已添加 ${rows.length} 位 NPC：${rows.map(c => c.name).join('、')}`;
    succeeded.value = true;
  } catch (error) {
    if (run === token) status.value = error instanceof Error ? error.message : '生成失败，请重试';
  } finally {
    if (run === token) {
      busy.value = false;
      generationId = '';
      controller = undefined;
    }
  }
}
</script>
<style scoped lang="scss">
#wave-phone-script-root .wave-npc-generator {
  display: grid;
  gap: 16px;
  min-width: 0;
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  section {
    display: grid;
    gap: 14px;
    padding: 18px 0;
  }
  section + section {
    border-top: 1px solid #8882;
  }
  label {
    display: grid;
    gap: 12px;
    margin: 0;
    font-weight: 400;
  }
  label > span,
  .npc-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  b {
    color: var(--wave-blue, #5e80be);
    font-weight: 500;
  }
  p {
    margin: 0;
    padding: 0;
    text-indent: 0;
    font-size: 12px;
    line-height: 1.7;
    opacity: 0.65;
    overflow-wrap: anywhere;
  }
  textarea {
    box-sizing: border-box;
    width: 100%;
    padding: 12px;
    font: inherit;
    font-weight: 400;
    border: 1px solid #8883;
    border-radius: 12px;
    background: #8881;
    color: inherit;
  }
  .npc-related {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    max-height: 160px;
    overflow-y: auto;
  }
  .npc-related button {
    appearance: none;
    display: flex;
    align-items: center;
    gap: 8px;
    width: auto;
    height: auto;
    margin: 0;
    padding: 9px 12px;
    border: 1px solid #8883;
    border-radius: 12px;
    background: #8881;
    color: inherit;
    font: inherit;
    font-size: 13px;
    font-weight: 400;
  }
  .npc-related button[aria-checked='true'] {
    background: #5e80be18;
    border-color: #5e80be;
    color: var(--wave-blue, #5e80be);
  }
  .npc-progress {
    display: grid;
    gap: 8px;
  }
  progress {
    width: 100%;
    accent-color: var(--wave-blue, #5e80be);
  }
}
</style>
