import { z } from 'zod';
import icons from '../../assets/badges/noto.json';
export const badgeCategories = [
  { id: 'mood', label: '心情' },
  { id: 'hobby', label: '兴趣' },
  { id: 'life', label: '生活' },
  { id: 'nature', label: '自然' },
  { id: 'travel', label: '远方' },
];
export const profileBadges = icons.map(icon => ({
  id: icon.id,
  label: icon.label,
  category: icon.category,
  url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.svg)}`,
}));
const ids = new Set(profileBadges.map(badge => badge.id));
export const ProfileBadgesSchema = z
  .array(z.string())
  .catch([])
  .transform(values => [...new Set(values.filter(id => ids.has(id)))].slice(0, 4));
export const ProfileTitleColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .catch('#ea91a4');
export const profileDecorationFields = {
  title: z
    .string()
    .transform(value => value.trim().slice(0, 48))
    .default(''),
  titleColor: ProfileTitleColorSchema.default('#ea91a4'),
  badges: ProfileBadgesSchema.default([]),
};
export const profileBadgePrompt = `称号 title 是符合本人气质的短称号；titleColor 用 #RRGGBB 十六进制颜色。badges 最多 4 个不同 ID，只能从以下彩色徽章库选择：${profileBadges.map(badge => `${badge.id}（${badge.label}）`).join('、')}。称号和徽章表达性格与兴趣，不代替签名，不凭空赋予真实认证身份。`;
export function titleTextColor(color: string): string {
  const hex = ProfileTitleColorSchema.parse(color).slice(1);
  const [r, g, b] = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 165 ? '#354052' : '#ffffff';
}
