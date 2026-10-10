import isEqual from 'lodash/isEqual';
import { klona } from 'klona';
import { reactive } from 'vue';
import { z } from 'zod';
import {
  SCRIPT_VARIABLE_KEY,
  PROFILE_VARIABLE_KEY,
  USER_PROFILE_VARIABLE_KEY,
  CARD_ROSTER_VARIABLE_KEY,
  CHAT_VARIABLE_KEY,
  WAVE_PHONE_IDENTIFIER,
  WAVE_PHONE_STORAGE_VERSION,
  ScriptSettingsSchema,
  CharacterProfileMapSchema,
  CardRosterMapSchema,
  ChatStateSchema,
} from '../../schemas';
import { CHARACTER_DEFAULTS_KEY, CharacterDefaultsMapSchema } from './character-defaults';
import { MomentUserProfileMapSchema } from '../space/moments';
import { getRuntimeContext, type RuntimeContext } from './identity';

const STORAGE_KEY = 'wave_phone_durable_v1';
const schemas: Record<string, z.ZodType> = {
  [SCRIPT_VARIABLE_KEY]: ScriptSettingsSchema,
  [PROFILE_VARIABLE_KEY]: CharacterProfileMapSchema,
  [USER_PROFILE_VARIABLE_KEY]: MomentUserProfileMapSchema,
  [CARD_ROSTER_VARIABLE_KEY]: CardRosterMapSchema,
  [CHARACTER_DEFAULTS_KEY]: CharacterDefaultsMapSchema,
};
const SnapshotSchema = z.object({
  identifier: z.literal(WAVE_PHONE_IDENTIFIER),
  version: z.literal(1),
  scope: z.string(),
  savedAt: z.number().finite().positive(),
  data: z.record(z.string(), z.unknown()),
});
type Snapshot = z.infer<typeof SnapshotSchema>;
class StorageUnavailableError extends Error {}
type DurableSettings = { version: 1; globals: Record<string, unknown>; savedAt: number };
const pending = new Map<string, Snapshot>();
const slots = new Map<string, number>();
const loaded = new Set<string>();
const snapshots = new Map<string, Snapshot>();
const reads = new Map<string, Promise<Snapshot | undefined>>();
let flushing: Promise<void> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let globalLoading: Promise<void> | undefined;
export const phoneStorageStatus = reactive({ pending: 0, savedAt: 0, error: '', recovery: '' });

