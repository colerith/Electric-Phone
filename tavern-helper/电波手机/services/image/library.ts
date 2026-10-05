import { z } from 'zod';
export const ImageSubjectSchema = z.enum(['character', 'user', 'other_character', 'scene', 'object']);
export const ImageVersionSchema = z.object({
  id: z.string(),
  url: z.string(),
  prompt: z.string().default(''),
  description: z.string().default(''),
});
export const ImageAssetSchema = z.object({
  prompt: z.string().max(12000).default(''),
  description: z.string().max(1000).default(''),
  subject: ImageSubjectSchema.default('other_character'),
  profileId: z.string().default(''),
  versions: z.array(ImageVersionSchema).default([]),
  selected: z.string().default(''),
  status: z.enum(['idle', 'pending', 'complete', 'failed']).default('idle'),
  error: z.string().default(''),
});
export type ImageAsset = z.infer<typeof ImageAssetSchema>;
export type ImageTarget =
  | { kind: 'message'; threadId: string; messageId: string; index: number }
  | { kind: 'moment'; postId: string; index: number };
export function imageTargetKey(target: ImageTarget): string {
  return JSON.stringify(
    target.kind === 'message' ? [target.threadId, target.messageId, target.index] : [target.postId, target.index],
  );
}
export function selectedImage(asset: ImageAsset) {
  return asset.versions.find(version => version.id === asset.selected) || asset.versions.at(-1);
}
