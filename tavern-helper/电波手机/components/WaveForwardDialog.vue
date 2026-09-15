<template>
  <Teleport v-if="surface" :to="surface">
    <div class="wave-forward-backdrop" @click.self="$emit('cancel')" @keydown.esc.stop.prevent="$emit('cancel')">
      <section
        ref="dialog"
        class="wave-forward-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="选择转发对象"
        tabindex="-1"
      >
        <header>
          <button type="button" aria-label="取消转发" @click="$emit('cancel')">取消</button>
          <strong>转发给</strong>
          <button type="button" class="forward-confirm" :disabled="!selected.length" @click="confirm">
            发送<span v-if="selected.length"> ({{ selected.length }})</span>
          </button>
        </header>

        <label class="wave-forward-search">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input v-model="query" type="search" placeholder="搜索联系人或群聊" aria-label="搜索转发对象" />
        </label>

        <div class="wave-forward-body">
          <div class="wave-forward-source">
            <small>分享内容</small>
            <strong>{{ title }}</strong>
            <p>{{ preview }}</p>
          </div>
          <div class="wave-forward-list" role="group" aria-label="可选的转发对象">
            <button
              v-for="identity in filtered"
              :key="identity.charKey"
              type="button"
              :aria-pressed="selected.includes(identity.charKey)"
              @click="toggle(identity.charKey)"
            >
              <i :class="selected.includes(identity.charKey) ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'"></i>
              <span class="wave-forward-avatar">
                <img v-if="identity.avatar" :src="identity.avatar" alt="" />
                <i v-else-if="identity.source === 'local_group'" class="fa-solid fa-user-group"></i>
                <b v-else>{{ displayIdentityName(identity).slice(0, 1) }}</b>
              </span>
              <span
                ><strong>{{ displayIdentityName(identity) }}</strong
                ><small>{{ identity.source === 'local_group' ? '群聊' : '私聊' }}</small></span
              >
            </button>
            <p v-if="!filtered.length">没有匹配的联系人或群聊</p>
          </div>
        </div>

        <footer>
          <label>
            <span>附加留言</span>
            <textarea v-model="note" rows="2" maxlength="500" placeholder="说点什么…（选填）"></textarea>
          </label>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref } from 'vue';
import type { Identity } from '../schemas';
import { displayIdentityName } from '../services/identity';
import { phoneSurfaceKey } from '../services/ui-context';

const props = defineProps<{ identities: Identity[]; title: string; preview: string }>();
const emit = defineEmits<{ cancel: []; confirm: [targets: string[], note: string] }>();
const surface = inject(phoneSurfaceKey, ref(null));
const dialog = ref<HTMLElement | null>(null);
const query = ref('');
const note = ref('');
const selected = ref<string[]>([]);
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  if (!needle) return props.identities;
  return props.identities.filter(identity =>
    `${displayIdentityName(identity)} ${identity.name} ${identity.remark}`.toLocaleLowerCase().includes(needle),
  );
});
function toggle(key: string): void {
  selected.value = selected.value.includes(key)
    ? selected.value.filter(item => item !== key)
    : [...selected.value, key];
}
function confirm(): void {
  if (selected.value.length) emit('confirm', [...selected.value], note.value.trim());
}
onMounted(async () => {
  await nextTick();
  dialog.value?.querySelector<HTMLInputElement>('input')?.focus();
});
</script>

<style scoped>
.wave-forward-backdrop {
  position: absolute;
  z-index: 160;
  inset: 0;
  display: grid;
  place-items: end center;
  background: rgba(22, 28, 42, 0.42);
  backdrop-filter: blur(3px);
}
.wave-forward-dialog {
  box-sizing: border-box;
  width: 100%;
  max-height: 88%;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  overflow: hidden;
  border-radius: 25px 25px 0 0;
  background: var(--wave-paper);
  color: var(--wave-ink);
  box-shadow: 0 -14px 44px rgba(24, 34, 55, 0.2);
}
.wave-forward-dialog > header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 17px 18px 12px;
}
.wave-forward-dialog > header strong {
  font-size: 15px;
}
.wave-forward-dialog > header button {
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: var(--wave-muted);
  font-size: 12px;
  text-align: left;
}
.wave-forward-dialog > header .forward-confirm {
  color: var(--wave-blue-strong);
  text-align: right;
  font-weight: 700;
}
.wave-forward-dialog > header .forward-confirm:disabled {
  opacity: 0.38;
}
.wave-forward-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 18px 12px;
  padding: 9px 12px;
  border-radius: 13px;
  background: var(--wave-tint);
  color: var(--wave-muted);
}
.wave-forward-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--wave-ink);
  font: inherit;
  font-size: 11px;
}
.wave-forward-body {
  min-height: 0;
  overflow-y: auto;
  padding: 0 18px 12px;
  overscroll-behavior: contain;
}
.wave-forward-source {
  display: grid;
  gap: 5px;
  margin-bottom: 12px;
  padding: 11px 12px;
  border: 1px solid var(--wave-line);
  border-radius: 14px;
  background: var(--wave-card);
}
.wave-forward-source small {
  color: var(--wave-muted);
  font-size: 8px;
  letter-spacing: 0.12em;
}
.wave-forward-source strong {
  font-size: 12px;
}
.wave-forward-source p {
  margin: 0;
  color: var(--wave-muted);
  font-size: 10px;
  line-height: 1.55;
}
.wave-forward-list {
  display: grid;
  gap: 4px;
}
.wave-forward-list > button {
  display: grid;
  grid-template-columns: 19px 40px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border: 0;
  border-bottom: 1px solid var(--wave-line);
  background: transparent;
  color: var(--wave-ink);
  text-align: left;
}
.wave-forward-list > button > i {
  color: var(--wave-blue-strong);
  font-size: 16px;
}
.wave-forward-avatar {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: var(--wave-tint);
  color: var(--wave-blue-strong);
}
.wave-forward-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.wave-forward-list > button > span:last-child {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.wave-forward-list strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wave-forward-list small,
.wave-forward-list > p {
  color: var(--wave-muted);
  font-size: 9px;
}
.wave-forward-dialog > footer {
  padding: 12px 18px calc(25px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--wave-line);
  background: var(--wave-card);
}
.wave-forward-dialog > footer label {
  display: grid;
  gap: 7px;
  color: var(--wave-muted);
  font-size: 9px;
}
.wave-forward-dialog textarea {
  box-sizing: border-box;
  width: 100%;
  resize: none;
  padding: 10px 11px;
  border: 1px solid var(--wave-line);
  border-radius: 13px;
  outline: 0;
  background: var(--wave-tint);
  color: var(--wave-ink);
  font: inherit;
  font-size: 11px;
}
</style>