function supported(): boolean {
  return Boolean(SillyTavern.extensionSettings);
}
function settings(): DurableSettings | undefined {
  const value = SillyTavern.extensionSettings?.[STORAGE_KEY];
  if (!value) return undefined;
  if (value.version !== 1 || !value.globals || typeof value.globals !== 'object')
    throw Error('手机服务器存储格式无法识别，请勿重置数据');
  return value;
}
function globalsOnly(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(schemas)
      .filter(key => Object.hasOwn(value, key))
      .map(key => [key, klona(value[key])]),
  );
}
function validate(snapshot: Snapshot): void {
  if (snapshot.scope === 'global') {
    for (const [key, value] of Object.entries(globalsOnly(snapshot.data))) {
      const envelope = z
        .object({
          identifier: z.literal(WAVE_PHONE_IDENTIFIER),
          version: z.literal(WAVE_PHONE_STORAGE_VERSION),
          data: z.unknown(),
        })
        .parse(value);
      schemas[key].parse(envelope.data);
    }
  } else {
    const chat = ChatStateSchema.parse(snapshot.data);
    if (chatScope(chat) !== snapshot.scope) throw Error('服务器聊天存档归属不匹配');
  }
}
function chatScope(context: Pick<RuntimeContext, 'cardKey' | 'chatKey'>): string {
  return JSON.stringify([context.cardKey, context.chatKey]);
}
// Deterministic filename, independent of script ID and browser cache. The full scope is verified on read.
function filename(scope: string, slot: number): string {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(scope)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 1099511628211n);
  return `wave-phone-v1-${scope === 'global' ? 'global' : hash.toString(16)}-${slot}.json`;
}
// Large legacy archives can contain inline images. Keep one body in flight per scope,
// and inspect only the small envelope before choosing which redundant copy to load.
async function request(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(120000), credentials: 'same-origin' });
}
async function retryRead<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= 2 || !(error instanceof StorageUnavailableError)) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}
function releaseOtherSnapshots(scope: string): void {
  // Global + current chat only. Unsaved chats remain protected in pending.
  for (const key of snapshots.keys()) {
    if (scope !== 'global' && key !== 'global' && key !== scope) {
      snapshots.delete(key);
      loaded.delete(key);
      slots.delete(key);
    }
  }
}
function remember(scope: string, snapshot: Snapshot, slot: number): void {
  releaseOtherSnapshots(scope);
  slots.set(scope, slot);
  snapshots.set(scope, snapshot);
}
async function readSlot(scope: string, slot: number, headerOnly: boolean): Promise<Snapshot | number | undefined> {
  return retryRead(async () => {
    let response: Response;
    try {
      response = await request(`/user/files/${filename(scope, slot)}`, {
        cache: 'no-store',
        ...(headerOnly ? { headers: { Range: 'bytes=0-1023' } } : {}),
      });
    } catch {
      throw new StorageUnavailableError('无法连接酒馆服务器，自动重试后仍未恢复；未覆盖存档');
    }
    if (response.status === 404) return undefined;
    if (!response.ok) throw new StorageUnavailableError(`读取服务器存档失败 (${response.status})`);
    let raw: unknown;
    try {
      if (headerOnly) {
        const reader = response.body?.getReader();
        if (!reader) return -1;
        let prefix = '';
        const decoder = new TextDecoder();
        try {
          while (prefix.length < 1024) {
            const chunk = await reader.read();
            if (chunk.done) break;
            prefix += decoder.decode(chunk.value.subarray(0, 1024 - prefix.length), { stream: true });
            if (/"data"\s*:/.test(prefix)) break;
          }
        } finally {
          await reader.cancel(); // Also stops a server that ignores Range and responds 200.
        }
        const boundary = prefix.search(/,\s*"data"\s*:/);
        if (boundary < 0) return -1; // Legacy envelope: inspect the full file below.
        try {
          const envelope = JSON.parse(prefix.slice(0, boundary) + '}');
          return envelope.identifier === WAVE_PHONE_IDENTIFIER &&
            envelope.scope === scope &&
            envelope.version === 1 &&
            Number.isFinite(envelope.savedAt)
            ? envelope.savedAt
            : -1;
        } catch {
          return -1;
        }
      }
      raw = await response.json();
    } catch (error) {
      if (error instanceof SyntaxError) throw error;
      throw new StorageUnavailableError('读取服务器存档超时或中断，未覆盖存档');
    }
    if (Number((raw as { version?: number })?.version) > 1)
      throw new StorageUnavailableError('服务器存档来自更高版本，请先更新电波手机');
    const snapshot = SnapshotSchema.parse(raw);
    if (snapshot.scope !== scope) throw Error('服务器存档归属不匹配');
    validate(snapshot);
    return snapshot;
  });
}
async function readServerUncached(scope: string): Promise<Snapshot | undefined> {
  releaseOtherSnapshots(scope);
  const headers = await Promise.all([0, 1].map(async slot => ({ slot, revision: await readSlot(scope, slot, true) })));
  const candidates = headers
    .filter(item => item.revision !== undefined)
    .sort((a, b) => Number(b.revision) - Number(a.revision));
  const knownOrder = candidates.every(item => Number(item.revision) >= 0);
  let selected: { snapshot: Snapshot; slot: number } | undefined;
  let failure: unknown;
  for (const { slot } of candidates) {
    try {
      const snapshot = (await readSlot(scope, slot, false)) as Snapshot | undefined;
      if (snapshot && (!selected || snapshot.savedAt > selected.snapshot.savedAt)) selected = { snapshot, slot };
      if (selected && knownOrder) break;
    } catch (error) {
      // A missing/unreachable latest copy cannot safely be replaced with an older one.
      if (error instanceof StorageUnavailableError) throw error;
      failure = error;
    }
  }
  if (!selected && failure) throw failure;
  if (failure) phoneStorageStatus.recovery = '一份服务器存档无法读取，已使用另一份有效存档。';
  if (selected) remember(scope, selected.snapshot, selected.slot);
  loaded.add(scope);
  return selected?.snapshot;
}
function readServer(scope: string): Promise<Snapshot | undefined> {
  const existing = reads.get(scope);
  if (existing) return existing;
  const reading = readServerUncached(scope).finally(() => reads.delete(scope));
  reads.set(scope, reading);
  return reading;
}
function report(error: unknown): void {
  phoneStorageStatus.error = error instanceof Error ? error.message : '服务器保存失败';
  console.warn('[wave-phone] 服务器存储失败；待保存数据仍保留，可重试', phoneStorageStatus.error);
}
function queue(scope: string, data: Record<string, unknown>): number {
  if (!supported()) return Date.now();
  const previous = pending.get(scope) || snapshots.get(scope);
  if (previous && isEqual(previous.data, data)) return previous.savedAt;
  const savedAt = Math.max(
    Date.now(),
    phoneStorageStatus.savedAt + 1,
    (pending.get(scope)?.savedAt || 0) + 1,
    (snapshots.get(scope)?.savedAt || 0) + 1,
    scope === 'global' ? (settings()?.savedAt || 0) + 1 : 0,
  );
  const snapshot: Snapshot = {
    identifier: WAVE_PHONE_IDENTIFIER,
    version: 1 as const,
    scope,
    savedAt,
    data: klona(data),
  };
  validate(snapshot);
  pending.set(scope, snapshot);
  phoneStorageStatus.pending = pending.size;
  scheduleStorage();
  return savedAt;
}
let storageIntervalMs = 30000;
function scheduleStorage(): void {
  if (timer || !pending.size) return;
  timer = setTimeout(() => {
    timer = undefined;
    void flushPhoneStorage(false).catch(() => {});
  }, storageIntervalMs);
}
export function setPhoneStorageInterval(seconds: number): void {
  storageIntervalMs = Math.max(5, Math.min(600, Number(seconds) || 30)) * 1000;
  clearTimeout(timer);
  timer = undefined;
  scheduleStorage();
}
let globalBatchDepth = 0;
let batchedGlobals: Record<string, any> | undefined;
/** Coalesce dependent writes while keeping in-batch reads current. */
export function batchPhoneStorage<T>(action: () => T): T {
  globalBatchDepth++;
  try {
    return action();
  } finally {
    if (--globalBatchDepth === 0 && batchedGlobals) {
      const value = batchedGlobals;
      batchedGlobals = undefined;
      writePhoneGlobals(value);
    }
  }
}
export function readPhoneGlobals(): Record<string, any> {
  if (batchedGlobals) return { ...batchedGlobals };
  return { ...getVariables({ type: 'global' }), ...(supported() ? settings()?.globals : {}) };
}
export function writePhoneGlobals(value: Record<string, any>): void {
  if (globalBatchDepth) {
    batchedGlobals = value;
    return;
  }
  const globals = globalsOnly(value);
  if (!Object.keys(globals).length) {
    replaceVariables(value, { type: 'global' });
    return;
  }
  const savedAt = queue('global', globals);
  const local = getVariables({ type: 'global' });
  if (!isEqual(local, { ...value, wave_phone_global_saved_at: savedAt }))
    replaceVariables({ ...value, wave_phone_global_saved_at: savedAt }, { type: 'global' });
  if (!supported()) return;
  const current = settings();
  if (current?.savedAt === savedAt && isEqual(current.globals, globals)) return;
  SillyTavern.extensionSettings[STORAGE_KEY] = { version: 1, globals, savedAt } satisfies DurableSettings;
  void Promise.resolve(SillyTavern.saveSettingsDebounced()).catch(report);
}

