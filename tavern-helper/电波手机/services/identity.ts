import type { ChatState, Identity } from '../schemas';

export type RuntimeContext = {
  cardKey: string;
  chatKey: string;
  cardName: string;
  avatar: string;
  isGroup: boolean;
};

function safePart(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function getRuntimeContext(): RuntimeContext | null {
  const chatKey = String(SillyTavern.getCurrentChatId() || '').trim();
  if (!chatKey) return null;

  const groupId = String(SillyTavern.groupId || '').trim();
  const characterId = String(SillyTavern.characterId || '').trim();
  const card = getCharData('current');
  const avatar = String(getCharAvatarPath('current') || card?.avatar || '').trim();
  const cardName = String(card?.name || '未命名角色').trim();
  const cardKey = groupId
    ? `group:${safePart(groupId)}`
    : characterId
      ? `character:${safePart(characterId)}`
      : avatar
        ? `avatar:${safePart(avatar)}`
        : '';

  if (!cardKey) return null;
  return { cardKey, chatKey, cardName, avatar, isGroup: Boolean(groupId) };
}

export function makeCharKey(stableId: string, name: string): string {
  const id = safePart(stableId);
  if (id) return `id:${id}`;
  const normalizedName = safePart(name);
  return normalizedName ? `name:${normalizedName}` : '';
}

export function makeThreadId(context: RuntimeContext, charKey: string): string {
  return `${context.cardKey}::${context.chatKey}::${charKey}`;
}

export function findIdentityByName(state: ChatState, name: string): Identity | null {
  const normalized = safePart(name);
  if (!normalized) return null;
  return Object.values(state.identities).find(identity => safePart(identity.name) === normalized) ?? null;
}

export function makeSingleCardIdentity(context: RuntimeContext, existing?: Identity): Identity {
  const now = new Date().toISOString();
  const charKey = existing?.charKey || `single:${context.cardKey}`;
  return {
    charKey,
    stableId: context.cardKey,
    name: context.cardName,
    avatar: existing?.avatarCustomized ? existing.avatar : context.avatar,
    avatarZoom: existing?.avatarZoom || 1,
    avatarOffsetX: existing?.avatarOffsetX || 0,
    avatarOffsetY: existing?.avatarOffsetY || 0,
    remark: existing?.remark || '',
    avatarCustomized: existing?.avatarCustomized || false,
    source: 'auto_single_card',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function createParsedIdentity(
  context: RuntimeContext,
  state: ChatState,
  input: { stableId: string; name: string; messageId: number; ordinal: number },
): Identity {
  const now = new Date().toISOString();
  const byName = findIdentityByName(state, input.name);
  const stableKey = makeCharKey(input.stableId, input.name);
  const existing = (stableKey && state.identities[stableKey]) || byName;
  const charKey = existing?.charKey || stableKey || `unknown:${input.messageId}:${input.ordinal}`;
  const fallbackName = context.isGroup ? `待认领终端 ${input.ordinal}` : context.cardName;
  return {
    charKey,
    stableId: input.stableId || existing?.stableId || '',
    name: input.name || existing?.name || fallbackName,
    avatar: existing?.avatar || (!context.isGroup ? context.avatar : ''),
    avatarZoom: existing?.avatarZoom || 1,
    avatarOffsetX: existing?.avatarOffsetX || 0,
    avatarOffsetY: existing?.avatarOffsetY || 0,
    remark: existing?.remark || '',
    avatarCustomized: existing?.avatarCustomized || false,
    source: input.name || input.stableId ? 'parsed' : 'temporary',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

/** Display-only alias; stable identity and generation still use the canonical name. */
export function displayIdentityName(identity: Pick<Identity, 'name' | 'remark'> | null | undefined): string {
  return identity?.remark.trim() || identity?.name || 'TA';
}
