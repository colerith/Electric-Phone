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
    message.sender === 'char' &&
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
  return { group, count, claimed, amount, share, label, canRespond, canReceive: canRespond && validAmount };
}