/** Must finish before store construction, so defaults cannot overwrite an unread server snapshot. */
export async function preparePhoneStorage(): Promise<void> {
  if (!supported() || loaded.has('global')) return;
  if (globalLoading) return globalLoading;
  globalLoading = (async () => {
    const cached = settings();
    const server = await readServer('global');
    const local = getVariables({ type: 'global' }) || {};
    const candidates = [
      server,
      cached && { data: cached.globals, savedAt: cached.savedAt },
      local.wave_phone_global_saved_at && {
        data: globalsOnly(local),
        savedAt: Number(local.wave_phone_global_saved_at),
      },
    ].filter(Boolean) as { data: Record<string, unknown>; savedAt: number }[];
    candidates.sort((a, b) => b.savedAt - a.savedAt);
    const chosen = candidates[0]?.data;
    if (chosen) {
      validate({ identifier: WAVE_PHONE_IDENTIFIER, version: 1, scope: 'global', savedAt: Date.now(), data: chosen });
      replaceVariables(
        { ...local, ...klona(chosen), wave_phone_global_saved_at: candidates[0].savedAt },
        { type: 'global' },
      );
      SillyTavern.extensionSettings[STORAGE_KEY] = {
        version: 1,
        globals: klona(chosen),
        savedAt: candidates[0].savedAt,
      };
      phoneStorageStatus.savedAt = candidates[0].savedAt;
      void Promise.resolve(SillyTavern.saveSettingsDebounced()).catch(report);
    }
  })()
    .catch(error => {
      loaded.delete('global');
      report(error);
      throw error;
    })
    .finally(() => {
      globalLoading = undefined;
    });
  return globalLoading;
}

