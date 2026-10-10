import { z } from 'zod';
import { MediaRangeSchema } from '../chat/media-settings';

export const IMAGE_MODELS = {
  novelai: ['nai-diffusion-5-curated', 'nai-diffusion-5-full', 'nai-diffusion-4-5-curated', 'nai-diffusion-4-5-full'],
  openai: [
    'gpt-image-2.5-sunburst',
    'gpt-image-2.5-flare',
    'gpt-image-2',
    'gpt-image-1.5',
    'gpt-image-1',
    'gpt-image-1-mini',
  ],
};
export const ImageReferenceSchema = z.object({
  id: z.string(),
  name: z.string().prefault('参考图'),
  enabled: z.boolean().prefault(true),
  informationExtracted: z.number().min(0).max(1).prefault(1),
  image: z.string().prefault(''),
  strength: z.number().min(0).max(1).prefault(0.6),
  encodings: z
    .record(z.string(), z.object({ encoding: z.string(), infoExtracted: z.number().prefault(1) }))
    .prefault({}),
});
export const ImageProfileSchema = z.object({
  id: z.string(),
  name: z.string().prefault('生图配置'),
  provider: z.enum(['novelai', 'openai']).prefault('novelai'),
  baseUrl: z.string().prefault(''),
  apiKey: z.string().prefault(''),
  model: z.string().prefault('nai-diffusion-5-curated'),
  prefix: z.string().prefault(''),
  negative: z.string().prefault('lowres, bad anatomy, text, watermark'),
  width: z.number().int().min(256).max(2048).prefault(1024),
  height: z.number().int().min(256).max(2048).prefault(1024),
  steps: z.number().int().min(1).max(50).prefault(28),
  scale: z.number().min(0).max(10).prefault(5),
  sampler: z.string().prefault('k_euler_ancestral'),
  noiseSchedule: z.string().prefault('karras'),
  cfgRescale: z.number().min(0).max(1).prefault(0),
  seed: z.number().int().min(0).max(4294967295).prefault(0),
  normalizeRefStrength: z.boolean().prefault(true),
  vibes: z.array(ImageReferenceSchema).prefault([]),
  quality: z.enum(['auto', 'low', 'medium', 'high', 'xhigh', 'max']).prefault('auto'),
});
export const ImageServicesSchema = z
  .object({
    generation: MediaRangeSchema.prefault({ min: 0, max: 1 }),
    profiles: z.array(ImageProfileSchema).prefault([]),
  })
  .prefault({});
export type ImageServices = z.infer<typeof ImageServicesSchema>;
export const CharacterImageSchema = z
  .object({
    generation: MediaRangeSchema.nullable().prefault(null),
    enabled: z.boolean().prefault(false),
    profileId: z.string().prefault(''),
    prefix: z.string().prefault(''),
    references: z.array(ImageReferenceSchema).prefault([]),
  })
  .prefault({});
export type ImageProfile = z.infer<typeof ImageProfileSchema>;
export type ImageReference = z.infer<typeof ImageReferenceSchema>;
export type CharacterImage = z.infer<typeof CharacterImageSchema>;
