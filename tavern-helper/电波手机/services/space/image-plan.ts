/** Sample once per request; retries and replay reuse the resulting counts. */
export type SpaceImagePolicy = {
  maxImages: number;
  imageProbability?: number;
  multiImageProbability?: number;
};
export function sampleImageCounts(policy: SpaceImagePolicy, posts: number, random = Math.random): number[] {
  const max = Math.max(0, Math.min(9, Math.floor(policy.maxImages)));
  return Array.from({ length: Math.max(0, Math.min(5, posts)) }, () => {
    if (!max || random() * 100 >= (policy.imageProbability ?? 60)) return 0;
    if (max === 1 || random() * 100 >= (policy.multiImageProbability ?? 50)) return 1;
    return 2 + Math.min(max - 2, Math.floor(random() * (max - 1)));
  });
}
export function imageCountRules(counts?: number[]): string {
  if (!counts) return '';
  return `[本轮配图数量已由客户端抽取] 按新帖输出顺序，每帖 images 项数必须依次为 ${JSON.stringify(counts)}。0 表示 images=[]；多图每项须为不同画面，不得只返回一张、复制同一画面凑数或自行重新抽签。仅约束新帖，保留旧帖已有图片。`;
}
