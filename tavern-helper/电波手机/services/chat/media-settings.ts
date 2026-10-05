import { z } from 'zod';
import type { VoiceServices, CharacterVoice } from './speech';
import type { CharacterImage, ImageServices } from '../image/schema';
export const MediaRangeSchema = z.object({
  min: z.number().int().min(0).max(15).prefault(0),
  max: z.number().int().min(0).max(15).prefault(1),
});
export type MediaRange = z.infer<typeof MediaRangeSchema>;
export type ReplyMedia = {
  voice: MediaRange;
  image: MediaRange;
  imageProvider?: 'novelai' | 'openai';
  characterPrefix: string;
};
export const ImageRequestSchema = z.object({
  subject: z.enum(['character', 'other_character', 'scene', 'object']),
  prompt: z.string().trim().min(1).max(12000),
});
export function validateReplyMedia(
  messages: { sender: string; type: string; payload: Record<string, unknown> }[],
  media?: ReplyMedia,
) {
  if (!media) return;
  const voices = messages.filter(message => message.sender === 'char' && message.type === 'voice').length;
  const images = messages.filter(message => message.payload.imageRequest !== undefined);
  if (voices < media.voice.min || voices > media.voice.max)
    throw Error(`本轮语音必须 ${media.voice.min}–${media.voice.max} 条，实际 ${voices} 条`);
  if (images.length < media.image.min || images.length > media.image.max)
    throw Error(`本轮生图必须 ${media.image.min}–${media.image.max} 张，实际 ${images.length} 张`);
  for (const message of images) {
    if (message.sender !== 'char' || message.type !== 'image') throw Error('生图请求只能放在角色图片消息中');
    ImageRequestSchema.parse(message.payload.imageRequest);
  }
}
export function resolveReplyMedia(
  services: VoiceServices,
  images: ImageServices,
  voice: CharacterVoice | undefined,
  character: CharacterImage | undefined,
  replyMax = 15,
): ReplyMedia {
  const cap = Math.max(1, Math.min(15, replyMax));
  const range = (value: MediaRange): MediaRange => ({
    min: Math.min(cap, value.min, value.max),
    max: Math.min(cap, Math.max(value.min, value.max)),
  });
  const voiceRange =
    voice && voice.provider !== 'off' && services[voice.provider].enabled
      ? range(voice.generation || services.generation)
      : { min: 0, max: 0 };
  const profile = character?.enabled ? images.profiles.find(p => p.id === character.profileId) : undefined;
  const imageRange = profile ? range(character?.generation || images.generation) : { min: 0, max: 0 };
  // Both types occupy separate message slots. Keep effective bounds feasible under the total reply cap.
  imageRange.min = Math.min(imageRange.min, cap - voiceRange.min);
  voiceRange.max = Math.min(voiceRange.max, cap - imageRange.min);
  imageRange.max = Math.min(imageRange.max, cap - voiceRange.min);
  return {
    voice: voiceRange,
    image: imageRange,
    imageProvider: profile?.provider,
    characterPrefix: character?.prefix || '',
  };
}
