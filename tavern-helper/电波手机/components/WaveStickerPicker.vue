<template>
  <section ref="pickerElement" class="wave-sticker-picker">
    <nav class="sticker-tabs" aria-label="表情分类">
      <button type="button" aria-label="收起表情面板" @click="$emit('close')">
        <i class="fa-solid fa-chevron-down"></i>
      </button>
      <button
        type="button"
        aria-label="搜索表情包"
        :class="{ active: activeTab === 'search' }"
        @click="activeTab = 'search'"
      >
        <i class="fa-solid fa-magnifying-glass"></i>
      </button>
      <button type="button" :class="{ active: activeTab === 'emoji' }" @click="activeTab = 'emoji'">Emoji</button>
      <button type="button" :class="{ active: activeTab === 'favorite' }" @click="activeTab = 'favorite'">
        <i class="fa-solid fa-star"></i> 收藏
      </button>
      <button
        v-for="category in library.categories"
        :key="category.id"
        type="button"
        :class="{ active: activeTab === category.id }"
        @click="activeTab = category.id"
      >
        {{ category.name }}
      </button>
    </nav>

    <label v-if="activeTab === 'search'" class="sticker-search"
      ><i class="fa-solid fa-magnifying-glass"></i
      ><input v-model="query" aria-label="搜索表情包" placeholder="搜索表情名称…" /><button
        v-if="query"
        type="button"
        aria-label="清空搜索"
        @click="query = ''"
      >
        ×
      </button></label
    >
    <nav v-if="activeTab === 'emoji'" class="sticker-tabs emoji-categories" aria-label="Emoji 分类">
      <button
        v-for="category in emojiCategories"
        :key="category.id"
        type="button"
        :class="{ active: emojiCategory === category.id }"
        @click="emojiCategory = category.id"
      >
        {{ category.label }}
      </button>
    </nav>
    <div :key="activeTab === 'emoji' ? emojiCategory : activeTab" class="sticker-scroll">
      <div v-if="activeTab === 'emoji'" class="native-emoji-grid">
        <button v-for="emoji in nativeEmoji" :key="emoji" type="button" @click="$emit('send-emoji', emoji)">
          {{ emoji }}
        </button>
      </div>

      <template v-else>
        <div v-if="showCategoryForm" class="sticker-inline-form">
          <input v-model.trim="categoryName" type="text" maxlength="24" placeholder="新分类名称" />
          <button type="button" @click="createCategory">新建</button>
          <template v-if="currentCategory">
            <input v-model.trim="renameCategoryValue" type="text" maxlength="24" placeholder="修改当前分类名" />
            <button type="button" @click="renameCategory">改名</button>
          </template>
        </div>

        <div v-if="manageMode && selectedIds.size" class="sticker-selection-bar">
          <span>已选 {{ selectedIds.size }} 个</span>
          <button type="button" @click="toggleSelectedFavorite"><i class="fa-solid fa-star"></i>收藏</button>
          <button v-if="selectedIds.size === 1" type="button" @click="beginRenameSelected">
            <i class="fa-solid fa-pen"></i>改名
          </button>
          <button class="danger" type="button" @click="deleteSelected">
            <i class="fa-solid fa-trash-can"></i>删除
          </button>
        </div>
        <div v-if="manageMode && selectedIds.size" class="sticker-scope-row selected-scope-row">
          <span>设为</span>
          <button
            v-for="option in scopeOptions"
            :key="option.value"
            type="button"
            @click="setSelectedScope(option.value)"
          >
            {{ option.label }}
          </button>
        </div>

        <div v-if="renamingId" class="sticker-inline-form rename-sticker-form">
          <input v-model.trim="renameStickerValue" type="text" maxlength="40" placeholder="表情包名称" />
          <button type="button" @click="applyStickerRename">保存名称</button>
        </div>

        <div class="sticker-grid">
          <button type="button" class="sticker-add" aria-label="添加表情包" @click="showImporter = !showImporter">
            <i class="fa-solid fa-plus"></i>
          </button>
          <button
            v-for="sticker in visibleStickers"
            :key="sticker.id"
            type="button"
            :class="{ selected: selectedIds.has(sticker.id) }"
            @click="handleSticker(sticker)"
            @contextmenu.prevent="toggleFavorite(sticker.id)"
          >
            <span class="sticker-image-frame">
              <img :src="sticker.url" :alt="sticker.name" loading="lazy" />
              <i v-if="sticker.favorite" class="fa-solid fa-star"></i>
              <b v-if="selectedIds.has(sticker.id)"><i class="fa-solid fa-check"></i></b>
            </span>
            <small>{{ sticker.name }}</small>
            <em>{{ scopeLabel(sticker.scope) }}</em>
          </button>
        </div>
        <p v-if="!visibleStickers.length" class="sticker-empty">
          {{ activeTab === 'search' ? '没有找到匹配的表情包' : '暂无表情包，点击 + 添加' }}
        </p>
      </template>
    </div>
    <div class="sticker-tools">
      <button type="button" :class="{ active: manageMode }" @click="toggleManage">
        <i class="fa-solid fa-layer-group"></i>{{ manageMode ? '退出管理' : '管理' }}
      </button>
      <button type="button" @click="showImporter = !showImporter"><i class="fa-solid fa-box-open"></i>导入</button>
      <button type="button" @click="exportVisible"><i class="fa-solid fa-file-export"></i>导出</button>
      <button type="button" @click="showCategoryForm = !showCategoryForm">
        <i class="fa-solid fa-folder-plus"></i>分类
      </button>
    </div>

    <Teleport v-if="modalTarget && showImporter" :to="modalTarget">
      <div class="sticker-modal-backdrop" @click.self="showImporter = false">
        <section
          ref="dialogElement"
          class="sticker-add-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="添加表情包"
          @keydown.esc.stop="showImporter = false"
          @keydown.tab="trapDialogFocus"
        >
          <header>
            <div><small>STICKER LIBRARY</small><strong>添加表情包</strong></div>
            <button type="button" aria-label="关闭添加窗口" @click="showImporter = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </header>
          <div class="sticker-importer">
            <label
              ><span>保存到分类</span
              ><WaveSelect v-model="importCategory" :options="categoryOptions" aria-label="导入分类"
            /></label>
            <div class="sticker-single-add">
              <input
                v-model.trim="singleName"
                type="text"
                maxlength="40"
                aria-label="表情名称"
                placeholder="表情名称"
              />
              <input v-model.trim="singleUrl" type="url" aria-label="表情图链" placeholder="https://…" />
              <button type="button" @click="addSingle"><i class="fa-solid fa-plus"></i>添加</button>
            </div>
            <label>
              <span>批量图链（名称：URL，每行一个）</span>
              <textarea v-model="batchText" rows="5" placeholder="开心：https://example.com/sticker.gif"></textarea>
            </label>
            <div class="sticker-scope-row">
              <span>使用范围</span>
              <button
                v-for="option in scopeOptions"
                :key="option.value"
                type="button"
                :class="{ active: importScope === option.value }"
                @click="importScope = option.value"
              >
                {{ option.label }}
              </button>
            </div>
            <div class="sticker-import-actions">
              <button type="button" @click="importLinks"><i class="fa-solid fa-link"></i>解析图链</button>
              <button type="button" @click="fileInput?.click()"><i class="fa-solid fa-upload"></i>选择文件</button>
              <input ref="fileInput" type="file" accept="image/*" multiple @change="importFiles" />
            </div>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import emojiData from '@emoji-mart/data/sets/15/native.json';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import WaveSelect from './WaveSelect.vue';
