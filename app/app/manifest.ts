import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '电波机',
    short_name: '电波机',
    description: '沉浸式 AI 角色聊天与手机世界',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f8fbff',
    theme_color: '#f8fbff',
    lang: 'zh-CN',
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
