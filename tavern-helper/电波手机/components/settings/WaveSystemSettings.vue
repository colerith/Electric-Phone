<template>
  <div class="system-settings">
    <template v-if="section === 'basic'">
      <section class="settings-card system-settings-card">
        <div class="wave-settings-title">更新提醒</div>
        <div class="system-toggle-row">
          <span>有更新会自动弹出手机</span
          ><WaveToggle v-model="phone.settings.basic.autoOpenOnUpdate" aria-label="有更新会自动弹出手机" />
        </div>
        <p>正文同步或独立生成捕捉到新的消息、状态及其他 App 内容时，自动打开手机。</p>
      </section>
      <section class="settings-card system-settings-card">
        <div class="wave-settings-title">自动隐藏</div>
        <p>独立 API 请求保留的历史 AI 楼层数。留空保留全部；0 仅保留最新 AI 回合及用户消息，不修改酒馆楼层。</p>
        <label
          >保留历史楼层数<input
            :value="phone.settings.basic.historyDepth ?? ''"
            type="number"
            min="0"
            step="1"
            placeholder="全部历史"
            @input="setDepth"
        /></label>
        <p>主 API / 追加模式的正文与世界书由酒馆自身控制。</p>
      </section>
      <section class="settings-card system-settings-card">
        <div class="wave-settings-title">本地缓存</div>
        <div class="system-toggle-row">
          <span>缓存正文解析结果</span
          ><WaveToggle v-model="phone.settings.basic.cacheEnabled" aria-label="缓存正文解析结果" />
        </div>
        <p>按角色卡、聊天隔离；超过容量时清理最旧解析缓存。聊天消息、收藏和设置仍保存在酒馆变量中。</p>
        <label
          >每张角色卡缓存上限（MB）<input
            v-model.number="phone.settings.basic.cacheLimitMb"
            type="number"
            min="1"
            max="512"
        /></label>
        <p>{{ cacheSummary }}</p>
        <div class="system-button-row">
          <button class="system-action" type="button" @click="clearCache('chat')">清理当前聊天缓存</button
          ><button class="system-action" type="button" @click="clearCache('all')">清理全部解析缓存</button
          ><button class="system-action" type="button" @click="refreshCache">刷新占用</button>
        </div>
        <p v-if="diagnostics.cacheError">缓存不可用：{{ diagnostics.cacheError }}。仍可直接解析正文。</p>
      </section>
      <section class="settings-card system-settings-card">
        <div class="wave-settings-title">排除角色卡</div>
        <p>选中的角色卡停止手机数据同步和生成；设置入口保持可用。</p>
        <WaveMultiSelect
          v-model="phone.settings.basic.excludedCards"
          :options="characterNames"
          aria-label="搜索角色卡"
        />
        <p>已排除 {{ phone.settings.basic.excludedCards.length }} 张角色卡</p>
      </section>
      <section class="settings-card system-settings-card">
        <div class="wave-settings-title">排除标签</div>
        <button class="system-action" type="button" @click="addDefaultTags">导入内置标签</button>
        <p>填写标签名（如 style）；生成时排除该标签及包裹内容。原聊天数据不变。</p>
        <form class="system-button-row" @submit.prevent="addTag">
          <input v-model="newTag" placeholder="标签名" aria-label="排除标签名" /><button
            class="system-action"
            type="submit"
          >
            添加
          </button>
        </form>
        <div class="system-button-row">
          <button
            v-for="tag in phone.settings.basic.excludedTags"
            :key="tag"
            class="system-chip"
            type="button"
            :aria-label="`移除排除标签 ${tag}`"
            @click="
              phone.settings.basic.excludedTags = phone.settings.basic.excludedTags.filter(value => value !== tag)
            "
          >
            {{ tag }} ×
          </button>
        </div>
      </section>
    </template>
    <template v-else-if="section === 'worldbooks'">
      <section class="settings-card system-settings-card">
        <div class="wave-settings-title">世界书读取</div>
        <div class="system-toggle-row">
          <span>启用手机独立读取规则</span
          ><WaveToggle v-model="phone.settings.worldbooks.managed" aria-label="启用手机世界书读取规则" />
        </div>
        <p>
          关闭时跟随酒馆原生激活；开启后，独立 API
          仅使用当前角色卡绑定的主世界书与附加世界书中的启用蓝灯、正文关键词命中绿灯以及手动纳入条目。这里的调整只作用于手机，不改原世界书。
        </p>
        <p>独立读取不模拟酒馆递归、概率、向量检索与冷却规则；需要这些规则时请保持关闭。</p>
        <button class="system-action" type="button" :disabled="busy" @click="loadBooks">刷新角色卡绑定世界书</button>
        <label
          >角色卡绑定世界书<WaveSelect
            v-model="selectedBook"
            :options="bookNames.map(name => ({ value: name, label: name }))"
            aria-label="查看世界书"
        /></label>
        <p v-if="!bookNames.length && !busy">当前角色卡没有绑定世界书。</p>
        <template v-if="selectedBook">
          <p>
            当前角色卡已绑定 ·
            {{ entries.length }} 条 · {{ entries.reduce((sum, entry) => sum + entry.content.length, 0) }} 字
          </p>
          <label
            >整本读取规则<WaveSelect
              :model-value="phone.settings.worldbooks.books[selectedBook] || 'native'"
              :options="modeOptions"
              aria-label="整本读取规则"
              @update:model-value="value => setBookMode(value)"
          /></label>
          <input v-model="entrySearch" placeholder="搜索条目名称或正文" aria-label="搜索世界书条目" />
        </template>
      </section>
      <section v-for="entry in filteredEntries" :key="entry.uid" class="settings-card system-settings-card">
        <div class="wave-settings-title">{{ entry.name || `条目 ${entry.uid}` }}</div>
        <p>
          {{ entry.enabled ? '启用' : '停用' }} ·
          {{ entry.strategy.type === 'constant' ? '蓝灯' : entry.strategy.type === 'selective' ? '绿灯' : '向量' }} ·
          {{ entry.content.length }} 字
        </p>
        <WaveSelect
          :model-value="phone.settings.worldbooks.entries[managedEntryKey(selectedBook, entry.uid)] || 'native'"
          :options="modeOptions"
          :aria-label="`${entry.name}读取规则`"
          @update:model-value="value => setEntryMode(entry.uid, value)"
        />
        <details>
          <summary>查看条目正文</summary>
          <pre>{{ entry.content }}</pre>
        </details>
      </section>
    </template>
    <template v-else>
      <section class="settings-card system-settings-card">
        <div class="wave-settings-title">监听与同步</div>
        <p>{{ phone.isReady ? '已就绪' : '等待初始化' }} · {{ phone.syncError || '无同步错误' }}</p>
        <p>
          角色：{{ phone.context?.cardName || '未选择' }}<br />聊天：{{ phone.context?.chatKey || '未选择' }}<br />实际
          Char：{{ phone.identities.length }} · 手机消息：{{
            Object.values(phone.state.threads).reduce((sum, thread) => sum + thread.messages.length, 0)
          }}
        </p>
        <button class="system-action" type="button" :disabled="busy" @click="resync">重新同步正文</button>
      </section>
      <section class="settings-card system-settings-card">
        <div class="wave-settings-title">请求提示词</div>
        <div class="system-toggle-row">
          <span>记录请求和回复</span><WaveToggle v-model="phone.settings.debugEnabled" aria-label="记录请求和回复" />
        </div>
        <p>仅保留本次运行的提示词与回复，不包含 API 密钥。内置提示词名称由酒馆在请求时展开。</p>
        <div class="system-button-row">
          <button class="system-action" type="button" :disabled="busy" @click="previewPrompt">预览当前上下文</button
          ><button
            class="system-action"
            type="button"
            @click="
              diagnostics.prompt = '';
              diagnostics.response = '';
            "
          >
            清空预览
          </button>
        </div>
        <small>{{ diagnostics.requestTime }}</small>
        <pre v-if="diagnostics.prompt">{{ diagnostics.prompt }}</pre>
        <p v-else>暂无请求记录</p>
        <details v-if="diagnostics.response">
          <summary>最近一次原始回复</summary>
          <pre>{{ diagnostics.response }}</pre>
        </details>
      </section>
      <section class="settings-card system-settings-card">
        <div class="wave-settings-title">运行日志</div>
        <button class="system-action" type="button" @click="diagnostics.logs.splice(0)">清空日志</button>
        <p v-if="!diagnostics.logs.length">暂无日志</p>
        <p v-for="(log, index) in diagnostics.logs" :key="index">
          {{ log.time }} · {{ log.event }}<br />{{ log.detail }}
        </p>
      </section>
    </template>
    <p v-if="notice" role="status">{{ notice }}</p>
    <button class="settings-save-wide" type="button" @click="save">
      保存{{ section === 'basic' ? '基础设置' : section === 'worldbooks' ? '世界书规则' : '调试设置' }}
    </button>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { cacheStats, clearParseCache } from '../../services/core/local-cache';
