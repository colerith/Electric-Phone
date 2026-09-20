# 电波手机 · 酒馆助手脚本

这里保存电波手机的酒馆助手脚本版本。

## 目录

- `电波手机/`：完整 TypeScript、Vue、SCSS 和测试源码；运行资源已内嵌在对应源码文件中。
- `../file/index-1.1.27.js`：当前版本的生产构建，可供酒馆助手通过 jsDelivr 导入。

本次更新以红包替换输入扩展菜单中的通话，支持私聊和群聊红包、收款状态及角色按情境随机发红包；同时补充 P1/P2 样式隔离，调整备忘与涂鸦删除入口，并精简 P3 消息页资料展示。设置的内置排除标签新增 `snow`。

## 源码开发

将 `电波手机` 目录放入 Tavern Helper Template 的 `src/util/酒馆助手脚本/` 下。源码依赖模板提供的 `src/util/script.ts` 与全局类型，并额外使用 `fflate` 生成和读取 ZIP 备份：

```bash
pnpm add fflate emoji-regex @emoji-mart/data opencc-js
pnpm build:dev
```

生成结果位于 `dist/util/酒馆助手脚本/电波手机/index.js`。

为控制仓库体积，GitHub 只保存版本化生产构建，不重复保存开发构建和未压缩 PNG 原稿。

完整发布步骤见 [`发布流程.md`](./发布流程.md)。

## 数据说明

运行时配置保存在酒馆变量中，不包含在仓库源码或构建文件内。导出的 ZIP 备份可能包含 API 密钥，请勿提交或公开分享个人备份文件。
