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

export function createPhoneBackup(): { filename: string; blob: Blob } {
  const globalVariables = getVariables({ type: 'global' }) || {};
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
  const archive = zipSync(
    {
      'backup.json': strToU8(JSON.stringify(backup)),
      'README.txt': strToU8(
        '电波手机备份。包含设置、API 配置、角色与用户资料，以及导出时的当前聊天数据。请勿公开分享包含密钥的备份文件。',
      ),
    },
    { level: 6 },
  );
  return {
    filename: `wave-phone-backup-${timestampName()}.zip`,
    blob: new Blob([archive], { type: 'application/zip' }),
  };
}

export async function importPhoneBackup(file: File): Promise<{ chatImported: boolean; message: string }> {
  if (file.size > MAX_ZIP_BYTES) throw Error('备份 ZIP 不能超过 20MB');
  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()));
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
  const backup = PhoneBackupSchema.parse(raw);
  if (backup.storageVersion > WAVE_PHONE_STORAGE_VERSION) throw Error('备份来自更高版本，请先更新电波手机');

  const globalVariables = getVariables({ type: 'global' }) || {};
  replaceVariables(
    {
      ...globalVariables,
      [SCRIPT_VARIABLE_KEY]: envelope(backup.global.settings),
      [PROFILE_VARIABLE_KEY]: envelope(backup.global.characterProfiles),
      [USER_PROFILE_VARIABLE_KEY]: envelope(backup.global.userProfiles),
      [CARD_ROSTER_VARIABLE_KEY]: envelope(backup.global.cardRosters),
      ...(backup.global.characterDefaults
        ? { [CHARACTER_DEFAULTS_KEY]: envelope(backup.global.characterDefaults) }
        : {}),
    },
    { type: 'global' },
  );

  const runtime = getRuntimeContext();
  const chatImported = Boolean(
    backup.chat && runtime && backup.chat.cardKey === runtime.cardKey && backup.chat.chatKey === runtime.chatKey,
  );
  if (chatImported && backup.chat) {
    const chatVariables = getVariables({ type: 'chat' }) || {};
    replaceVariables({ ...chatVariables, [CHAT_VARIABLE_KEY]: klona(backup.chat) }, { type: 'chat' });
  }
  return {
    chatImported,
    message: chatImported
      ? '全局设置与当前聊天数据已恢复'
      : backup.chat
        ? '全局设置已恢复；备份所属聊天不同，未覆盖当前聊天内容'
        : '全局设置已恢复',
  };
}
