import { klona } from 'klona';
import {
  SCRIPT_VARIABLE_KEY,
  PROFILE_VARIABLE_KEY,
  USER_PROFILE_VARIABLE_KEY,
  CARD_ROSTER_VARIABLE_KEY,
  WAVE_PHONE_IDENTIFIER,
  WAVE_PHONE_STORAGE_VERSION,
  ScriptSettingsSchema,
  CharacterProfileMapSchema,
  CardRosterMapSchema,
} from '../schemas';
import { CHARACTER_DEFAULTS_KEY, CharacterDefaultsMapSchema } from '../services/core/character-defaults';
import { MomentUserProfileMapSchema } from '../services/space/moments';
import { readPhoneGlobals, writePhoneGlobals, flushPhoneStorage } from '../services/core/durable-storage';
import { getVariables, replaceVariables, legacyScripts } from './bridge';

const schemas = {
  [SCRIPT_VARIABLE_KEY]: ScriptSettingsSchema,
  [PROFILE_VARIABLE_KEY]: CharacterProfileMapSchema,
  [USER_PROFILE_VARIABLE_KEY]: MomentUserProfileMapSchema,
  [CARD_ROSTER_VARIABLE_KEY]: CardRosterMapSchema,
  [CHARACTER_DEFAULTS_KEY]: CharacterDefaultsMapSchema,
};
const unwrap = (value: any) =>
  value && typeof value === 'object' && Object.hasOwn(value, 'data') ? value.data : value;

export async function migrateScriptSettings(sourceId: string, apply: () => Promise<void>): Promise<number> {
  const scripts = legacyScripts();
  if (scripts.some(script => script.active)) throw new Error('请先在酒馆助手中停用旧电波手机脚本，再迁移设置。');
  const source = scripts.find(script => script.id === sourceId);
  if (sourceId && !source) throw new Error('所选旧脚本已不存在，请重新打开备份页选择。');
  if (!sourceId && scripts.length > 1) throw new Error('检测到多个旧脚本，请先选择迁移来源。');
  const previous = getVariables({ type: 'script' }) || {};
  const global = readPhoneGlobals();
  const data = source?.data || scripts[0]?.data || {};
  const next = { ...global };
  let count = 0;
  for (const [key, schema] of Object.entries(schemas)) {
    const value = data[key] ?? global[key] ?? previous[key];
    if (value === undefined) continue;
    const parsed = schema.safeParse(unwrap(value));
    if (!parsed.success) throw new Error('旧设置格式不兼容，尚未修改设置。请保留旧脚本并检查版本。');
    next[key] = { identifier: WAVE_PHONE_IDENTIFIER, version: WAVE_PHONE_STORAGE_VERSION, data: parsed.data };
    count++;
  }
  if (!count) throw new Error('没有找到可迁移的电波手机设置，请保留旧脚本并在原酒馆用户下操作。');
  // Validate every section before writing; keep the source and a single pre-migration snapshot.
  const cleaned = { ...previous };
  for (const key of Object.keys(schemas)) delete cleaned[key];
  replaceVariables(
    {
      ...cleaned,
      __wave_migrated: true,
      __wave_manual_migration_backup: {
        savedAt: Date.now(),
        globals: klona(Object.fromEntries(Object.entries(global).filter(([key]) => key.startsWith('wave_phone')))),
        extension: Object.fromEntries(
          Object.entries(previous).filter(([key]) => key !== '__wave_manual_migration_backup'),
        ),
      },
    },
    { type: 'script' },
  );
  next[`${SCRIPT_VARIABLE_KEY}__recovery_v2`] = {
    identifier: WAVE_PHONE_IDENTIFIER,
    version: WAVE_PHONE_STORAGE_VERSION,
    data: true,
  };
  writePhoneGlobals(next);
  await apply();
  await flushPhoneStorage();
  return count;
}
