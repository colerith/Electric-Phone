import type { PhoneMessage } from '../../schemas';

export function paymentDetails(message: PhoneMessage) {
  const payload = message.payload;
  const state = String(payload.state || 'pending').toLowerCase();
  const decision = String(payload.userPaymentDecision || '');
  const group = message.type === 'red_packet' && (payload.packetType === 'group' || state.startsWith('group_'));
  const count = Math.max(1, Math.floor(Number(payload.count) || 1));
  const claimed = Math.max(0, Math.floor(Number(payload.claimedCount) || 0));
  const amount = Number(payload.amount);
  const remaining = amount - Math.max(0, Number(payload.claimedAmount) || 0);
  const share = group
    ? Math.floor((remaining * 100) / Math.max(1, count - claimed)) / 100
    : Math.round(amount * 100) / 100;
  const settled = [
    'received',
    'paid',
    'accepted',
    'refunded',
    'refund',
    'returned',
    'rejected',
    'expired',
    'group_empty',
  ].includes(state);
  const validAmount = Number.isFinite(share) && share > 0 && Number.isSafeInteger(Math.round(share * 100));
  const canRespond =
    (message.sender === 'char' || (group && message.sender === 'user')) &&
    !message.withdrawn &&
    !payload.forwarded &&
    ['red_packet', 'transfer'].includes(message.type) &&
    !decision &&
    !settled &&
    ['pending', 'group_available', 'group_claimed'].includes(state) &&
    (!group || claimed < count);
  const label =
    decision === 'received'
      ? '已收款'
      : decision === 'refunded'
        ? '已拒收'
        : ['received', 'paid', 'accepted'].includes(state)
          ? '已收款'
          : ['refunded', 'refund', 'returned', 'rejected'].includes(state)
            ? '已退回'
            : state === 'expired'
              ? '已过期'
              : state === 'group_empty' || (group && claimed >= count)
                ? '已领完'
                : '待领取';
  return {
    group,
    count,
    claimed,
    amount,
    share,
    label,
    canRespond,
    canReceive: canRespond && validAmount && (!group || remaining * 100 >= count - claimed),
  };
}

export type PaymentClaim = { actorKey: string; amount: number; at: string };
export function paymentClaims(message: PhoneMessage): PaymentClaim[] {
  if (!Array.isArray(message.payload.claims)) return [];
  return message.payload.claims.filter((c): c is PaymentClaim =>
    Boolean(
      c &&
      typeof c.actorKey === 'string' &&
      typeof c.amount === 'number' &&
      Number.isFinite(c.amount) &&
      c.amount > 0 &&
      typeof c.at === 'string',
    ),
  );
}
/** Amounts are allocated locally in cents, never taken from model-written dialogue. */
export function claimPayment(message: PhoneMessage, actorKey: string, at = message.createdAt): number | null {
  const p = message.payload,
    detail = paymentDetails(message);
  if (
    message.withdrawn ||
    p.forwarded ||
    !['red_packet', 'transfer'].includes(message.type) ||
    !['pending', 'group_available', 'group_claimed'].includes(String(p.state || 'pending')) ||
    paymentClaims(message).some(c => c.actorKey === actorKey) ||
    (actorKey === 'user' && p.userPaymentDecision)
  )
    return null;
  const remaining = Math.round((detail.amount - Number(p.claimedAmount || 0)) * 100);
  const slots = detail.group ? detail.count - detail.claimed : 1;
  if (!Number.isSafeInteger(remaining) || slots < 1 || remaining < slots) return null;
  let cents = remaining;
  if (detail.group && slots > 1) {
    let hash = 2166136261;
    for (const c of `${message.id}:${actorKey}:${detail.claimed}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    const upper = Math.min(remaining - slots + 1, Math.floor((remaining / slots) * 2));
    cents = 1 + ((hash >>> 0) % Math.max(1, upper));
  }
  const amount = cents / 100;
  p.paymentLedgerVersion = 1;
  p.claims = [...paymentClaims(message), { actorKey, amount, at }];
  p.claimedCount = detail.claimed + 1;
  p.claimedAmount = Math.round((Number(p.claimedAmount || 0) + amount) * 100) / 100;
  p.state = detail.group ? (Number(p.claimedCount) >= detail.count ? 'group_empty' : 'group_claimed') : 'received';
  return amount;
}
export function applyPaymentActions(
  messages: PhoneMessage[],
  actions: { message_id: string; actor_key?: string; action: 'receive' | 'refund' }[] | undefined,
  actorKeys: string[],
  group = false,
  at?: string,
): void {
  for (const action of actions || []) {
    const key = action.actor_key || (actorKeys.length === 1 ? actorKeys[0] : '');
    const message = messages.find(m => m.id === action.message_id);
    if (
      !key ||
      key === 'user' ||
      !actorKeys.includes(key) ||
      !message ||
      message.status !== 'sent' ||
      message.withdrawn ||
      message.payload.forwarded ||
      !['red_packet', 'transfer'].includes(message.type)
    )
      continue;
    const detail = paymentDetails(message);
    if ((!group || !detail.group) && message.sender !== 'user') continue;
    if (group && !detail.group && message.payload.recipientKey && message.payload.recipientKey !== key) continue;
    if (action.action === 'receive') claimPayment(message, key, at || message.createdAt);
    else if (!detail.group && String(message.payload.state || 'pending') === 'pending') {
      message.payload.paymentLedgerVersion = 1;
      message.payload.state = 'refunded';
      message.payload.refundedBy = key;
      message.payload.refundedAt = at || message.createdAt;
    }
  }
}
