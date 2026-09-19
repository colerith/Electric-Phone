import emojiData from '@emoji-mart/data/sets/15/native.json';
import type { PhoneMessage } from '../../schemas';
export const quickReactions = ['❤️', '🥰', '👍', '👌', '😂', '🤔'];
export const reactionLimit = 6;
const nativeEmoji = new Set(Object.values(emojiData.emojis).flatMap(emoji => emoji.skins.map(skin => skin.native)));
export function canReactToMessage(message: PhoneMessage): boolean {
  return (
    message.sender === 'char' &&
    !message.withdrawn &&
    message.type !== 'system' &&
    message.payload.interaction !== 'poke' &&
    !message.id.startsWith('legacy-')
  );
}
export function toggleMessageReaction(message: PhoneMessage, emoji: string): boolean {
  if (!canReactToMessage(message) || !nativeEmoji.has(emoji)) return false;
  const reactions = message.reactions || [];
  if (reactions.includes(emoji)) message.reactions = reactions.filter(item => item !== emoji);
  else if (reactions.length < reactionLimit) message.reactions = [...reactions, emoji];
  else return false;
  return true;
}

/** One optional emotional response per round; exact live user-message IDs only. Replays are idempotent. */
export function applyCharacterReactions(
  messages: PhoneMessage[],
  reactions: { message_id: string; emoji: string; actor_key?: string }[] | undefined,
  actorKeys: string[],
): void {
  for (const reaction of (reactions || []).slice(0, 1)) {
    const actorKey = reaction.actor_key || (actorKeys.length === 1 ? actorKeys[0] : '');
    if (!actorKey || !actorKeys.includes(actorKey) || !nativeEmoji.has(reaction.emoji)) continue;
    const target = messages.find(message => message.id === reaction.message_id);
    if (
      !target ||
      target.sender !== 'user' ||
      target.withdrawn ||
      target.status !== 'sent' ||
      target.type === 'system' ||
      target.payload.interaction === 'poke'
    )
      continue;
    const existing = target.characterReactions || [];
    if (existing.some(item => item.actorKey === actorKey)) continue;
    target.characterReactions = [...existing, { actorKey, emoji: reaction.emoji }];
  }
}
