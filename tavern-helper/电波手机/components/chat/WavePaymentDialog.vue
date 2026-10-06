<template>
  <Teleport v-if="surface" :to="surface">
    <div
      class="wave-payment-backdrop"
      @click.stop
      @pointerdown.stop
      @pointerup.stop
      @contextmenu.stop
      @click.self="$emit('close')"
      @keydown.esc.stop.prevent="$emit('close')"
      @keydown.tab="trapFocus"
    >
      <section
        ref="dialog"
        class="wave-payment-dialog wave-settings-surface"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
      >
        <header>
          <strong>{{ title }}</strong
          ><button type="button" class="payment-close" aria-label="关闭收款详情" @click.stop="$emit('close')">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </header>
        <i
          class="payment-symbol"
          :class="message.type === 'red_packet' ? 'fa-solid fa-gift' : 'fa-solid fa-money-bill-transfer'"
          aria-hidden="true"
        ></i>
        <p>{{ senderName }}发出的{{ message.type === 'red_packet' ? '红包' : '转账' }}</p>
        <small>{{ message.payload.userReceivedAmount != null ? '你领取了' : '总金额' }}</small>
        <strong class="payment-amount">{{ currency }} {{ amountLabel }}</strong>
        <p>{{ message.payload.note || message.content }}</p>
        <small v-if="details.group"
          >群红包 · 已领 {{ details.claimed }}/{{ details.count }} 份 · 共 {{ currency }} {{ totalAmount }}</small
        >
        <section v-if="claims.length" class="payment-claims" aria-label="红包领取记录">
          <div v-for="claim in claims" :key="claim.actorKey" class="payment-claim">
            <span
              ><strong>{{ recipientName(claim.actorKey) }}</strong
              ><small>{{ formatMessageDateTime(claim.at) }}</small></span
            >
            <span
              >{{ currency }} {{ claim.amount.toFixed(2)
              }}<small
                v-if="details.group && details.claimed >= details.count && claim.amount === bestAmount"
                class="payment-best"
                ><i class="fa-solid fa-crown" aria-hidden="true"></i> 手气之王</small
              ></span
            >
          </div>
        </section>
        <small v-if="details.claimed > claims.length">部分历史领取记录未保存，不能显示具体领取人。</small>
        <p class="payment-status" role="status">{{ details.label }}</p>
        <div v-if="details.canRespond" class="payment-actions">
          <button type="button" :disabled="!details.canReceive" @click="respond('received')">
            {{ message.type === 'red_packet' ? '领取红包' : '确认收款' }}
          </button>
          <button type="button" @click="respond('refunded')">
            {{ details.group ? '拒收这份红包' : '拒收并退回' }}
          </button>
        </div>
        <small v-if="details.canRespond && !details.canReceive">金额无效，暂时无法收款。</small>
        <p v-if="error" role="alert">{{ error }}</p>
      </section>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { formatMessageDateTime } from '../../services/core/message-clock';
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { PhoneMessage } from '../../schemas';
import { usePhoneStore } from '../../stores/phone';
import { phoneSurfaceKey } from '../../services/core/ui-context';
import { paymentDetails, paymentClaims } from '../../services/chat/payment';
import { displayIdentityName } from '../../services/core/identity';
const props = defineProps<{ message: PhoneMessage; threadId: string }>();
const emit = defineEmits<{ close: [] }>();
const phone = usePhoneStore();
const surface = inject(phoneSurfaceKey, ref(null));
const dialog = ref<HTMLElement | null>(null);
const error = ref('');
const details = computed(() => paymentDetails(props.message));
const title = computed(() => (props.message.type === 'red_packet' ? '红包详情' : '转账详情'));
function recipientName(key: string): string {
  return (
    phone.activeIdentity?.groupMembers?.[key]?.nickname ||
    (key === 'user' ? String(SillyTavern.name1 || '我') : displayIdentityName(phone.state.identities[key]) || key)
  );
}
const senderName = computed(() =>
  props.message.sender === 'user'
    ? recipientName('user')
    : recipientName(String(props.message.payload.actorKey || phone.activeIdentity?.charKey || '')),
);
const claims = computed(() => paymentClaims(props.message));
const bestAmount = computed(() =>
  claims.value.length === details.value.count ? Math.max(...claims.value.map(c => c.amount)) : -1,
);
const totalAmount = computed(() => Number(props.message.payload.amount || 0).toFixed(2));
const currency = computed(() => String(props.message.payload.currency || 'CNY'));
const amountLabel = computed(() => {
  const amount = Number(props.message.payload.userReceivedAmount ?? props.message.payload.amount);
  return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : '—';
});
function respond(decision: 'received' | 'refunded') {
  error.value = '';
  try {
    phone.respondToPayment(props.threadId, props.message.id, decision);
    void nextTick(() => dialog.value?.focus());
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}
function trapFocus(event: KeyboardEvent) {
  const controls = [...(dialog.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])];
  const index = controls.indexOf(dialog.value?.ownerDocument.activeElement as HTMLButtonElement);
  if (event.shiftKey ? index <= 0 : index === controls.length - 1) {
    event.preventDefault();
    (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
  }
}
let previousFocus: HTMLElement | null = null;
onMounted(() => {
  previousFocus = dialog.value?.ownerDocument.activeElement as HTMLElement | null;
  dialog.value?.focus();
});
onUnmounted(() => {
  if (previousFocus?.isConnected) previousFocus.focus();
});
watch(
  () => [phone.activeThread?.id, props.message.withdrawn],
  () => {
    if (phone.activeThread?.id !== props.threadId || props.message.withdrawn) emit('close');
  },
);
</script>
<style lang="scss">
#wave-phone-script-root .wave-payment-backdrop {
  position: absolute;
  inset: 0;
  z-index: 160;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #17203966;
  backdrop-filter: blur(4px);
}
#wave-phone-script-root .wave-payment-dialog {
  width: 100%;
  max-width: 340px;
  max-height: 100%;
  overflow-y: auto;
  padding: 22px;
  border-radius: 24px;
  background: var(--wave-card, #fff);
  color: var(--wave-ink, #374558);
  text-align: center;
  box-shadow: 0 16px 48px #18294730;
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  button {
    appearance: none;
    border: 1px solid var(--wave-line, #dce3ee);
    border-radius: 12px;
    background: var(--wave-tint, #f3f3f3);
    color: inherit;
    padding: 10px 14px;
    font: inherit;
    cursor: pointer;
  }
  .payment-claims {
    margin: 18px 0;
    text-align: left;
    max-height: 240px;
    overflow-y: auto;
  }
  .payment-claim {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0;
    border-top: 1px solid #8882;
    font-size: 13px;
  }
  .payment-claim > span:last-child {
    text-align: right;
  }
  .payment-claim small {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: var(--settings-muted);
  }
  .payment-claim .payment-best {
    color: #bf913d;
  }
  button:focus-visible {
    outline: 2px solid var(--wave-blue, #5e80be);
    outline-offset: 3px;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  header .payment-close {
    display: grid;
    place-items: center;
    flex: 0 0 36px;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: #eaf0fa;
    color: #234578;
    font-size: 20px;
  }
  .payment-status {
    margin: 18px 0 0;
    padding: 10px 14px;
    border-radius: 14px;
    background: var(--wave-tint, #f3f6fb);
    color: var(--wave-muted, #6e7682);
    font-size: 13px;
    line-height: 1.5;
  }
  > small {
    font-size: 12px;
    line-height: 1.6;
  }
  .payment-actions button {
    min-height: 42px;
    font-size: 13px;
    font-weight: 600;
  }
  .payment-actions button:last-child {
    background: transparent;
  }

  .payment-symbol {
    display: block;
    margin: 24px auto 16px;
    font-size: 34px;
    color: #d88050;
  }
  .payment-amount {
    display: block;
    font-size: 28px;
    overflow-wrap: anywhere;
  }
  p {
    margin: 12px 0;
    overflow-wrap: anywhere;
  }
  small {
    color: var(--wave-muted, #6e7682);
  }
  .payment-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 14px;
  }
  .payment-actions button:first-child {
    background: var(--wave-blue, #5e80be);
    border-color: transparent;
    color: #fff;
  }
}
#wave-phone-script-root :is(.wave-message-transfer, .wave-message-red-packet)[role='button'] {
  cursor: pointer;
}
#wave-phone-script-root :is(.wave-message-transfer, .wave-message-red-packet)[role='button']:focus-visible {
  outline: 2px solid var(--wave-blue, #5e80be);
  outline-offset: 3px;
}
</style>
