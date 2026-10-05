import { readPhoneGlobals, writePhoneGlobals, writePhoneChat, flushPhoneStorage } from './durable-storage';
import { modularize, importModules, ModularBackupSchema, BACKUP_MODULES, type BackupModule } from './backup-modules';
import { CHARACTER_DEFAULTS_KEY, CharacterDefaultsSchema } from './character-defaults';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { klona } from 'klona';
import { z } from 'zod';
import {
  CARD_ROSTER_VARIABLE_KEY,
  CardRosterMapSchema,
  CHAT_VARIABLE_KEY,
  CharacterProfileMapSchema,
  ChatStateSchema,
  PROFILE_VARIABLE_KEY,
  SCRIPT_VARIABLE_KEY,
  ScriptSettingsSchema,
  USER_PROFILE_VARIABLE_KEY,
  WAVE_PHONE_IDENTIFIER,
  WAVE_PHONE_STORAGE_VERSION,
} from '../../schemas';
import { MomentUserProfileMapSchema } from '../space/moments';
import { getRuntimeContext } from './identity';
import { packBackupAssets, unpackBackupAssets } from './backup-assets';

const BACKUP_FORMAT = 'wave-phone-backup';
const BACKUP_FORMAT_VERSION = 1;
const MAX_ZIP_BYTES = 20 * 1024 * 1024;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

type StorageEnvelope = { identifier: string; version: number; data: unknown };

const PhoneBackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  identifier: z.literal(WAVE_PHONE_IDENTIFIER),
  storageVersion: z.number().int().positive(),
  exportedAt: z.string(),
  context: z
    .object({
      cardKey: z.string(),
      chatKey: z.string(),
      cardName: z.string(),
    })
    .nullable(),
  global: z.object({
    settings: ScriptSettingsSchema,
    characterProfiles: CharacterProfileMapSchema,
    userProfiles: MomentUserProfileMapSchema,
    cardRosters: CardRosterMapSchema,
    characterDefaults: z.record(z.string(), CharacterDefaultsSchema).optional(),
  }),
  chat: ChatStateSchema.nullable(),
});

export type PhoneBackup = z.infer<typeof PhoneBackupSchema>;

function unwrapStored(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const envelope = value as Partial<StorageEnvelope>;
  return envelope.identifier === WAVE_PHONE_IDENTIFIER ? envelope.data : undefined;
}

function envelope(data: unknown): StorageEnvelope {
  return {
    identifier: WAVE_PHONE_IDENTIFIER,
    version: WAVE_PHONE_STORAGE_VERSION,
    data: klona(data),
  };
}

function timestampName(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export function createPhoneBackup(selected?: BackupModule[]): { filename: string; blob: Blob } {
  const globalVariables = readPhoneGlobals();
  const chatVariables = getVariables({ type: 'chat' }) || {};
  const runtime = getRuntimeContext();
  const backup = PhoneBackupSchema.parse({
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    identifier: WAVE_PHONE_IDENTIFIER,
    storageVersion: WAVE_PHONE_STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    context: runtime ? { cardKey: runtime.cardKey, chatKey: runtime.chatKey, cardName: runtime.cardName } : null,
    global: {
      settings: unwrapStored(globalVariables[SCRIPT_VARIABLE_KEY]) || {},
      characterProfiles: unwrapStored(globalVariables[PROFILE_VARIABLE_KEY]) || {},
      userProfiles: unwrapStored(globalVariables[USER_PROFILE_VARIABLE_KEY]) || {},
      cardRosters: unwrapStored(globalVariables[CARD_ROSTER_VARIABLE_KEY]) || {},
      characterDefaults: unwrapStored(globalVariables[CHARACTER_DEFAULTS_KEY]) || {},
    },
    chat: chatVariables[CHAT_VARIABLE_KEY] || null,
  });
  const packed = packBackupAssets(selected ? modularize(backup, selected) : backup);
  const archive = zipSync(
    {
      ...packed.files,
      'backup.json': strToU8(JSON.stringify(packed.data, null, 2) + '\n'),
      'README.txt': strToU8(
        '格式 v3：backup.json 为 UTF-8 缩进文本；图片等内嵌资源保存在 assets/，相同资源只保存一份。请保留整个 ZIP 导入，并使用支持 v3 的电波手机版本。\n\n' +
          (selected
            ? `电波手机分模块备份：${BACKUP_MODULES.filter(item => selected.includes(item.id))
                .map(item => item.name)
                .join(
                  '、',
                )}。导入时可再次选择需要的模块。${selected.includes('general') ? '包含 API 配置，请勿公开分享含有密钥的备份。' : ''}`
            : '电波手机完整备份。包含设置、API 配置、角色与用户资料，以及导出时的当前聊天数据。请勿公开分享包含密钥的备份文件。'),
      ),
    },
    { level: 6 },
  );
  return {
    filename: `wave-phone-backup-${timestampName()}.zip`,
    blob: new Blob([archive], { type: 'application/zip' }),
  };
}

async function readBackupFile(file: File): Promise<unknown> {
  if (file.size > MAX_ZIP_BYTES) throw Error('备份 ZIP 不能超过 20MB');
  let files: ReturnType<typeof unzipSync>;
  try {
    let expandedBytes = 0;
    files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: entry => {
        expandedBytes += entry.originalSize;
        if (expandedBytes > MAX_BACKUP_BYTES) throw Error('解压后的备份内容过大');
        return entry.name === 'backup.json' || /^assets\/\d+\.[a-z0-9]+$/.test(entry.name);
      },
    });
  } catch {
    throw Error('无法读取 ZIP，请选择电波手机导出的备份文件');
  }
  const payload = files['backup.json'];
  if (!payload) throw Error('ZIP 中缺少 backup.json');
  if (payload.byteLength > MAX_BACKUP_BYTES) throw Error('解压后的备份内容过大');
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(payload));
  } catch {
    throw Error('backup.json 不是有效的 JSON');
  }
  const restored = unpackBackupAssets(raw, files, MAX_BACKUP_BYTES);
  return migrateLegacyBackupNamespace(restored);
}