import type { StickerItem, StickerLibrary, StickerScope } from '../schemas';

const props = defineProps<{ library: StickerLibrary; activeCharKey: string }>();
const emit = defineEmits<{
  'update:library': [value: StickerLibrary];
  'send-emoji': [emoji: string];
  'send-sticker': [value: { name: string; url: string }];
  notify: [message: string];
  close: [];
}>();

const emojiLabels: Record<string, string> = {
  people: '表情与人物',
  nature: '动物与自然',
  foods: '食物与饮料',
  activity: '活动',
  places: '旅行与地点',
  objects: '物品',
  symbols: '符号',
  flags: '旗帜',
};
const emojiCategories = emojiData.categories.map(category => ({
  ...category,
  label: emojiLabels[category.id] || category.id,
}));
const emojiCategory = ref('people');
const nativeEmoji = computed(() =>
  (emojiCategories.find(category => category.id === emojiCategory.value)?.emojis || []).map(
    id => emojiData.emojis[id].skins[0].native,
  ),
);
const activeTab = ref('emoji');
const query = ref('');
const manageMode = ref(false);
const selectedIds = ref(new Set<string>());
const showImporter = ref(false);
const pickerElement = ref<HTMLElement | null>(null);
const dialogElement = ref<HTMLElement | null>(null);
const modalTarget = ref<HTMLElement | null>(null);
const importCategory = ref('');
const categoryOptions = computed(() =>
  props.library.categories.length
    ? props.library.categories.map(category => ({ value: category.id, label: category.name }))
    : [{ value: 'my-stickers', label: '我的表情' }],
);
onMounted(() => {
  modalTarget.value = pickerElement.value?.closest<HTMLElement>('.wave-device') || null;
});
watch(showImporter, async open => {
  if (open) {
    importCategory.value = currentCategory.value?.id || props.library.categories[0]?.id || 'my-stickers';
    await nextTick();
    dialogElement.value?.querySelector<HTMLInputElement>('input')?.focus();
  } else pickerElement.value?.querySelector<HTMLButtonElement>('.sticker-add')?.focus();
});
function trapDialogFocus(event: KeyboardEvent): void {
  const items = [
    ...(dialogElement.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not([type="file"]), textarea, [tabindex="0"]',
    ) || []),
  ];
  const first = items[0],
    last = items[items.length - 1];
  const current = dialogElement.value?.ownerDocument.activeElement;
  if (event.shiftKey && current === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && current === last) {
    event.preventDefault();
    first?.focus();
  }
}
const showCategoryForm = ref(false);
const categoryName = ref('');
const renameCategoryValue = ref('');
const batchText = ref('');
const singleName = ref('');
const singleUrl = ref('');
const importScope = ref<StickerScope>('global');
const fileInput = ref<HTMLInputElement | null>(null);
const renamingId = ref('');
const renameStickerValue = ref('');

