import type { Identity, Thread } from '../../schemas';
import { AccountRowSchema, isWalletCharacter, type WalletBook } from '../wallet/wallet-accounts';
import { paymentClaims } from './payment';

/** Message IDs are stable receipts; saving or replaying the same action cannot double-book it. */
export function syncPaymentLedger(
  book: WalletBook,
  threads: Thread[],
  identities: Record<string, Identity>,
  prefix: string,
  defaultCurrency = 'CNY',
) {
  for (const thread of threads)
    for (const message of thread.messages) {
      if (
        !['red_packet', 'transfer'].includes(message.type) ||
        message.status !== 'sent' ||
        message.payload.forwarded ||
        !message.payload.paymentLedgerVersion
      )
        continue;
      const sender =
        message.sender === 'user'
          ? 'user'
          : String(
              message.payload.actorKey || (identities[thread.charKey]?.source === 'local_group' ? '' : thread.charKey),
            );
      const accountFor = (key: string) =>
        key === 'user'
          ? book.accounts.user
          : isWalletCharacter(identities[key])
            ? book.accounts[`char:${key}`]
            : undefined;
      const senderAccount = accountFor(sender);
      const currency = String(message.payload.currency || senderAccount?.currency || defaultCurrency);
      message.payload.currency = currency;
      const title = message.type === 'red_packet' ? '红包' : '转账';
      const receipt = `${prefix}payment:${thread.charKey}:${message.id}`;
      const record = (
        key: string,
        id: string,
        amount: number,
        direction: 'income' | 'expense',
        label: string,
        at: string,
      ) => {
        const account = accountFor(key);
        if (
          !account ||
          !Number.isFinite(amount) ||
          amount <= 0 ||
          !Number.isSafeInteger(Math.round(amount * 100)) ||
          account.deletedTransactionIds.includes(id)
        )
          return;
        account.manual[id] ||= AccountRowSchema.parse({
          id,
          title: label + title,
          amount,
          currency,
          direction,
          category: '社交',
          date: at,
          note: String(message.payload.note || message.content),
          state: 'received',
        });
      };
      record(sender, `${receipt}:sent:${sender}`, Number(message.payload.amount), 'expense', '发出', message.createdAt);
      for (const claim of paymentClaims(message))
        record(
          claim.actorKey,
          claim.actorKey === 'user' ? `${receipt}:user` : `${receipt}:received:${claim.actorKey}`,
          claim.amount,
          'income',
          '收到',
          claim.at,
        );
      if (message.payload.state === 'refunded')
        record(
          sender,
          `${receipt}:refund:${sender}`,
          Number(message.payload.amount),
          'income',
          '退回',
          String(message.payload.refundedAt || message.payload.userPaymentAt || message.createdAt),
        );
    }
}
