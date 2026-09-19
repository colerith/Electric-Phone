<template>
  <Teleport :to="surface || 'body'" :disabled="!surface">
    <div
      class="space-delete-overlay"
      @click.self="$emit('cancel')"
      @keydown.esc.stop.prevent="$emit('cancel')"
      @keydown.tab.prevent="cycle"
    >
      <section
        ref="dialog"
        class="space-delete-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="descriptionId"
      >
        <strong :id="titleId">{{ title }}</strong>
        <p :id="descriptionId">删除后，该动态和下面的评论、点赞将一并移除。</p>
        <div>
          <button ref="cancelButton" type="button" @click="$emit('cancel')">取消</button
          ><button class="space-delete-confirm" type="button" @click="$emit('confirm')">确认删除</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { inject, ref, onMounted, onUnmounted, useId } from 'vue';
import { phoneSurfaceKey } from '../../services/core/ui-context';
defineProps<{ title: string }>();
defineEmits<{ cancel: []; confirm: [] }>();
const surface = inject(phoneSurfaceKey, ref(null));
const dialog = ref<HTMLElement | null>(null),
  cancelButton = ref<HTMLButtonElement | null>(null);
const titleId = useId(),
  descriptionId = useId();
let previous: HTMLElement | null = null;
onMounted(() => {
  previous = dialog.value?.ownerDocument.activeElement as HTMLElement | null;
  cancelButton.value?.focus();
});
onUnmounted(() => {
  if (previous?.isConnected) previous.focus();
});
function cycle() {
  const buttons = dialog.value?.querySelectorAll('button');
  if (!buttons?.length) return;
  (dialog.value?.ownerDocument.activeElement === buttons[0] ? buttons[1] : buttons[0]).focus();
}
</script>
