<template>
  <div class="notification-sound-settings">
    <div class="sound-event-tabs" role="group" aria-label="音效场景">
      <button
        v-for="item in events"
        :key="item.value"
        type="button"
        :aria-pressed="selected === item.value"
        @click="selected = item.value"
      >
        {{ item.label }}
      </button>
    </div>
    <div class="toggle-row">
      <span
        ><strong>{{ eventLabel }}</strong
        ><small>独立开关、音量和音源</small></span
      ><WaveToggle v-model="config.enabled" :aria-label="eventLabel" />
    </div>
    <label><strong>提示音</strong><WaveSelect v-model="config.soundId" :options="options" aria-label="提示音" /></label>
    <label
      ><strong>音量</strong><WaveSlider v-model="config.volume" :min="0" :max="1" :step="0.05" aria-label="提示音音量"
    /></label>
    <label
      ><strong>音效文件链接</strong
      ><input v-model.trim="link" type="url" placeholder="https://…/notification.mp3" @change="useLink"
    /></label>
    <div class="api-inline-actions">
      <button type="button" @click="fileInput?.click()">上传音效</button
      ><button type="button" @click="preview">试听提示音</button>
    </div>
    <input ref="fileInput" class="wave-sound-file" type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a" @change="upload" />
    <p class="api-note">{{ config.customSoundName || '支持 MP3、WAV、OGG、M4A，最大 3 MB。' }}</p>
    <p v-if="feedback" class="api-note" role="status">{{ feedback }}</p>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import WaveToggle from '../shared/WaveToggle.vue';
import { playSoundEvent, type SoundEvent } from '../../services/core/notification';
import WaveSelect from '../shared/WaveSelect.vue';
import WaveSlider from '../shared/WaveSlider.vue';
const phone = usePhoneStore(),
  fileInput = ref<HTMLInputElement | null>(null),
  link = ref(''),
  feedback = ref('');
const events: { value: SoundEvent; label: string }[] = [
  { value: 'message', label: '新消息提示' },
  { value: 'send', label: '发送消息' },
  { value: 'click', label: '按键交互' },
  { value: 'poke', label: '头像拍一拍' },
];
const selected = ref<SoundEvent>('message');
const config = computed(() => phone.settings.notifications.events[selected.value]);
const eventLabel = computed(() => events.find(e => e.value === selected.value)!.label);
let uploadId = 0;
watch(selected, () => {
  uploadId++;
  feedback.value = '';
  link.value = /^https?:\/\//i.test(config.value.customSound) ? config.value.customSound : '';
});
onUnmounted(() => {
  uploadId++;
});
const options = computed(() => [
  { value: 'default', label: '默认 · ' + eventLabel.value },
  { value: 'custom', label: '自定义音效' },
]);
watch(
  () => config.value.customSound,
  value => {
    link.value = /^https?:\/\//i.test(value) ? value : '';
  },
  { immediate: true },
);
function useLink() {
  uploadId++;
  if (!/^https?:\/\//i.test(link.value)) {
    feedback.value = '请输入 HTTP(S) 音频链接。';
    return;
  }
  config.value.customSound = link.value;
  config.value.customSoundName = '自定义链接';
  config.value.soundId = 'custom';
  feedback.value = '链接已载入，可试听并保存设置。';
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const id = ++uploadId;
  if (file.size > 3 * 1024 * 1024) {
    feedback.value = '音效文件不能超过 3 MB。';
    return;
  }
  const ext = file.name.split('.').at(-1)?.toLowerCase();
  const mime = file.type.startsWith('audio/')
    ? file.type
    : ({ mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4' } as Record<string, string>)[
        ext || ''
      ];
  if (!mime) {
    feedback.value = '请选择音频文件。';
    return;
  }
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(Error('文件读取失败'));
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;/, `data:${mime};`));
      reader.readAsDataURL(file);
    });
    if (id !== uploadId) return;
    config.value.customSound = data;
    config.value.customSoundName = file.name;
    config.value.soundId = 'custom';
    feedback.value = '文件已载入，可试听并保存设置。';
  } catch (e) {
    feedback.value = e instanceof Error ? e.message : '上传失败';
  }
}
async function preview() {
  try {
    await playSoundEvent(phone.settings.notifications, selected.value, true);
    feedback.value = '正在播放';
  } catch {
    feedback.value = '音频无法播放，请检查文件格式、链接或浏览器音频权限。';
  }
}
</script>
