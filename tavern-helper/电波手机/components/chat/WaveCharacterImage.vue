<template>
  <section class="wave-image-settings image-settings-manager character-image-settings">
    <section class="image-section" aria-label="角色生图接口">
      <div class="image-heading">
        <strong>角色生图</strong
        ><WaveToggle
          :model-value="config.enabled"
          aria-label="启用角色生图"
          @update:model-value="value => update({ enabled: value })"
        />
      </div>
      <p class="image-help">
        当前角色：{{ phone.activeIdentity?.name }}。配置自动保存；仅点击「生成并发到私聊」时请求生图。
      </p>
      <label v-if="config.enabled"
        >使用的生图接口<WaveSelect
          :model-value="config.profileId"
          :options="phone.settings.imageServices.profiles.map(p => ({ value: p.id, label: p.name }))"
          placeholder="请先在「图像生成」中添加接口"
          @update:model-value="value => update({ profileId: value })"
      /></label>
      <p v-if="config.enabled && !selectedProfile" class="image-help">还没有可用配置，请前往「设置 → 图像生成」。</p>
    </section>
    <template v-if="config.enabled">
      <section class="image-section" aria-label="角色外貌">
        <div class="image-heading"><strong>角色外貌</strong><span class="image-count">自动保存</span></div>
        <label
          >角色前置提示词<textarea
            :value="config.prefix"
            rows="4"
            placeholder="发色、瞳色、体型、服装等固定外貌；生成时始终放在画面描述前。"
            @change="update({ prefix: ($event.target as HTMLTextAreaElement).value })"
          />
        </label>
        <div class="image-actions"><button type="button" @click="loadBaibai">读取柏宝绘角色 / 参考图</button></div>
        <div v-if="characters.length" class="image-grid">
          <label
            >柏宝绘角色档案<WaveSelect
              v-model="selectedCharacter"
              :options="
                characters.map((c, i) => ({
                  value: String(i),
                  label: `${c.name} · ${c.scope === 'global' ? '全局' : '当前聊天'}`,
                }))
              "
          /></label>
          <button type="button" @click="applyCharacter">使用此外貌</button>
        </div>
      </section>
      <section class="image-section" aria-label="角色参考图">
        <div class="image-heading">
          <strong>参考图</strong><span class="image-count">{{ config.references.length }} / 8</span>
        </div>
        <div v-if="vibes.length" class="image-import-row">
          <label
            >柏宝绘参考图<WaveSelect v-model="selectedVibe" :options="vibes.map(v => ({ value: v.id, label: v.name }))"
          /></label>
          <button type="button" :disabled="importing" @click="importReference">
            {{ importing ? '读取中…' : '添加此参考图' }}
          </button>
        </div>
        <div class="image-heading">
          <button type="button" :disabled="config.references.length >= 8" @click="editingReference = 'new'">
            ＋ 本地图片 / 地址
          </button>
        </div>
        <p v-if="!config.references.length" class="image-help">
          还没有参考图，可添加本地图片、图片地址，或读取柏宝绘参考图。
        </p>
        <div v-for="reference in config.references" :key="reference.id" class="image-reference">
          <img v-if="reference.image" :src="reference.image" :alt="reference.name" />
          <label
            >{{ reference.name }}<small v-if="!reference.image">仅 NovelAI Vibe 编码</small
            ><input
              :value="reference.strength"
              type="number"
              min="0"
              max="1"
              step="0.05"
              aria-label="NovelAI 参考强度"
              @change="strength(reference.id, Number(($event.target as HTMLInputElement).value))"
          /></label>
          <button
            type="button"
            aria-label="移除参考图"
            @click="update({ references: config.references.filter(r => r.id !== reference.id) })"
          >
            移除
          </button>
        </div>
        <p class="image-help">
          NovelAI 使用 Vibe 参考强度；GPT Image 使用原图。外貌提示词与参考图用于约束人物特征，不能保证每次完全一致。
        </p>
        <WaveImageUpload
          v-if="editingReference"
          model-value=""
          purpose="artwork"
          label="角色参考图"
          :max-side="1536"
          :quality="0.9"
          inline
          @confirm="addReference"
          @cancel="editingReference = ''"
          @reset="editingReference = ''"
        />
      </section>
      <section class="image-section" aria-label="本次生成">
        <div class="image-heading"><strong>本次生成</strong></div>
        <label
          >本次画面描述<textarea
            v-model="prompt"
            rows="3"
            :disabled="busy"
            placeholder="例如：在窗边读书，白衬衫，午后阳光，半身构图"
          />
        </label>
        <div class="image-actions">
          <button
            class="image-primary"
            type="button"
            :disabled="busy || !selectedProfile || !prompt.trim()"
            @click="generate"
          >
            {{ busy ? '正在生成…' : '生成并发到私聊' }}</button
          ><button v-if="busy" type="button" @click="cancel">取消生成</button>
        </div>
      </section>
    </template>
    <p v-if="status" role="status" class="image-status">{{ status }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { ImageReferenceSchema, type CharacterImage } from '../../services/image/schema';
import { baibaiCharacters, baibaiReferences, importBaibaiReference } from '../../services/image/baibai';
import WaveSelect from '../shared/WaveSelect.vue';
import WaveToggle from '../shared/WaveToggle.vue';
import WaveImageUpload from '../shared/WaveImageUpload.vue';
const emit = defineEmits<{ generated: [] }>();
const phone = usePhoneStore();
const config = computed(() => phone.characterImage);
const selectedProfile = computed(() =>
  phone.settings.imageServices.profiles.find(p => p.id === config.value.profileId),
);
const status = ref(''),
  prompt = ref(''),
  editingReference = ref('');
const busy = ref(false),
  importing = ref(false);
const characters = ref<ReturnType<typeof baibaiCharacters>>([]),
  vibes = ref<ReturnType<typeof baibaiReferences>>([]);
const selectedCharacter = ref(''),
  selectedVibe = ref('');
let controller: AbortController | undefined;
const contextKey = computed(() => `${phone.context?.cardKey}::${phone.context?.chatKey}::${phone.state.activeCharKey}`);
function cancel() {
  controller?.abort();
}
watch(contextKey, () => {
  cancel();
  prompt.value = '';
  status.value = '';
  editingReference.value = '';
  characters.value = [];
  vibes.value = [];
});
onBeforeUnmount(cancel);
function update(patch: Partial<CharacterImage>) {
  phone.setCharacterImage({ ...config.value, ...patch });
}
function strength(id: string, value: number) {
  if (Number.isFinite(value))
    update({
      references: config.value.references.map(r =>
        r.id === id ? { ...r, strength: Math.max(0, Math.min(1, value)) } : r,
      ),
    });
}
function loadBaibai() {
  vibes.value = baibaiReferences();
  selectedVibe.value = vibes.value[0]?.id || '';
  try {
    characters.value = baibaiCharacters();
    const index = characters.value.findIndex(c => c.name === phone.activeIdentity?.name);
    selectedCharacter.value = String(index >= 0 ? index : 0);
    status.value = `读取到 ${characters.value.length} 个角色、${vibes.value.length} 张参考图，请选择后导入`;
  } catch (e) {
    status.value = `${e instanceof Error ? e.message : '角色库读取失败'}；读取到 ${vibes.value.length} 张参考图`;
  }
}
function applyCharacter() {
  const item = characters.value[Number(selectedCharacter.value)];
  if (!item) return;
  update({ prefix: [item.tag, item.nl].filter(Boolean).join(', ') });
  status.value = `已同步 ${item.name} 的外貌，可继续手动调整`;
}
async function importReference() {
  if (!selectedVibe.value || importing.value) return;
  const key = contextKey.value;
  importing.value = true;
  try {
    const reference = await importBaibaiReference(selectedVibe.value);
    if (key !== contextKey.value) return;
    const refs = config.value.references.filter(r => r.id !== reference.id);
    if (refs.length >= 8) throw Error('每个角色最多 8 张参考图');
    update({ references: [...refs, reference] });
    status.value = '参考图已复制到手机配置，可随备份迁移';
  } catch (e) {
    if (key === contextKey.value) status.value = e instanceof Error ? e.message : '参考图导入失败';
  } finally {
    importing.value = false;
  }
}
function addReference(value: { avatar: string }) {
  if (value.avatar && config.value.references.length < 8)
    update({
      references: [
        ...config.value.references,
        ImageReferenceSchema.parse({
          id: crypto.randomUUID(),
          image: value.avatar,
          name: `参考图 ${config.value.references.length + 1}`,
        }),
      ],
    });
  editingReference.value = '';
}
async function generate() {
  if (busy.value) return;
  const key = contextKey.value;
  const request = new AbortController();
  controller = request;
  busy.value = true;
  status.value = '正在请求生图，参考图较多时可能需要几分钟…';
  const timer = setTimeout(() => request.abort(), 240000);
  try {
    await phone.generateCharacterImage(prompt.value, request.signal);
    if (key === contextKey.value) {
      status.value = '图片已保存到私聊';
      emit('generated');
    }
  } catch (e) {
    if (key === contextKey.value)
      status.value = request.signal.aborted
        ? '生成已取消或超时，可以重新尝试'
        : e instanceof Error
          ? e.message
          : '生图失败';
  } finally {
    clearTimeout(timer);
    busy.value = false;
    if (controller === request) controller = undefined;
  }
}
</script>
<style scoped lang="scss" src="../settings/image-settings.scss"></style>
