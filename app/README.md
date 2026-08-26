# 电波机应用源码

基于 Vinext、React 19、TypeScript 和 Vite 的移动端优先 Web/PWA 工程。桌面浏览器显示手机预览画布；Android、iOS 等窄屏设备直接使用全屏布局。

## 本地运行

```bash
npm install
npm run dev
```

开发服务启动后，打开终端输出的本地网址。

## 构建与生产预览

```bash
npm run build
npm run start
```

## 当前架构

```text
app/
├─ app/                    # 路由、页面、全局样式、PWA manifest
├─ components/             # 跨功能复用组件
│  └─ pwa/                 # PWA 注册
├─ features/               # 按业务域组织的前端模块
│  └─ home/                # 首页配置与交互组件
├─ public/                 # 图标、壁纸、音效及 service worker
├─ .openai/hosting.json    # 运行环境能力声明
├─ vite.config.ts          # Vite/Vinext/Sites 配置
└─ package.json            # 开发、构建、启动命令
```

后续模块建议依次放入 `features/chat`、`features/identity`、`features/world`、`features/memory`、`features/provider`。服务端接口放在 App Router 的 Route Handlers 中，外部 AI、语音、生图服务通过 `lib/providers` 适配器接入。

## 首页时间模式

`features/home/home.config.ts` 中的 `HOME_TIME.mode` 支持：

- `device`：左上角状态栏和时间组件同步设备时间。
- `background`：两处同步显示 `backgroundTime`，用于自定义世界时间。

## 多设备策略

- 使用 `viewport-fit=cover` 与 `env(safe-area-inset-*)` 兼容 iOS 安全区。
- 480px 以下使用全屏 App 布局，桌面端保留居中的手机预览画布。
- 使用 `100dvh` 适配移动浏览器地址栏变化。
- 支持触摸滑动、键盘焦点、减少动态效果和 PWA 安装。
