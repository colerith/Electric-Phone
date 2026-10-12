<template>
  <div class="wave-mcp-settings">
    <section class="settings-card">
      <div class="wave-settings-title">链接卡片</div>
      <label class="mcp-switch"
        ><strong>自动解析网页预览</strong><input v-model="config.preview" type="checkbox"
      /></label>
      <p class="api-note">
        聊天中的网址自动展示标题、摘要、封面与站点。网页地址会发送给酒馆后端读取；登录、反爬限制或无封面的网站保留基础卡片。
      </p>
    </section>
    <section class="settings-card">
      <div class="wave-settings-title">MCP 服务</div>
      <p class="api-note">
        需要 beta 版电波手机后端插件。支持公网 Streamable HTTP 服务；不运行本地命令，不支持旧 SSE 地址或 OAuth
        登录流程。配置与密钥仅保存在当前浏览器，不随聊天备份上传。
      </p>
      <div class="mcp-templates">
        <button v-for="template in mcpTemplates" :key="template.name" type="button" @click="add(template)">
          <i class="fa-solid fa-plus"></i> {{ template.name }}
        </button>
      </div>
      <label v-if="config.servers.length"
        ><strong>当前服务</strong
        ><WaveSelect v-model="selectedId" :options="config.servers.map(s => ({ value: s.id, label: s.name }))"
      /></label>
      <template v-if="server">
        <label class="mcp-switch"><strong>启用服务</strong><input v-model="server.enabled" type="checkbox" /></label>
        <label><strong>名称</strong><input v-model="server.name" /></label>
        <label
          ><strong>MCP 地址</strong><input v-model.trim="server.url" type="url" placeholder="https://…/mcp"
        /></label>
        <label
          ><strong>API Key（Bearer，可选）</strong
          ><input v-model="server.apiKey" type="password" autocomplete="off" placeholder="自行填写服务商密钥"
        /></label>
        <details>
          <summary>自定义认证请求头</summary>
          <textarea v-model="server.headers" rows="3" spellcheck="false" /><small
            >JSON 对象；支持 Authorization、x-api-key、api-key、DEFAULT_PARAMETERS。已填写 API Key 时优先使用
            Bearer。</small
          >
        </details>
        <div class="mcp-actions">
          <button type="button" :disabled="busy || !server.enabled" @click="discover">
            {{ busy ? '请求中…' : '连接并获取工具' }}</button
          ><button type="button" class="mcp-delete" @click="remove">删除此服务</button>
        </div>
      </template>
      <p v-else class="api-note">选择上方模板即可添加，API Key 可稍后补充。</p>
      <p v-if="feedback" class="api-note" role="status">{{ feedback }}</p>
      <p v-if="saveError" class="api-note" role="alert">{{ saveError }}</p>
    </section>
    <section v-if="server && tools.length" class="settings-card">
      <div class="wave-settings-title">手动调用</div>
      <label
        ><strong>工具</strong
        ><WaveSelect v-model="toolName" :options="tools.map(t => ({ value: t.name, label: t.name }))"
      /></label>
      <p class="api-note">{{ tool?.description }}</p>
      <details>
        <summary>查看参数格式</summary>
        <pre>{{ JSON.stringify(tool?.inputSchema || {}, null, 2) }}</pre>
      </details>
      <label><strong>调用参数（JSON）</strong><textarea v-model="argumentsText" rows="5" spellcheck="false" /></label>
      <div class="mcp-actions">
        <button type="button" :disabled="busy" @click="run">运行工具</button
        ><button v-if="retrievalTool" type="button" @click="useSearch">用于聊天自动检索</button>
      </div>
      <p class="api-note">调用内容会发送给所选服务。手动结果仅显示在这里，不会自动写入聊天。</p>
      <pre v-if="result" class="mcp-result">{{ result }}</pre>
      <button v-if="result" type="button" @click="copyResult">复制结果</button>
    </section>
    <section class="settings-card">
      <div class="wave-settings-title">聊天前自动检索</div>
      <label class="mcp-switch"
        ><strong>生成回复前检索资料</strong><input v-model="config.autoSearch" type="checkbox"
      /></label>
      <p class="api-note">
        默认关闭。开启后，将本轮用户消息（最多 2000
        字）发送给指定工具；返回资料供角色回复参考。失败时继续原本聊天，排除的角色卡不会触发检索。
      </p>
      <p class="api-note">当前：{{ searchLabel }}</p>
      <label
        ><strong>自动检索参数</strong><textarea v-model="config.searchArguments" rows="4" spellcheck="false" /><small
          v-pre
          >将检索内容字段设为 "{{ query }}"，其余参数按工具格式填写。</small
        ></label
      >
      <p v-if="webToolsStatus.lastSearch" class="api-note" role="status">{{ webToolsStatus.lastSearch }}</p>
    </section>
    <section class="settings-card">
      <div class="wave-settings-title">模板说明</div>
      <p v-for="template in mcpTemplates.filter(t => t.docs)" :key="template.name" class="api-note">
        <a :href="template.docs" target="_blank" rel="noopener noreferrer">{{ template.name }} ↗</a> ·
        {{ template.note }}
      </p>
    </section>
  </div>
</template>
<script setup lang="ts">
import { browserUuid } from '../../services/core/browser-crypto';

import { computed, onUnmounted, ref, watch } from 'vue';
import WaveSelect from '../shared/WaveSelect.vue';
import {
  webSettings as config,
  saveWebSettings,
  mcpTemplates,
  callMcp,
  toolArguments,
  webToolsStatus,
  type McpTool,
} from '../../services/web-tools';
const selectedId = ref(config.servers[0]?.id || ''),
  tools = ref<McpTool[]>([]),
  toolName = ref(''),
  argumentsText = ref('{}'),
  feedback = ref(''),
  saveError = ref(''),
  result = ref(''),
  busy = ref(false);
