import { z } from 'zod';
export const walletCategories = [
  '餐饮',
  '购物',
  '交通',
  '娱乐',
  '住房',
  '医疗',
  '通讯',
  '社交',
  '旅行',
  '其他',
] as const;
export const WalletTransactionSchema = z.object({
  id: z.string(),
  title: z.string().prefault(''),
  amount: z.number().nonnegative().nullable().prefault(null),
  direction: z.enum(['income', 'expense']).prefault('expense'),
  category: z.enum(walletCategories).catch('其他'),
  date: z.string().prefault(''),
  account: z.string().prefault('日常账户'),
  note: z.string().prefault(''),
  state: z.enum(['pending', 'received', 'refunded']).prefault('received'),
});
export const WalletSchema = z.object({
  currency: z.string().prefault('CNY'),
  balance: z.number().nullable().prefault(null),
  transactions: z.array(WalletTransactionSchema).prefault([]),
});
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;
export type Wallet = z.infer<typeof WalletSchema>;
export function parseWallet(raw: string): Wallet {
  try {
    const data = WalletSchema.safeParse(JSON.parse(raw));
    if (data.success) return data.data;
  } catch {
    /* Legacy text is preserved below. */
  }
  const balance = raw.match(/当前金额\s*[：:]\s*(?:[¥￥]|CNY)?\s*([\d,]+(?:\.\d+)?)/);
  const lines = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^(当前金额|购物记录)\s*[：:]?\s*$/.test(line) && !line.startsWith('当前金额'));
  return WalletSchema.parse({
    balance: balance ? Number(balance[1].replaceAll(',', '')) : null,
    transactions: lines.map((line, index) => ({
      id: `legacy-${index}`,
      title: line,
      category: walletCategories.find(category => line.includes(category)) || '其他',
    })),
  });
}
export function walletTotals(transactions: WalletTransaction[]) {
  return transactions.reduce(
    (totals, row) => {
      if (row.state === 'received' && row.amount !== null) totals[row.direction] += row.amount;
      return totals;
    },
    { income: 0, expense: 0 },
  );
}
export function mergeWallet(current: string, update: unknown): string {
  const before = parseWallet(current);
  const value = typeof update === 'string' ? JSON.parse(update) : update;
  const patch = z
    .object({
      currency: z.string().optional(),
      balance: z.number().nullable().optional(),
      transactions: z.array(WalletTransactionSchema).optional(),
    })
    .parse(value);
  return JSON.stringify({
    ...before,
    ...patch,
    transactions: [
      ...new Map([...before.transactions, ...(patch.transactions || [])].map(row => [row.id, row])).values(),
    ],
  });
}
