import { z } from 'zod';
import icons from '../../assets/badges/noto.json';
import fluent from '../../assets/badges/fluent.json';
export const titleColors = [
  { color: '#ef858f', label: '蜜桃粉' },
  { color: '#ee9276', label: '珊瑚橙' },
  { color: '#eeb455', label: '芒果黄' },
  { color: '#8abe79', label: '青苹果' },
  { color: '#70bbb0', label: '薄荷绿' },
  { color: '#69b9d9', label: '晴空蓝' },
  { color: '#86a9e8', label: '绣球蓝' },
  { color: '#ab96d8', label: '葡萄紫' },
  { color: '#d38dbc', label: '莓果粉' },
  { color: '#ea91a4', label: '玫瑰粉' },
];
export const badgeCategories = [
  { id: 'mood', label: '心情' },
  { id: 'hobby', label: '兴趣' },
  { id: 'life', label: '生活' },
  { id: 'nature', label: '自然' },
  { id: 'travel', label: '远方' },
  { id: 'food', label: '美食' },
  { id: 'animals', label: '动物' },
  { id: 'objects', label: '小物' },
];
export const profileBadges = [...icons, ...fluent].map(icon => ({
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
export const profileBadgePrompt = `称号 title 是符合本人气质的短称号；titleColor 从这些通透色块选一个：${titleColors.map(item => item.color).join('、')}，称号文字固定白色。badges 最多 4 个不同 ID，只能从以下彩色徽章库选择：${profileBadges.map(badge => `${badge.id}（${badge.label}）`).join('、')}。称号和徽章表达性格与兴趣，不代替签名，不凭空赋予真实认证身份。`;
