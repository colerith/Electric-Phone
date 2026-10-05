import { klona } from 'klona';
import { CHAT_VARIABLE_KEY, CARD_ROSTER_VARIABLE_KEY, PROFILE_VARIABLE_KEY, ChatStateSchema } from '../../schemas';
import { CHARACTER_DEFAULTS_KEY } from './character-defaults';
import { readPhoneGlobals, writePhoneGlobals, writePhoneChat } from './durable-storage';
import type { RuntimeContext } from './identity';

/** The selected chat's metadata is evidence of ownership; never migrate by the current array index alone. */
export function migratePhoneCardNamespace(runtime: RuntimeContext): boolean {
  const saved = getVariables({ type: 'chat' })?.[CHAT_VARIABLE_KEY];
  if (!saved || saved.chatKey !== runtime.chatKey || !saved.cardKey || saved.cardKey === runtime.cardKey) return false;
  if (!runtime.cardKey.startsWith('character-file:') || !/^(character:|avatar:)/.test(saved.cardKey)) return false;
  const state = ChatStateSchema.parse(saved);
  const oldKey = state.cardKey;
  const globals = readPhoneGlobals();
  for (const key of [CARD_ROSTER_VARIABLE_KEY, CHARACTER_DEFAULTS_KEY, PROFILE_VARIABLE_KEY]) {
    const envelope = globals[key];
    if (!envelope?.data) continue;
    const data = klona(envelope.data);
    if (key === PROFILE_VARIABLE_KEY) {
      for (const [profileKey, profile] of Object.entries(data)) {
        if (profileKey.startsWith(`${oldKey}::`))
          data[`${runtime.cardKey}${profileKey.slice(oldKey.length)}`] ??= profile;
      }
    } else if (data[oldKey]) data[runtime.cardKey] ??= klona(data[oldKey]);
    // Retain old keys as migration backups until users explicitly remove them.
    globals[key] = { ...envelope, data };
  }
  state.cardKey = runtime.cardKey;
  state.threads = Object.fromEntries(
    Object.values(state.threads).map(thread => {
      thread.id = `${runtime.cardKey}::${runtime.chatKey}::${thread.charKey}`;
      return [thread.id, thread];
    }),
  );
  writePhoneGlobals(globals);
  writePhoneChat(state);
  return true;
}
