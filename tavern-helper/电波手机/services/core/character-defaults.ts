import { z } from 'zod';
import { klona } from 'klona';
import { WalletBookSchema, type WalletBook } from '../wallet/wallet-accounts';
import type { ChatState } from '../../schemas';

export const CHARACTER_DEFAULTS_KEY = 'wave_phone_character_defaults';
export const CharacterDefaultsSchema = z
  .object({
    artwork: z.record(z.string(), z.record(z.string(), z.string())).prefault({}),
    walletBook: WalletBookSchema,
    migratedChats: z.array(z.string()).prefault([]),
  })
  .prefault({});
export const CharacterDefaultsMapSchema = z.record(z.string(), CharacterDefaultsSchema).prefault({});
export type CharacterDefaults = z.infer<typeof CharacterDefaultsSchema>;
export function walletChatPrefix(chatKey: string): string {
  return `chat:${encodeURIComponent(chatKey)}:`;
}

/** Namespace legacy sources once so equally named rows in separate chats remain distinct. */
export function namespaceWallet(book: WalletBook, chatKey: string): WalletBook {
  const result = klona(book),
    prefix = walletChatPrefix(chatKey);
  const key = (value: string) => (value.startsWith('chat:') ? value : prefix + value);
  for (const account of Object.values(result.accounts)) {
    account.layers = Object.fromEntries(
      Object.entries(account.layers).map(([layer, rows]) => [
        key(layer),
        rows.map(row => ({ ...row, id: key(row.id) })),
      ]),
    );
    account.manual = Object.fromEntries(
      Object.values(account.manual).map(row => {
        const id = key(row.id);
        return [id, { ...row, id }];
      }),
    );
    account.deletedTransactionIds = account.deletedTransactionIds.map(key);
  }
  result.order = Object.fromEntries(Object.entries(result.order).map(([id, order]) => [key(id), order]));
  result.grants = Object.fromEntries(Object.entries(result.grants).map(([id, grant]) => [key(id), grant]));
  return result;
}

/** Merge each old chat only once. Existing shared balances and edits take priority. */
export function captureMissingDefaults(state: ChatState, defaults: CharacterDefaults): void {
  for (const [key, artwork] of Object.entries(state.appArtwork)) {
    defaults.artwork[key] = { ...artwork, ...defaults.artwork[key] };
  }
  if (defaults.migratedChats.includes(state.chatKey)) return;
  const legacy = namespaceWallet(state.walletBook, state.chatKey),
    shared = defaults.walletBook;
  for (const [id, account] of Object.entries(legacy.accounts)) {
    const existing = shared.accounts[id];
    if (!existing) {
      shared.accounts[id] = account;
      continue;
    }
    existing.opening = { ...account.opening, ...existing.opening };
    existing.layers = { ...account.layers, ...existing.layers };
    existing.manual = { ...account.manual, ...existing.manual };
    existing.deletedTransactionIds = [
      ...new Set([...account.deletedTransactionIds, ...existing.deletedTransactionIds]),
    ];
  }
  for (const [layer] of Object.entries(legacy.order).sort(([, a], [, b]) => a - b)) {
    shared.order[layer] ||= ++shared.revision;
  }
  shared.grants = { ...legacy.grants, ...shared.grants };
  shared.selectedShared = { ...legacy.selectedShared, ...shared.selectedShared };
  defaults.migratedChats.push(state.chatKey);
}

export function inheritCharacterDefaults(state: ChatState, defaults: CharacterDefaults): void {
  for (const [charKey, artwork] of Object.entries(defaults.artwork)) {
    state.appArtwork[charKey] = { ...state.appArtwork[charKey], ...artwork };
  }
  state.walletBook = klona(defaults.walletBook);
}