const server = computed(() => config.servers.find(s => s.id === selectedId.value));
const tool = computed(() => tools.value.find(t => t.name === toolName.value));
const retrievalTool = computed(() => /search|read|fetch|extract/i.test(toolName.value));
const searchLabel = computed(
  () =>
    `${config.servers.find(s => s.id === config.searchServer)?.name || '尚未选择服务'} / ${config.searchTool || '先连接并选择检索工具'}`,
);
let controller: AbortController | undefined,
  revision = 0;
watch(
  config,
  () => {
    try {
      saveWebSettings();
      saveError.value = '';
    } catch {
      saveError.value = '浏览器未能保存配置，请检查存储权限或空间';
    }
  },
  { deep: true, flush: 'sync' },
);
function reset() {
  revision++;
  controller?.abort();
  busy.value = false;
  tools.value = [];
  toolName.value = '';
  feedback.value = result.value = '';
}
watch(selectedId, reset, { flush: 'sync' });
watch(
  () => server.value && [server.value.url, server.value.apiKey, server.value.headers, server.value.enabled].join('\n'),
  reset,
);
watch(toolName, () => {
  revision++;
  controller?.abort();
  busy.value = false;
  result.value = '';
  const schema = tool.value?.inputSchema as
    | { properties?: Record<string, { type?: string }>; required?: string[] }
    | undefined;
  argumentsText.value = JSON.stringify(
    Object.fromEntries(
      (schema?.required || []).map(key => [
        key,
        schema?.properties?.[key]?.type === 'array' ? [] : schema?.properties?.[key]?.type === 'number' ? 1 : '',
      ]),
    ),
    null,
    2,
  );
});
function add(template: (typeof mcpTemplates)[number]) {
  const id = browserUuid();
  config.servers.push({ id, name: template.name, url: template.url, apiKey: '', headers: '{}', enabled: false });
  selectedId.value = id;
}
function remove() {
  const id = selectedId.value;
  config.servers = config.servers.filter(s => s.id !== id);
  if (config.searchServer === id) {
    config.searchServer = '';
    config.searchTool = '';
    config.autoSearch = false;
  }
  selectedId.value = config.servers[0]?.id || '';
}
async function request(operation: { method: string; name?: string; arguments?: Record<string, unknown> }) {
  if (!server.value) return;
  const token = ++revision;
  controller?.abort();
  controller = new AbortController();
  busy.value = true;
  feedback.value = '';
  try {
    const data = await callMcp({ ...server.value }, operation, controller.signal);
    if (token === revision) return data;
  } catch (error) {
    if (token === revision) feedback.value = error instanceof Error ? error.message : '请求失败';
  } finally {
    if (token === revision) busy.value = false;
  }
}
async function discover() {
  const data = await request({ method: 'tools/list' });
  if (data) {
    tools.value = data.tools || [];
    toolName.value = tools.value[0]?.name || '';
    feedback.value = `已连接，发现 ${tools.value.length} 个工具`;
  }
}
async function run() {
  try {
    const data = await request({
      method: 'tools/call',
      name: toolName.value,
      arguments: toolArguments(argumentsText.value, ''),
    });
    if (data) {
      result.value = JSON.stringify(data, null, 2);
      feedback.value = data.isError ? '工具返回错误，详情见结果' : '调用完成';
    }
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '参数格式错误';
  }
}
function useSearch() {
  if (!server.value || !retrievalTool.value) return;
  let argumentsValue: Record<string, unknown>;
  try {
    argumentsValue = toolArguments(argumentsText.value, '');
  } catch {
    feedback.value = '请先修正调用参数的 JSON 格式';
    return;
  }
  const properties = (tool.value?.inputSchema?.properties || {}) as Record<string, unknown>;
  const queryField = ['query', 'search_query', 'q', 'question', 'url', 'urls'].find(key => key in properties);
  if (queryField) argumentsValue[queryField] = queryField === 'urls' ? ['{{query}}'] : '{{query}}';
  config.searchServer = server.value.id;
  config.searchTool = toolName.value;
  config.searchArguments = JSON.stringify(argumentsValue, null, 2);
  feedback.value = '已选择。请检查自动检索参数中的 {{query}} 内容字段，再开启开关。';
}
async function copyResult() {
  try {
    await navigator.clipboard.writeText(result.value);
    feedback.value = '结果已复制';
  } catch {
    feedback.value = '复制失败，请手动选择结果复制';
  }
}
onUnmounted(reset);
</script>
<style scoped lang="scss">
.wave-mcp-settings {
  min-width: 0;
  display: grid;
  gap: 16px;
}
.mcp-templates,
.mcp-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
}
button {
  padding: 10px 14px;
  border: 1px solid var(--wave-line);
  border-radius: 12px;
  background: var(--wave-tint);
  color: var(--wave-ink);
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
}
.mcp-delete {
  margin-left: auto;
  color: #ce7e96;
  background: transparent;
}
label {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 14px 0;
}
label.mcp-switch {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  input {
    width: 20px;
    height: 20px;
  }
}
input,
textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--wave-line);
  border-radius: 12px;
  padding: 12px;
  background: var(--wave-card);
  color: var(--wave-ink);
}
textarea {
  resize: vertical;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 320px;
  overflow: auto;
  font-size: 12px;
}
small,
.api-note {
  color: var(--wave-muted);
  line-height: 1.65;
  overflow-wrap: anywhere;
}
details {
  margin: 12px 0;
}
summary {
  cursor: pointer;
}
a {
  color: var(--wave-accent);
}
</style>
