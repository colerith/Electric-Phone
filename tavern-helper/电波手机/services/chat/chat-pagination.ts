import { computed, ref, watch, type ComputedRef } from 'vue';

/** Keep the oldest rendered message anchored when new messages arrive. */
export function useChatPagination<T extends { id: string }>(messages: ComputedRef<T[]>, pageSize = 100) {
  const firstId = ref('');
  const start = computed(() => {
    const index = messages.value.findIndex(message => message.id === firstId.value);
    return index >= 0 ? index : Math.max(0, messages.value.length - pageSize);
  });
  const visible = computed(() => messages.value.slice(start.value));
  const hasMore = computed(() => start.value > 0);
  function reset() {
    firstId.value = messages.value[Math.max(0, messages.value.length - pageSize)]?.id || '';
  }
  function loadMore() {
    firstId.value = messages.value[Math.max(0, start.value - pageSize)]?.id || '';
  }
  watch(
    messages,
    rows => {
      if (!rows.some(message => message.id === firstId.value)) reset();
    },
    { flush: 'sync' },
  );
  reset();
  return { visible, hasMore, reset, loadMore };
}