const scopeOptions: Array<{ value: StickerScope; label: string }> = [
  { value: 'global', label: '全局' },
  { value: 'user', label: 'User 专属' },
  { value: 'char', label: '当前 Char' },
];
const currentCategory = computed(() => props.library.categories.find(category => category.id === activeTab.value));
const visibleStickers = computed(() => {
  const scoped = props.library.stickers.filter(
    sticker => sticker.scope !== 'char' || !sticker.charKey || sticker.charKey === props.activeCharKey,
  );
  if (activeTab.value === 'search')
    return scoped.filter(sticker => sticker.name.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()));
  if (activeTab.value === 'favorite') return scoped.filter(sticker => sticker.favorite);
  return scoped.filter(sticker => sticker.categoryId === activeTab.value);
});

watch(
  () => props.library.categories,
  categories => {
    if (
      activeTab.value !== 'emoji' &&
      activeTab.value !== 'search' &&
      activeTab.value !== 'favorite' &&
      !categories.some(c => c.id === activeTab.value)
    ) {
      activeTab.value = categories[0]?.id || 'emoji';
    }
  },
  { deep: true },
);
watch([showImporter, showCategoryForm, manageMode], values => {
  if (values.some(Boolean) && activeTab.value === 'emoji')
    activeTab.value = props.library.categories[0]?.id || 'favorite';
});
watch(activeTab, tab => {
  renameCategoryValue.value = props.library.categories.find(category => category.id === tab)?.name || '';
});

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
function updateLibrary(patch: Partial<StickerLibrary>): void {
  emit('update:library', {
    categories: patch.categories || props.library.categories.map(category => ({ ...category })),
    stickers: patch.stickers || props.library.stickers.map(sticker => ({ ...sticker })),
  });
}
function scopeLabel(scope: StickerScope): string {
  return { global: '全局', user: 'USER', char: 'CHAR' }[scope];
}
function toggleManage(): void {
  manageMode.value = !manageMode.value;
  selectedIds.value.clear();
  renamingId.value = '';
}
function handleSticker(sticker: StickerItem): void {
  if (manageMode.value) {
    if (selectedIds.value.has(sticker.id)) selectedIds.value.delete(sticker.id);
    else selectedIds.value.add(sticker.id);
    return;
  }
  emit('send-sticker', { name: sticker.name, url: sticker.url });
}
function toggleFavorite(id: string): void {
  updateLibrary({
    stickers: props.library.stickers.map(sticker =>
      sticker.id === id ? { ...sticker, favorite: !sticker.favorite } : { ...sticker },
    ),
  });
}
function toggleSelectedFavorite(): void {
  updateLibrary({
    stickers: props.library.stickers.map(sticker =>
      selectedIds.value.has(sticker.id) ? { ...sticker, favorite: true } : { ...sticker },
    ),
  });
  emit('notify', '已收藏所选表情包');
}
function deleteSelected(): void {
  updateLibrary({ stickers: props.library.stickers.filter(sticker => !selectedIds.value.has(sticker.id)) });
  selectedIds.value.clear();
  emit('notify', '已删除所选表情包');
}
function setSelectedScope(scope: StickerScope): void {
  updateLibrary({
    stickers: props.library.stickers.map(sticker =>
      selectedIds.value.has(sticker.id)
        ? { ...sticker, scope, charKey: scope === 'char' ? props.activeCharKey : '' }
        : { ...sticker },
    ),
  });
  emit('notify', `已设置为${scopeLabel(scope)}专属`);
}
function beginRenameSelected(): void {
  const id = [...selectedIds.value][0];
  const sticker = props.library.stickers.find(item => item.id === id);
  if (!sticker) return;
  renamingId.value = id;
  renameStickerValue.value = sticker.name;
}
function applyStickerRename(): void {
  if (!renamingId.value || !renameStickerValue.value) return;
  updateLibrary({
    stickers: props.library.stickers.map(sticker =>
      sticker.id === renamingId.value ? { ...sticker, name: renameStickerValue.value } : { ...sticker },
    ),
  });
  renamingId.value = '';
  emit('notify', '表情包已改名');
}
function createCategory(): void {
  if (!categoryName.value) return;
  const category = { id: makeId('category'), name: categoryName.value };
  updateLibrary({ categories: [...props.library.categories.map(item => ({ ...item })), category] });
  activeTab.value = category.id;
  categoryName.value = '';
  renameCategoryValue.value = category.name;
}
function renameCategory(): void {
  if (!currentCategory.value || !renameCategoryValue.value) return;
  updateLibrary({
    categories: props.library.categories.map(category =>
      category.id === currentCategory.value?.id ? { ...category, name: renameCategoryValue.value } : { ...category },
    ),
  });
  emit('notify', '分类名称已更新');
}
function targetCategoryId(): string {
  if (props.library.categories.some(category => category.id === importCategory.value)) return importCategory.value;
  if (currentCategory.value) return currentCategory.value.id;
  const fallback = props.library.categories[0];
  return fallback?.id || 'my-stickers';
}
function addImported(entries: Array<{ name: string; url: string }>): void {
  if (!entries.length) {
    emit('notify', '没有解析到可导入的表情包');
    return;
  }
  const categoryId = targetCategoryId();
  const existingUrls = new Set(props.library.stickers.map(sticker => sticker.url));
  const createdAt = new Date().toISOString();
  const additions: StickerItem[] = entries
    .filter(entry => entry.url && !existingUrls.has(entry.url))
    .map(entry => ({
      id: makeId('sticker'),
      name: entry.name || '未命名表情',
      url: entry.url,
      categoryId,
      scope: importScope.value,
      charKey: importScope.value === 'char' ? props.activeCharKey : '',
      favorite: false,
      createdAt,
    }));
  const categories = props.library.categories.some(category => category.id === categoryId)
    ? props.library.categories.map(category => ({ ...category }))
    : [...props.library.categories.map(category => ({ ...category })), { id: categoryId, name: '我的表情' }];
  updateLibrary({ categories, stickers: [...props.library.stickers.map(sticker => ({ ...sticker })), ...additions] });
  if (additions.length) showImporter.value = false;
  activeTab.value = categoryId;
  batchText.value = '';
  emit('notify', `已导入 ${additions.length} 个表情包`);
}
function importLinks(): void {
  const entries = batchText.value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const url = (line.match(/https?:\/\/\S+/i)?.[0] || '').replace(/[】）)]+$/, '').replace(/\]+$/, '');
      const name = line
        .replace(/[：:]?\s*[[【（(]?https?:\/\/.*$/i, '')
        .replace(/^[-*]\s*/, '')
        .trim();
      return { name: name || `表情 ${index + 1}`, url };
    })
    .filter(entry => /^https?:\/\//i.test(entry.url));
  addImported(entries);
}
function addSingle(): void {
  if (!singleName.value || !/^https?:\/\//i.test(singleUrl.value)) {
    emit('notify', '请填写名称与有效的 http/https 图链');
    return;
  }
  addImported([{ name: singleName.value, url: singleUrl.value }]);
  singleName.value = '';
  singleUrl.value = '';
}
async function importFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files || [])].filter(file => file.type.startsWith('image/'));
  const entries = await Promise.all(
    files.map(
      file =>
        new Promise<{ name: string; url: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener('load', () =>
            resolve({ name: file.name.replace(/\.[^.]+$/, ''), url: String(reader.result || '') }),
          );
          reader.addEventListener('error', () => reject(reader.error));
          reader.readAsDataURL(file);
        }),
    ),
  );
  addImported(entries);
  input.value = '';
}
async function exportVisible(): Promise<void> {
  const text = visibleStickers.value.map(sticker => `${sticker.name}：[${sticker.url}]`).join('\n');
  if (!text) {
    emit('notify', '当前分类没有可导出的表情包');
    return;
  }
  const blobUrl = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `${currentCategory.value?.name || '收藏表情包'}.txt`;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
  try {
    await navigator.clipboard.writeText(text);
    emit('notify', '已导出 TXT，并复制“名称：[图链]”文本');
  } catch {
    emit('notify', '已导出 TXT；浏览器未允许复制文本');
  }
}
</script>
