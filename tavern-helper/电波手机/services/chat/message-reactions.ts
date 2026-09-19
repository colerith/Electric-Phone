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
