<template>
  <div class="translation-service-settings">
    <div class="wave-settings-title">翻译 API 服务</div>
    <label
      ><strong>翻译服务</strong
      ><WaveSelect
        v-model="phone.settings.translation.provider"
        :options="translationProviders"
        aria-label="翻译 API 服务"
    /></label>
    <label v-if="phone.settings.translation.provider !== 'secondary_api'"
      ><strong>自定义端口</strong
      ><input v-model.trim="phone.settings.translation.endpoint" type="url" :placeholder="placeholder" /><small
        >MyMemory 可留空；LibreTranslate 需可用实例，公共服务可能限流。</small
      ></label
    >
    <label v-if="['libretranslate', 'mymemory'].includes(phone.settings.translation.provider)"
      ><strong>实例 API Key（如需）</strong
      ><input v-model="phone.settings.translation.apiKey" type="password" autocomplete="off"
    /></label>
    <div class="translation-guide">
      <div class="wave-settings-caption">快速接入</div>
      <p>{{ guide.text }}</p>
      <a v-for="link in guide.links" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer"
        >{{ link.label }} ↗</a
      >
    </div>
    <p class="api-note">
      输入停顿 600
      毫秒后，将文字发送到所选服务生成译文预览。相同内容会复用译文；发送时核对最新文字。源语言和译出语言在私聊设置中选择。
    </p>
    <button class="settings-sound-preview" type="button" :disabled="busy" @click="test">
      {{ busy ? '测试中…' : '测试翻译' }}
    </button>
    <p v-if="feedback" class="api-note" role="status">{{ feedback }}</p>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from 'vue';
import { klona } from 'klona';
import { usePhoneStore } from '../../stores/phone';
import { translateText, translationProviders } from '../../services/generation/translation';
import WaveSelect from '../shared/WaveSelect.vue';
const phone = usePhoneStore(),
  busy = ref(false),
  feedback = ref('');
const guides = {
  mymemory: {
    text: '公共翻译无需 Key：保持端口留空，直接测试。需要访问私有记忆时，打开 Key 页面 → 注册或登录 Translated 账号 → 生成并复制 Key → 粘贴到上方。',
    links: [
      { label: 'API 文档', url: 'https://mymemory.translated.net/doc/spec.php' },
      { label: '获取 Key', url: 'https://mymemory.translated.net/doc/keygen.php' },
    ],
  },
  libretranslate: {
    text: '官方托管服务需付费 Key：打开申请页面 → 按页面指引购买并获取 Key → 地址填 https://libretranslate.com → 粘贴 Key 后测试。自建或公共实例按站点说明获取 Key；未启用鉴权的实例可留空。',
    links: [
      { label: '获取 Key', url: 'https://portal.libretranslate.com' },
      { label: '实例与 Key 说明', url: 'https://docs.libretranslate.com/guides/manage_api_keys/' },
    ],
  },
  lingva: {
    text: '通常无需 Key：打开项目中的实例列表 → 选择能访问的实例 → 将站点地址填入上方 → 测试。若返回 403 或限流，请换实例。',
    links: [{ label: '项目与实例列表', url: 'https://github.com/thedaviddelta/lingva-translate' }],
  },
  secondary_api: {
    text: '使用总设置 → API 设置中当前启用的配置。在对应服务商控制台创建 API Key，返回填写地址、Key 和模型，保存并测试连接，再回这里测试翻译。',
    links: [],
  },
};
const guide = computed(() => guides[phone.settings.translation.provider]);
let controller: AbortController | undefined;
const placeholder = computed(() =>
  phone.settings.translation.provider === 'mymemory'
    ? 'https://api.mymemory.translated.net/get'
    : phone.settings.translation.provider === 'lingva'
      ? 'https://lingva.ml'
      : 'https://你的实例/translate',
);
watch(
  () => phone.settings.translation.provider,
  () => {
    controller?.abort();
    phone.settings.translation.endpoint = '';
    phone.settings.translation.apiKey = '';
    feedback.value = '';
    busy.value = false;
  },
);
async function test() {
  controller?.abort();
  const request = new AbortController();
  controller = request;
  busy.value = true;
  feedback.value = '';
  try {
    const result = await translateText(klona(phone.settings), 'Hello', '英语', '简体中文', request.signal);
    if (!request.signal.aborted) feedback.value = `${result.provider}：${result.text}`;
  } catch (e) {
    if (!request.signal.aborted) feedback.value = e instanceof Error ? e.message : '测试失败';
  } finally {
    if (controller === request) busy.value = false;
  }
}
onUnmounted(() => controller?.abort());
</script>
