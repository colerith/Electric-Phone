# v1.3.54-beta.10（2026.10.15）

- 私聊重新同步时保留接收顺序，防止现实日期与剧情日期混用导致新回复跑到顶部；修复时间结果在同步后保留。
- 新空间动态、评论和树洞日期使用基础设置中的手机时间来源，动态延迟仍按现实经过的秒数计算。
- 旧动态缺少当时的剧情时间记录，保留原日期。
- 本次仅更新前端 beta，后端无需配套更新。

# v1.3.54-beta.3（2026.10.13）

本次只更新 `beta` 分支，不推送 main，不创建正式发布。后端配套版本为 `Electric-Phone-Music v0.4.4-beta.1`。

## 新功能

- 聊天中的链接消息与普通文本网址自动生成卡片：标题、摘要、封面、站点图标与来源。每条文字最多显示 3 个链接，接近可见区域才读取，同一地址合并请求并缓存；失败可点击重试或直接打开网页。
- 解析 Open Graph、Twitter Card、JSON-LD 与普通 HTML 元信息，支持相对封面地址及短链接跳转。仅能读取公开网页；小红书、抖音、微信等站点的登录、反爬或动态渲染限制可能导致只能显示基础卡片，不保证所有网址有封面。
- 设置新增「MCP 与网页」：Jina Reader、Tavily Search、Exa Search 和自定义模板；密钥自行填写，模板默认不启用。
- 可连接并读取工具列表，查看参数格式，手动运行工具和复制结果。当前支持远程 Streamable HTTP MCP；不运行 stdio 本地命令，不含旧版 SSE 连接或 OAuth 授权流程。
- 聊天前自动检索默认关闭。启用后仅发送本轮用户输入（最多 2000 字），不附带完整历史；资料受上下文预算限制，工具失败继续聊天。排除角色卡不会检索，停止生成会取消前端等待。手动工具结果不会自动写入聊天。

## 修复

- HTTP 局域网或域名环境缺少 `crypto.subtle` 时，使用标准 SHA-256 兼容实现，解决启动时读取 `digest` 报错；资源哈希保持一致，不改变旧文件地址。
- 修复同类环境下 `crypto.randomUUID` 缺失影响头像、音色、树洞和配置创建；扩展入口按钮避免挤成竖排。
- 后端启动时自动检查网易云 XEAPI 公钥，缺失或损坏时调用上游初始化程序；首次播放等待同一初始化任务，失败限时退出并可重试。修复首次安装登录、歌单正常但播放统一 502 的问题，无需重新登录。

## 安装或切换到 beta

PC（PowerShell）与 Termux 均在 **SillyTavern 根目录**执行以下命令。需有 Git、Node.js 22+；托管酒馆需管理员操作。保留原数据，不要删除插件目录或浏览器缓存。

已有前端：

```sh
git -C public/scripts/extensions/third-party/Electric-Phone fetch origin
git -C public/scripts/extensions/third-party/Electric-Phone switch beta
git -C public/scripts/extensions/third-party/Electric-Phone pull --ff-only origin beta
```

尚未安装前端：

```sh
git clone --branch beta https://github.com/colerith/Electric-Phone.git public/scripts/extensions/third-party/Electric-Phone
```

已有后端：

```sh
git -C plugins/Electric-Phone-Music fetch origin
git -C plugins/Electric-Phone-Music switch beta
git -C plugins/Electric-Phone-Music pull --ff-only origin beta
node plugins/Electric-Phone-Music/install.mjs
```

尚未安装后端：

```sh
git clone --branch beta https://github.com/colerith/Electric-Phone-Music.git plugins/Electric-Phone-Music
node plugins/Electric-Phone-Music/install.mjs
```

安装器会安装依赖、备份并启用服务端插件配置。**重启酒馆服务器，再刷新网页**；只刷新网页不会载入新后端。Termux 按你原本的启动脚本重新启动酒馆，不需要另开 MCP 服务进程。

## 使用

进入「设置 → MCP 与网页」，点击模板，填入密钥并启用，点击「连接并获取工具」。手动调用按工具展示的 JSON 参数填写。

需要自动检索时，选搜索工具，点击「用于聊天自动检索」，核对参数中的 `{{query}}` 字段，再打开自动检索开关。Jina 的读网页工具适合 URL，普通自然语言提问应选择搜索工具。该选项只作用于电波手机独立聊天生成，不修改酒馆主聊天的工具调用能力。

自定义服务必须使用可从酒馆服务器访问的公网 HTTP(S) 地址；内网、本机与保留地址默认拒绝。若代理开启 Fake-IP DNS，应为目标站点配置真实 DNS 解析；不要通过关闭地址校验解决。认证支持 Bearer 与设置界面列出的自定义请求头。

## 数据与致谢

不升级存储协议，不清空历史、账号、歌单或资源。MCP 配置与密钥保存在当前浏览器，与所有电波手机聊天共用；不随聊天备份同步。更换浏览器或清理浏览器数据后需重新配置。

感谢反馈网易云首次安装公钥问题的用户提供复现与临时处理方式。模板依据 [Jina 官方 MCP](https://github.com/jina-ai/MCP)、[Tavily 文档](https://docs.tavily.com/documentation/mcp)、[Exa 官方 MCP](https://exa.ai/mcp)；兼容哈希使用 MIT 授权的 [noble-hashes](https://github.com/paulmillr/noble-hashes)。后端元信息解析采用 Cheerio，网络访问采用 Undici，地址检查采用 ipaddr.js；许可证随依赖保留。
