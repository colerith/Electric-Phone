import { z } from 'zod';
import { WalletTransactionSchema, walletTotals } from './wallet';

export const currencies = ['CNY', 'USD', 'EUR', 'JPY', 'KRW', 'GBP', 'HKD', 'TWD'];
export const AccountRowSchema = WalletTransactionSchema.extend({ currency: z.string().min(1) });
export const WalletAuthorizationSchema = z.object({
  accountId: z.string(),
  ownerType: z.enum(['char', 'shared']),
  ownerId: z.string(),
  currency: z.string(),
});
export type WalletAuthorization = z.infer<typeof WalletAuthorizationSchema>;
export const WalletAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerType: z.enum(['user', 'char', 'shared']),
  ownerId: z.string(),
  currency: z.string().default('CNY'),
  opening: z.record(z.string(), z.number().nullable()).default({}),
  bankName: z.string().max(80).default(''),
  cardLabel: z.string().max(80).default(''),
  cardLastFour: z
    .string()
    .regex(/^\d{0,4}$/)
    .default(''),
  manual: z.record(z.string(), AccountRowSchema).default({}),
  layers: z.record(z.string(), z.array(AccountRowSchema)).default({}),
  deletedTransactionIds: z.array(z.string()).default([]),
});
export const WalletBookSchema = z
  .object({
    accounts: z.record(z.string(), WalletAccountSchema).default({}),
    selectedShared: z.record(z.string(), z.string()).default({}),
    grants: z.record(z.string(), WalletAuthorizationSchema).default({}),
    order: z.record(z.string(), z.number()).default({}),
    revision: z.number().default(0),
  })
  .prefault({});
export type WalletBook = z.infer<typeof WalletBookSchema>;
export type WalletAccount = z.infer<typeof WalletAccountSchema>;
export function ensureWalletAccounts(book: WalletBook, charKey: string, name: string): void {
  book.accounts.user ||= WalletAccountSchema.parse({
    id: 'user',
    name: '我的钱包',
    ownerType: 'user',
    ownerId: 'user',
  });
  const id = `char:${charKey}`;
  book.accounts[id] ||= WalletAccountSchema.parse({ id, name: `${name}的钱包`, ownerType: 'char', ownerId: charKey });
}
export function walletAuthorization(book: WalletBook, charKey: string): WalletAuthorization | undefined {
  const selected = book.accounts[book.selectedShared[charKey]];
  const account =
    selected?.ownerType === 'shared' && selected.ownerId === charKey ? selected : book.accounts[`char:${charKey}`];
  return account ? WalletAuthorizationSchema.parse({ accountId: account.id, ...account }) : undefined;
}
export function accountRows(book: WalletBook, account: WalletAccount) {
  const deleted = new Set(account.deletedTransactionIds);
  const model = Object.entries(account.layers)
    .sort(([a], [b]) => (book.order[a] || 0) - (book.order[b] || 0))
    .flatMap(([, rows]) => rows);
  return [...new Map([...model, ...Object.values(account.manual)].map(row => [row.id, row])).values()].filter(
    row => !deleted.has(row.id),
  );
}
export function accountWallet(book: WalletBook, account: WalletAccount) {
  const transactions = accountRows(book, account).filter(row => row.currency === account.currency);
  const totals = walletTotals(transactions),
    opening = account.opening[account.currency];
  return {
    currency: account.currency,
    balance: opening == null ? null : Math.round((opening + totals.income - totals.expense) * 100) / 100,
    transactions,
  };
}
/** No account creation or bank/profile changes are accepted from model output. */
export function validateWalletPatch(
  update: unknown,
  grant: WalletAuthorization,
): { transactions: z.infer<typeof AccountRowSchema>[]; balance?: number | null } {
  const value = typeof update === 'string' ? JSON.parse(update) : update;
  const patch = z
    .object({
      accountId: z.string().optional(),
      ownerType: z.string().optional(),
      ownerId: z.string().optional(),
      currency: z.string().optional(),
      balance: z.number().nullable().optional(),
      transactions: z.array(WalletTransactionSchema.extend({ currency: z.string().optional() })).default([]),
    })
    .parse(value);
  const legacy = !patch.accountId && !patch.ownerType && !patch.ownerId;
  if (
    (legacy && grant.ownerType !== 'char') ||
    (!legacy &&
      (patch.accountId !== grant.accountId || patch.ownerType !== grant.ownerType || patch.ownerId !== grant.ownerId))
  )
    throw Error('钱包更新的账户归属与本次授权不符');
  if (patch.currency && patch.currency !== grant.currency) throw Error('钱包更新币种与本次授权不符');
  return {
    balance: legacy ? patch.balance : undefined,
    transactions: patch.transactions.map(row => {
      if (row.currency && row.currency !== grant.currency) throw Error('跨币种流水不能按同币种入账');
      return AccountRowSchema.parse({ ...row, currency: grant.currency });
    }),
  };
}
export function applyWalletPatch(
  book: WalletBook,
  update: unknown,
  grant: WalletAuthorization,
  layer: string,
): boolean {
  const account = book.accounts[grant.accountId];
  if (
    !account ||
    account.ownerType === 'user' ||
    account.ownerType !== grant.ownerType ||
    account.ownerId !== grant.ownerId
  )
    throw Error('钱包账户不可写入');
  const before = JSON.stringify(accountWallet(book, account));
  const patch = validateWalletPatch(update, grant);
  for (const row of patch.transactions) {
    const previous = accountRows(book, account).find(item => item.id === row.id);
    if (previous && previous.currency !== row.currency) throw Error('既有流水不能更改币种');
  }
  book.order[layer] ||= ++book.revision;
  // Legacy totals seed a previously unknown balance once; user-entered balances always win.
  if (!Object.hasOwn(account.opening, grant.currency) && patch.balance != null) {
    const total = walletTotals(patch.transactions);
    account.opening[grant.currency] = patch.balance - total.income + total.expense;
  }
  account.layers[layer] = patch.transactions.filter(row => !Object.hasOwn(account.manual, row.id));
  return JSON.stringify(accountWallet(book, account)) !== before;
}
export function saveAccount(
  book: WalletBook,
  id: string,
  fields: {
    name: string;
    currency: string;
    balance: number | null;
    bankName: string;
    cardLabel: string;
    cardLastFour: string;
  },
): void {
  const account = book.accounts[id];
  if (!account) throw Error('账户不存在');
  if (!currencies.includes(fields.currency)) throw Error('请选择支持的币种');
  const parsed = WalletAccountSchema.parse({ ...account, ...fields, name: fields.name.trim() || account.name });
  if (fields.balance !== null && !Number.isFinite(fields.balance)) throw Error('请输入有效余额');
  const totals = walletTotals(accountRows(book, account).filter(row => row.currency === fields.currency));
  parsed.opening[fields.currency] = fields.balance === null ? null : fields.balance - totals.income + totals.expense;
  book.accounts[id] = parsed;
}
