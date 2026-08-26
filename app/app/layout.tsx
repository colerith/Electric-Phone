import type { Metadata, Viewport } from 'next';
import { PwaRegistration } from '@/components/pwa/pwa-registration';
import './globals.css';

export const metadata: Metadata = {
  title: '电波机',
  description: '沉浸式 AI 角色聊天与手机世界',
  applicationName: '电波机',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '电波机' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#f8fbff',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