/** Old backups used a volatile character-list index. Require both original card name and chat filename. */
function migrateLegacyBackupNamespace(raw: unknown): unknown {
  const runtime = getRuntimeContext();
  const candidate = raw as PhoneBackup;
  const source = candidate?.context;
  if (
    !runtime?.cardKey.startsWith('character-file:') ||
    !source ||
    !/^character:/.test(source.cardKey) ||
    source.chatKey !== runtime.chatKey ||
    source.cardName !== runtime.cardName
  )
    return raw;
  const backup = klona(raw) as PhoneBackup;
  const oldKey = source.cardKey;
  backup.context!.cardKey = runtime.cardKey;
  if (backup.chat?.cardKey === oldKey) backup.chat.cardKey = runtime.cardKey;
  if (backup.global) {
    for (const map of [backup.global.cardRosters, backup.global.characterDefaults]) {
      if (map?.[oldKey] && !map[runtime.cardKey]) map[runtime.cardKey] = klona(map[oldKey]);
    }
    for (const [key, value] of Object.entries(backup.global.characterProfiles || {})) {
      if (key.startsWith(`${oldKey}::`))
        backup.global.characterProfiles[`${runtime.cardKey}${key.slice(oldKey.length)}`] = value;
    }
  }
  return backup;
}

export async function inspectPhoneBackup(file: File): Promise<BackupModule[]> {
  const raw = await readBackupFile(file);
  if ((raw as { formatVersion?: number })?.formatVersion === 2)
    return Object.keys(ModularBackupSchema.parse(raw).modules) as BackupModule[];
  PhoneBackupSchema.parse(raw);
  return BACKUP_MODULES.map(item => item.id);
}

export async function importPhoneBackup(
  file: File,
  selected?: BackupModule[],
  afterApply?: () => Promise<void>,
): Promise<{ chatImported: boolean; message: string }> {
  const raw = await readBackupFile(file);
  if ((raw as { formatVersion?: number })?.formatVersion === 2) {
    const result = importModules(raw, selected);
    await afterApply?.();
    await flushPhoneStorage();
    return result;
  }
  const backup = PhoneBackupSchema.parse(raw);
  if (selected) {
    const result = importModules(modularize(backup, selected), selected);
    await afterApply?.();
    await flushPhoneStorage();
    return result;
  }
  if (backup.storageVersion > WAVE_PHONE_STORAGE_VERSION) throw Error('备份来自更高版本，请先更新电波手机');

  const globalVariables = readPhoneGlobals();
  writePhoneGlobals({
    ...globalVariables,
    [SCRIPT_VARIABLE_KEY]: envelope(backup.global.settings),
    [PROFILE_VARIABLE_KEY]: envelope(backup.global.characterProfiles),
    [USER_PROFILE_VARIABLE_KEY]: envelope(backup.global.userProfiles),
    [CARD_ROSTER_VARIABLE_KEY]: envelope(backup.global.cardRosters),
    ...(backup.global.characterDefaults ? { [CHARACTER_DEFAULTS_KEY]: envelope(backup.global.characterDefaults) } : {}),
  });

  const runtime = getRuntimeContext();
  const chatImported = Boolean(
    backup.chat && runtime && backup.chat.cardKey === runtime.cardKey && backup.chat.chatKey === runtime.chatKey,
  );
  if (chatImported && backup.chat) {
    writePhoneChat(klona(backup.chat));
  }
  await afterApply?.();
  await flushPhoneStorage();
  return {
    chatImported,
    message: chatImported
      ? '全局设置与当前聊天数据已恢复'
      : backup.chat
        ? '全局设置已恢复；备份所属聊天不同，未覆盖当前聊天内容'
        : '全局设置已恢复',
  };
}
