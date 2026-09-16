# 电波小手机（Electric Phone）

> 版本：P1 开发中

仿手机系统的 AI 角色聊天 Web/PWA 应用，采用移动端优先设计，兼容 Android、iOS 与桌面浏览器。

## 酒馆助手版本

当前可运行的酒馆助手脚本源码位于 [`tavern-helper`](./tavern-helper)，版本化生产构建位于 [`file`](./file)。该版本包含完整的电波手机界面、聊天与多应用数据同步、ZIP 备份恢复以及移动端全屏适配。

酒馆助手在线导入：

```js
import 'https://cdn.jsdelivr.net/gh/colerith/Electric-Phone@v1.1.6/file/index-1.1.6.js';
```

发布与更新步骤见 [`tavern-helper/发布流程.md`](./tavern-helper/发布流程.md)。

## 当前内容

- 首页 P1：4×6 iOS 风格桌面、4×4 大组件、2×2 时间组件、App Dock 与左右翻页。
- 中文主视觉与电波系蓝粉配色。
- 状态栏和小组件共享设备时间或自定义世界时间。
- PWA manifest、Service Worker、iOS/Android 安全区适配。
- 酒馆助手脚本源码及可直接导入的构建文件。
- 产品需求、架构、里程碑与 UI 参考资源。

## 本地预览

```powershell
cd app
npm install
npm run dev
```

按终端提示打开本地地址，通常为 `http://localhost:3000/`。

## 构建

```powershell
cd app
npm run build
npm run start
```

详细工程说明见 [`app/README.md`](./app/README.md)，产品需求见 [`需求文档.md`](./需求文档.md)。

---

&copy; 2026 电波系，仅供内部交流。