/** Recover only this card/chat. Failed reads stop initialization instead of creating an empty replacement. */
const chatPreparations = new Map<string, Promise<void>>();
export function preparePhoneChat(context: RuntimeContext): Promise<void> {
  const scope = chatScope(context);
  const existing = chatPreparations.get(scope);
  if (existing) return existing;
  const preparing = restorePhoneChat(context).finally(() => chatPreparations.delete(scope));
  chatPreparations.set(scope, preparing);
  return preparing;
}
async function restorePhoneChat(context: RuntimeContext): Promise<void> {
  if (!supported()) return;
  const scope = chatScope(context);
  const known = pending.get(scope) || snapshots.get(scope);
  if (loaded.has(scope)) {
    const variables = getVariables({ type: 'chat' });
    const raw = variables[CHAT_VARIABLE_KEY];
    if (
      raw?.cardKey === context.cardKey &&
      raw?.chatKey === context.chatKey &&
      Number(variables.wave_phone_saved_at || 0) >= (known?.savedAt || 0)
    )
      return;
  }
  const server = pending.get(scope) || (loaded.has(scope) ? snapshots.get(scope) : await readServer(scope));
  const current = getRuntimeContext();
  if (!current || chatScope(current) !== scope) return;
  const variables = getVariables({ type: 'chat' });
  const raw = variables[CHAT_VARIABLE_KEY];
  const local = raw ? ChatStateSchema.safeParse(raw) : undefined;
  const revision = Number(variables.wave_phone_saved_at || 0);
  const matchingLocal =
    local?.success && local.data.cardKey === context.cardKey && local.data.chatKey === context.chatKey;
  if (server && (!matchingLocal || server.savedAt > revision)) {
    replaceVariables(
      { ...variables, [CHAT_VARIABLE_KEY]: klona(server.data), wave_phone_saved_at: server.savedAt },
      { type: 'chat' },
    );
    phoneStorageStatus.recovery = '已从服务器存档恢复当前聊天。';
  } else if (raw && !local?.success) throw Error('当前聊天存档损坏，未用空数据覆盖；请导入备份恢复');
}

export function writePhoneChat(data: Record<string, any>): void {
  const current = getRuntimeContext();
  if (!current || data.cardKey !== current.cardKey || data.chatKey !== current.chatKey)
    throw Error('聊天已切换，已阻止旧数据写入当前聊天');
  const savedAt = queue(chatScope(current), data);
  const local = getVariables({ type: 'chat' });
  if (local.wave_phone_saved_at === savedAt && isEqual(local[CHAT_VARIABLE_KEY], data)) return;
  replaceVariables({ ...local, [CHAT_VARIABLE_KEY]: klona(data), wave_phone_saved_at: savedAt }, { type: 'chat' });
}

export async function flushPhoneStorage(drain = true): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  if (!supported()) return;
  if (flushing) {
    await flushing;
    if (pending.size && drain) return flushPhoneStorage();
    scheduleStorage();
    return;
  }
  flushing = (async () => {
    for (const [scope, snapshot] of [...pending]) {
      if (!loaded.has(scope)) await readServer(scope);
      const slot = slots.get(scope) === 0 ? 1 : 0;
      const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
      const chunks: string[] = [];
      for (let offset = 0; offset < bytes.length; offset += 8192)
        chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
      const response = await request('/api/files/upload', {
        method: 'POST',
        headers: SillyTavern.getRequestHeaders(),
        body: JSON.stringify({ name: filename(scope, slot), data: btoa(chunks.join('')) }),
      });
      if (!response.ok) throw Error(`服务器保存失败 (${response.status})，请重试保存`);
      const result = await response.json();
      if (typeof result.path !== 'string' || !result.path) throw Error('服务器未确认存档路径');
      slots.set(scope, slot);
      remember(scope, snapshot, slot);
      phoneStorageStatus.savedAt = snapshot.savedAt;
      if (pending.get(scope) === snapshot) pending.delete(scope);
      phoneStorageStatus.pending = pending.size;
    }
    phoneStorageStatus.error = '';
  })()
    .catch(error => {
      report(error);
      throw error;
    })
    .finally(() => {
      flushing = undefined;
    });
  await flushing;
  if (pending.size && drain) await flushPhoneStorage();
  else scheduleStorage();
}
