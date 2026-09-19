<template>
  <section class="chat-settings-group chat-cleanup">
    <div class="wave-settings-title">聊天记录</div>
    <button type="button" @click="open('display')">清空聊天记录</button>
    <button type="button" class="clear-context" @click="open('context')">清空聊天记录与历史上下文</button>
    <p class="chat-settings-note">仅清理当前聊天对象。头像、人设、关系、其他应用和酒馆原楼层会保留。</p>
    <div v-if="notice" class="chat-cleanup-notice" role="status">
      <span aria-hidden="true"><i class="fa-solid fa-check"></i></span>
      <div>
        <strong>清理完成</strong><small>{{ notice }}</small>
      </div>
    </div>
    <Teleport v-if="surface && mode" :to="surface"
      ><div class="chat-clear-mask" @click.self="close" @keydown.esc.stop.prevent="close">
        <section
          ref="dialog"
          class="chat-clear-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="确认清空聊天"
          tabindex="-1"
          @keydown.tab="trap"
        >
          <div class="chat-clear-heading">
            <span aria-hidden="true"><i class="fa-solid fa-trash-can"></i></span>
            <div>
              <small>CLEAR CHAT DATA</small>
              <strong>{{ mode === 'display' ? '清空聊天记录' : '清空记录与上下文' }}</strong>
            </div>
          </div>
          <p>
            {{
              mode === 'display'
                ? '将清空当前手机聊天的显示，保留模型可参考的历史。后续同步不会重新显示已清理的旧楼层。'
                : '将清空当前联系人的手机记录及模型参考历史。独立请求只取清理后新增的正文楼层；主 API 仍使用酒馆自身的正文上下文。'
            }}
          </p>
          <p>正在生成的手机回复会停止，清理无法撤销。</p>
          <div class="chat-clear-actions">
            <button type="button" :disabled="busy" @click="close">取消</button
            ><button type="button" class="clear-context" :disabled="busy" @click="confirm">
              {{ busy ? '清理中…' : '确认清空' }}
            </button>
          </div>
          <p v-if="error" role="alert">{{ error }}</p>
        </section>
      </div></Teleport
    >
  </section>
</template>
<script setup lang="ts">
import { inject, nextTick, ref, watch } from 'vue';
import { usePhoneStore } from '../../stores/phone';
import { phoneSurfaceKey } from '../../services/core/ui-context';
const phone = usePhoneStore(),
  surface = inject(phoneSurfaceKey, ref(null)),
  mode = ref<'' | 'display' | 'context'>(''),
  busy = ref(false),
  notice = ref(''),
  error = ref(''),
  dialog = ref<HTMLElement | null>(null);
let actor = '',
  previous: HTMLElement | null = null;
async function open(value: 'display' | 'context') {
  actor = phone.state.activeCharKey;
  mode.value = value;
  error.value = '';
  previous = surface.value?.ownerDocument.activeElement as HTMLElement | null;
  await nextTick();
  dialog.value?.querySelector<HTMLElement>('button')?.focus();
}
function close() {
  if (busy.value) return;
  mode.value = '';
  if (previous?.isConnected) previous.focus();
}
async function confirm() {
  if (!mode.value || actor !== phone.state.activeCharKey) return;
  busy.value = true;
  const value = mode.value;
  try {
    await phone.clearActiveConversation(value);
    if (actor !== phone.state.activeCharKey) return;
    notice.value = value === 'display' ? '聊天记录已清空，模型参考历史保留' : '聊天记录与手机历史上下文已清空';
    busy.value = false;
    close();
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
watch(
  () => phone.state.activeCharKey,
  () => {
    mode.value = '';
    notice.value = '';
    error.value = '';
  },
);
function trap(event: KeyboardEvent) {
  const buttons = [...(dialog.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])],
    first = buttons[0],
    last = buttons.at(-1),
    active = dialog.value?.ownerDocument.activeElement;
  if (event.shiftKey && (active === first || active === dialog.value)) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first?.focus();
  }
}
</script>
