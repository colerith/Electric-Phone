<template>
  <section class="wave-image-settings image-section character-image-settings">
    <section class="image-subsection" aria-label="角色生图接口">
      <div class="image-heading">
        <strong>{{ groupMode ? '群聊生图' : '角色生图' }}</strong
        ><WaveToggle
          :model-value="config.enabled"
          :aria-label="groupMode ? '启用群聊生图' : '启用角色生图'"
          @update:model-value="value => update({ enabled: value })"
        />
      </div>
      <p class="image-help">
        <template v-if="groupMode"
          >群内共用所选生图接口与每轮数量。每张图按发言成员读取其私聊外貌和参考图；用户人像读取「我的」资料，场景和物品不套用人物外貌。</template
        ><template v-else
          >当前角色：{{
            phone.activeIdentity?.name
          }}。配置自动保存；角色回复中的图片会按每轮数量设置请求生图。</template
        >
      </p>
      <label v-if="config.enabled"
        >使用的生图接口<WaveSelect
          :model-value="config.profileId"
          :options="phone.settings.imageServices.profiles.map(p => ({ value: p.id, label: p.name }))"
          placeholder="请先在「图像生成」中添加接口"
          @update:model-value="value => update({ profileId: value })"
      /></label>
      <p v-if="config.enabled && !selectedProfile" class="image-help">还没有可用配置，请前往「设置 → 图像生成」。</p>
      <WaveMediaRange
        v-if="config.enabled"
        :model-value="config.generation"
        :fallback="phone.settings.imageServices.generation"
        noun="生图"
        unit="张"
        override
        @update:model-value="value => update({ generation: value })"
      />
    </section>
    <template v-if="config.enabled && !groupMode">
      <section class="image-subsection" aria-label="角色外貌">
        <div class="image-heading"><strong>角色外貌</strong><span class="image-count">自动保存</span></div>
        <WaveAppearanceImport
          :model-value="config.prefix"
          :provider="selectedProfile?.provider"
          :name="phone.activeIdentity?.name"
          @update:model-value="value => update({ prefix: value })"
        />
      </section>
      <section class="image-subsection" aria-label="角色参考图">
        <div class="image-heading">
          <strong>参考图</strong><span class="image-count">{{ config.references.length }} / 8</span>
        </div>
        <div class="image-actions"><button type="button" @click="loadBaibai">读取柏宝绘参考图</button></div>
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
          NovelAI 使用 Vibe 参考强度；GPT Image 使用原图。仅当前角色人像使用这些参考图，场景、物品及其他人物不会套用。
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
    </template>
    <p v-if="status" role="status" class="image-status">{{ status }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { ImageReferenceSchema, type CharacterImage } from '../../services/image/schema';
import { baibaiReferences, importBaibaiReference } from '../../services/image/baibai';
import WaveAppearanceImport from '../shared/WaveAppearanceImport.vue';
import WaveSelect from '../shared/WaveSelect.vue';
import WaveMediaRange from '../shared/WaveMediaRange.vue';
import WaveToggle from '../shared/WaveToggle.vue';
import WaveImageUpload from '../shared/WaveImageUpload.vue';
const phone = usePhoneStore();
const groupMode = computed(() => phone.activeIdentity?.source === 'local_group');
const config = computed(() => phone.characterImage);
const selectedProfile = computed(() =>
  phone.settings.imageServices.profiles.find(p => p.id === config.value.profileId),
);
const status = ref(''),
  editingReference = ref('');
const importing = ref(false);
const vibes = ref<ReturnType<typeof baibaiReferences>>([]);
const selectedVibe = ref('');
const contextKey = computed(() => `${phone.context?.cardKey}::${phone.context?.chatKey}::${phone.state.activeCharKey}`);
watch(contextKey, () => {
  status.value = '';
  editingReference.value = '';
  vibes.value = [];
});
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
  status.value = `读取到 ${vibes.value.length} 张参考图，请选择后添加`;
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
</script>
<style scoped lang="scss" src="../settings/image-settings.scss"></style>

<style scoped lang="scss">
#wave-phone-script-root .character-image-settings {
  gap: 0;
  padding: 22px 20px;
  .image-subsection {
    display: grid;
    gap: 18px;
    min-width: 0;
  }
  .image-subsection + .image-subsection {
    margin-top: 22px;
    padding-top: 22px;
    border-top: 1px solid #8882;
  }
  .image-import-row {
    align-items: end;
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .image-import-row > button {
    margin: 0;
    align-self: end;
    min-height: 42px;
  }
  .image-status {
    margin-top: 16px;
  }
}
</style>