import { diagnostics } from '../../services/core/diagnostics';
import { boundWorldbooks, managedEntryKey } from '../../services/generation/context-controls';
import { previewPhoneRequest } from '../../services/generation/generation';
import WaveToggle from '../shared/WaveToggle.vue';
import WaveSelect from '../shared/WaveSelect.vue';
import WaveMultiSelect from '../shared/WaveMultiSelect.vue';
const props = defineProps<{ section: 'basic' | 'worldbooks' | 'debug' }>();
const phone = usePhoneStore();
const notice = ref(''),
  cacheSummary = ref(''),
  newTag = ref('');
const busy = ref(false),
  bookNames = ref<string[]>([]),
  selectedBook = ref(''),
  entrySearch = ref(''),
  entries = ref<WorldbookEntry[]>([]);
const modeOptions = [
  { value: 'native', label: '跟随默认' },
  { value: 'include', label: '纳入' },
  { value: 'exclude', label: '排除' },
];
const characterNames = computed(() => [
  ...new Set([...SillyTavern.characters.map(card => card.name), ...phone.settings.basic.excludedCards]),
]);
const filteredEntries = computed(() =>
  entries.value.filter(entry =>
    `${entry.name} ${entry.content}`.toLowerCase().includes(entrySearch.value.toLowerCase()),
  ),
);
async function run(action: () => Promise<void>) {
  busy.value = true;
  notice.value = '';
  try {
    await action();
  } catch (error) {
    notice.value = String(error);
  } finally {
    busy.value = false;
  }
}
function setDepth(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  phone.settings.basic.historyDepth = value === '' ? null : Math.max(0, Math.floor(Number(value) || 0));
}
function addDefaultTags() {
  phone.settings.basic.excludedTags = [
    ...new Set([
      ...phone.settings.basic.excludedTags,
      'echo',
      'ta的手机',
      'gossip',
      'danmu',
      '幕后故事',
      '日月来信',
      'branches',
      'horae',
      'snow',
    ]),
  ];
}
function addTag() {
  const tag = newTag.value
    .trim()
    .replace(/^<\/?|\/?>$/g, '')
    .toLowerCase();
  if (!tag || !/^[\p{L}\p{N}_:-]+$/u.test(tag)) {
    notice.value = '请只填写标签名，不含属性和空格';
    return;
  }
  if (!phone.settings.basic.excludedTags.includes(tag)) phone.settings.basic.excludedTags.push(tag);
  newTag.value = '';
}
async function refreshCache() {
  await run(async () => {
    const data = await cacheStats(phone.context?.cardKey);
    cacheSummary.value = `当前角色：${data.count} 个聊天缓存 · ${(data.bytes / 1024 / 1024).toFixed(2)} MB`;
  });
}
async function clearCache(scope: 'chat' | 'all') {
  await run(async () => {
    if (scope === 'chat' && !phone.context) throw Error('请先选择聊天');
    await clearParseCache(
      scope === 'chat' ? phone.context!.cardKey : undefined,
      scope === 'chat' ? phone.context!.chatKey : undefined,
    );
    const data = await cacheStats(phone.context?.cardKey);
    cacheSummary.value = `当前角色：${data.count} 个聊天缓存 · ${(data.bytes / 1024 / 1024).toFixed(2)} MB`;
    notice.value = '解析缓存已清理';
  });
}
async function loadBooks() {
  await run(async () => {
    ++bookToken;
    entries.value = [];
    bookNames.value = boundWorldbooks();
    const name = bookNames.value.includes(selectedBook.value) ? selectedBook.value : bookNames.value[0] || '';
    if (selectedBook.value !== name) selectedBook.value = name;
    else await readBook(name);
  });
}
function setBookMode(value: string) {
  if (value === 'include' || value === 'exclude') phone.settings.worldbooks.books[selectedBook.value] = value;
  else delete phone.settings.worldbooks.books[selectedBook.value];
}
function setEntryMode(uid: number, value: string) {
  const key = managedEntryKey(selectedBook.value, uid);
  if (value === 'include' || value === 'exclude') phone.settings.worldbooks.entries[key] = value;
  else delete phone.settings.worldbooks.entries[key];
}
async function resync() {
  await run(async () => {
    await phone.synchronize();
    notice.value = phone.syncError || '同步完成';
  });
}
async function previewPrompt() {
  await run(async () => {
    if (!phone.context || !phone.activeIdentity || !phone.activeThread) throw Error('请先打开有实际 Char 的聊天');
    diagnostics.prompt = JSON.stringify(
      await previewPhoneRequest({
        settings: phone.settings,
        ...phone.context,
        identity: phone.activeIdentity,
        thread: phone.activeThread,
        appSnapshot: phone.activeSnapshot,
        latestUserText: phone.activeThread.draft,
      }),
      null,
      2,
    );
    diagnostics.requestTime = '当前请求预览 · ' + new Date().toLocaleTimeString();
  });
}
function save() {
  try {
    phone.saveSettings();
    notice.value = '已保存';
    if (props.section === 'basic') void phone.synchronize();
  } catch (error) {
    notice.value = String(error);
  }
}
let bookToken = 0;
async function readBook(name: string) {
  const token = ++bookToken;
  entries.value = [];
  try {
    const result = name ? await getWorldbook(name) : [];
    if (token === bookToken) entries.value = result;
  } catch (error) {
    if (token === bookToken) notice.value = String(error);
  }
}
watch(selectedBook, readBook);
watch(
  () => phone.context?.cardKey,
  () => {
    if (props.section === 'worldbooks') void loadBooks();
  },
);
onMounted(() => {
  if (props.section === 'basic') void refreshCache();
  if (props.section === 'worldbooks') void loadBooks();
});
</script>
