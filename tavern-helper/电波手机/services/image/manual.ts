import { z } from 'zod';
const Request = z.object({
  description: z.string().trim().min(1, '请填写图片或视频画面描述').max(1000),
  count: z.number().int().min(1).max(9),
  profileId: z.string().min(1, '请先选择生图接口'),
  kind: z.enum(['image', 'video']).default('image'),
});
export function manualImageMedia(input: z.input<typeof Request>) {
  const { description, count, profileId, kind } = Request.parse(input);
  return Array.from({ length: count }, (_, index) => ({
    kind: 'description' as const,
    url: '',
    description,
    manualGeneration: true,
    imageProfileId: profileId,
    imageRequest: {
      subject: 'other_character' as const,
      prompt: `${description}${kind === 'video' ? `\n根据以上视频描述生成第 ${index + 1}/${count} 张分镜画面，保持人物、环境和事件连续性。` : count > 1 ? `\n同一组照片中的第 ${index + 1}/${count} 张，忠实保留描述主体，用不同构图或细节呈现。` : ''}`,
    },
  }));
}
