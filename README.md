<div align="center">

<img src="docs/logos/logo-full.png" alt="Metapi" width="280">

**中转站的中转站 — 将分散的 AI 中转站聚合为一个统一网关**

<p>
把你在各处注册的 New API / One API / OneHub / DoneHub / Veloera / AnyRouter / Sub2API 等站点，
<br>
汇聚成 <strong>一个 API Key、一个入口</strong>，自动发现模型、智能路由、成本最优。
</p>


<p align="center">
<a href="https://github.com/jiqinga/metapi/releases">
  <img alt="GitHub Release" src="https://img.shields.io/github/v/release/jiqinga/metapi?label=Release&logo=github&style=flat">
</a><a href="https://github.com/jiqinga/metapi/stargazers">
  <img alt="GitHub Stars" src="https://img.shields.io/github/stars/jiqinga/metapi?style=flat&logo=github&label=Stars">
</a><a href="https://hub.docker.com/r/jiqinga/metapi">
  <img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/jiqinga/metapi?style=flat&logo=docker&label=Docker%20Pulls">
</a><a href="https://github.com/jiqinga/metapi">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-brightgreen?style=flat">
</a><img alt="Node.js" src="https://img.shields.io/badge/Node.js-22.15%2B-339933?logo=node.js&style=flat"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&style=flat">
</p>

<p align="center">
  <a href="README.md"><strong>中文</strong></a> |
  <a href="README_EN.md">English</a>
</p>

<p align="center">
  <a href="./docs/index.md"><strong>📚 文档</strong></a> ·
  <a href="./docs/getting-started.md">快速上手</a> ·
  <a href="./docs/deployment.md">部署指南</a> ·
  <a href="./docs/configuration.md">配置说明</a> ·
  <a href="./docs/client-integration.md">客户端接入</a> ·
  <a href="./docs/faq.md">常见问题</a>
</p>

</div>

---

## 📖 介绍

现在 AI 生态里有越来越多基于 New API / One API 系列的聚合中转站，要管理多个站点的余额、模型列表和 API 密钥，往往既分散又费时。

**Metapi** 作为这些中转站之上的**元聚合层（Meta-Aggregation Layer）**，把多个站点统一到 **一个入口（可按项目配置多个下游 API Key）**——下游所有工具（Cursor、Claude Code、Codex、Open WebUI 等）即可无感接入全部模型。当前支持的上游范围已经不止传统聚合面板，还包括：

- 聚合面板： [New API](https://github.com/QuantumNous/new-api)、[One API](https://github.com/songquanpeng/one-api)、[OneHub](https://github.com/MartialBE/one-hub)、[DoneHub](https://github.com/deanxv/done-hub)、[Veloera](https://github.com/Veloera/Veloera)、[AnyRouter](https://anyrouter.top)、[Sub2API](https://github.com/Wei-Shaw/sub2api)
- 通用兼容接口：OpenAI / Claude / Gemini compatible endpoints，以及 `cliproxyapi` / CPA、[OrcaRouter](https://www.orcarouter.ai)
- 官方预设：阿里云 / 智谱 / 豆包 Coding Plan，DeepSeek，Moonshot(Kimi)，MiniMax，ModelScope，OrcaRouter
- OAuth 连接：Codex、Claude、Gemini CLI、Antigravity

详细接法见 [上游接入](./docs/upstream-integration.md) 与 [OAuth 管理](./docs/oauth.md)。

> **ℹ️ 本分支说明**：本仓库（`jiqinga/metapi`）在原版基础上做了大量增强与裁剪，包括用量分析、代理调试追踪、双层模型禁用、站点级并发控制等，详见下方[核心功能](#-核心功能)与[相对原版的增强](#-相对原版的增强)。

| 痛点                                  | Metapi 怎么解决                                                        |
| ------------------------------------- | ---------------------------------------------------------------------- |
| 🔑 每个站点一个 Key，下游工具配置一堆 | **统一代理入口 + 可选多下游 Key 策略**，模型自动聚合到 `/v1/*` |
| 💸 不知道哪个站点用某个模型最便宜     | **智能路由** 自动按成本、余额、使用率选最优通道                  |
| 🔄 某个站点挂了，手动切换好麻烦       | **自动故障转移**，一个通道失败自动冷却并切到下一个               |
| 📊 余额分散在各处，不知道还剩多少     | **集中看板** 一目了然，余额不足自动告警                          |
| ✅ 每天得去各站签到领额度             | **自动签到** 定时执行，奖励自动追踪                              |
| 🤷 不知道哪个站有什么模型             | **自动模型发现**，上游新增模型零配置出现在你的模型列表里         |

---

## 🖼️ 界面预览

<table>
  <tr>
    <td align="center">
      <img src="docs/screenshots/dashboard.png" alt="dashboard" style="width:100%;height:auto;"/>
      <div><b>仪表盘</b> — 余额分布、消费趋势、系统概览</div>
    </td>
    <td align="center">
      <img src="docs/screenshots/model-marketplace.png" alt="model-marketplace" style="width:100%;height:auto;"/>
      <div><b>模型广场</b> — 跨站模型覆盖、定价对比、实测指标</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/routes.png" alt="routes" style="width:100%;height:auto;"/>
      <div><b>智能路由</b> — 多通道概率分配、成本优先选路</div>
    </td>
    <td align="center">
      <img src="docs/screenshots/accounts.png" alt="accounts" style="width:100%;height:auto;"/>
      <div><b>账号管理</b> — 多站点多账号、健康状态追踪</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/sites.png" alt="sites" style="width:100%;height:auto;"/>
      <div><b>站点管理</b> — 上游站点配置与状态一览</div>
    </td>
    <td align="center">
      <img src="docs/screenshots/tokens.png" alt="tokens" style="width:100%;height:auto;"/>
      <div><b>令牌管理</b> — API Token 生命周期管理</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/playground.png" alt="playground" style="width:100%;height:auto;"/>
      <div><b>模型操练场</b> — 在线交互式模型测试</div>
    </td>
    <td align="center">
      <img src="docs/screenshots/checkin.png" alt="checkin" style="width:100%;height:auto;"/>
      <div><b>签到记录</b> — 自动签到状态与奖励追踪</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/proxy-logs.png" alt="proxy-logs" style="width:100%;height:auto;"/>
      <div><b>使用日志</b> — 代理请求日志与成本明细</div>
    </td>
    <td align="center">
      <img src="docs/screenshots/monitor.png" alt="monitor" style="width:100%;height:auto;"/>
      <div><b>可用性监控</b> — 通道健康度实时监测</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/settings.png" alt="settings" style="width:100%;height:auto;"/>
      <div><b>系统设置</b> — 全局参数与安全配置</div>
    </td>
    <td align="center">
      <img src="docs/screenshots/notification-settings.png" alt="notification-settings" style="width:100%;height:auto;"/>
      <div><b>通知设置</b> — 多渠道告警与推送配置</div>
    </td>
  </tr>
</table>

---

## 🏛️ 架构概览

<div align="center">
  <img src="docs/screenshots/metapi-architecture.png" alt="Metapi: Federated AI Model Aggregation Gateway Architecture" style="max-width: 100%; height: auto;" />
</div>

---

## ✨ 核心功能

### 🌐 统一代理网关

- 兼容 **OpenAI** 与 **Claude** 下游格式，对接所有主流客户端
- 支持 Responses / Chat Completions / Messages / Completions（Legacy）/ Embeddings / Images / Models / Rerank，以及标准 `/v1/files` 文件接口
- 完整的 SSE 流式传输支持，自动格式转换（OpenAI ⇄ Claude）
- Gemini 原生接口桥接：带工具调用历史的请求自动走 Gemini 原生 API 并处理 thought signature

### 🧠 智能路由引擎

- 自动发现所有上游站点的可用模型，**零配置**生成路由表
- 四级成本信号：**实测成本 → 账号配置成本 → 目录参考价 → 默认兜底**
- 多通道概率分摊，基于成本（40%）、余额（30%）、使用率（30%）加权分配
- 站点级并发控制：为单个站点配置最大并发数，超限请求排队等待可用槽位
- 失败通道自动冷却与避让（默认 10 分钟冷却期）
- 请求失败自动重试，自动切换其他可用通道
- 路由决策可视化解释，每次选择透明可审计

<div align="center">
  <img src="docs/screenshots/routes.png" alt="smart-routing-detail" width="700"/>
  <p><sub>智能路由配置界面 — 支持精确匹配、通配符、概率分配等多种路由策略</sub></p>
</div>

### 📡 多平台聚合管理

| 平台                | 适配器        | 说明                 |
| ------------------- | ------------- | -------------------- |
| **New API**   | `new-api`   | 新一代大模型网关     |
| **One API**   | `one-api`   | 经典 OpenAI 接口聚合 |
| **OneHub**    | `onehub`    | One API 增强分支     |
| **DoneHub**   | `done-hub`  | OneHub 增强分支      |
| **Veloera**   | `veloera`   | API 网关平台         |
| **AnyRouter** | `anyrouter` | 通用路由平台         |
| **Sub2API**   | `sub2api`   | 订阅制中转平台       |
| **OrcaRouter** | `orcarouter` | 官方 OpenAI 兼容网关 |

各平台适配器覆盖模型枚举、代理接入等通用能力；余额查询和 Token 管理仅在上游提供相应接口的平台可用（OrcaRouter 目前不提供这两项能力）；登录、签到、用户信息等能力按平台而异。

### 👥 账号与 Token 管理

- **多站点多账号**：每个站点可添加多个账号，每个账号可持有多个 API Token
- **双层模型禁用**：账号级（连接级）与站点级模型禁用独立配置、并集生效，精准控制每个连接可用的模型
- **健康状态追踪**：`healthy` / `unhealthy` / `degraded` / `disabled` 四级状态机，支持按账号查看可用性与模型级调用/延迟明细
- **凭证加密存储**：所有敏感凭证均加密保存在本地数据库中
- **自动续签**：Token 过期时自动重新登录获取新凭证
- **站点联动**：禁用站点自动级联禁用所有关联账号
- **模型上下文长度**：自动从上游发现并透出各模型 `context_length`，支持手动删除误报模型

### 🏪 模型广场

- 跨站点模型覆盖总览：哪些模型可用、多少账号覆盖、各站定价对比
- 延迟、成功率等实测指标展示
- 上游模型目录缓存与品牌分类（OpenAI、Anthropic、Google、DeepSeek 等）
- 交互式模型测试器，在线验证模型可用性

<div align="center">
  <img src="docs/screenshots/model-marketplace.png" alt="model-marketplace-detail" width="700"/>
  <p><sub>模型广场 — 一站式浏览所有可用模型的覆盖率、定价和性能指标</sub></p>
</div>

### ✅ 自动签到

- Cron 定时执行（默认每日 08:00）
- 智能解析奖励金额，签到失败自动通知
- 按账号启用/禁用控制
- 完整签到日志与历史查询
- 并发锁防止重复签到

### 💰 余额管理

- 定时余额刷新（默认每小时），批量更新所有活跃账号
- 收入追踪：每日/累计收入与消费趋势分析
- 余额兜底估算：API 不可用时通过代理日志推算余额变动
- 凭证过期自动重新登录

### 🔔 告警通知

支持五种通知渠道：

| 渠道                   | 说明              |
| ---------------------- | ----------------- |
| **Webhook**      | 自定义 HTTP 推送  |
| **Bark**         | iOS 推送通知      |
| **Server酱**     | 微信通知          |
| **Telegram Bot** | Telegram 消息通知 |
| **SMTP 邮件**    | 标准邮件通知      |

告警场景：余额不足预警、站点/账号异常、签到失败、代理请求失败、Token 过期提醒、每日摘要报告。告警冷却机制（默认 300 秒）防止重复通知。

### 📊 数据看板与用量分析

- 站点余额饼图、每日消费趋势图
- **GitHub 风格贡献热力图**：每日代理请求量一年全景
- **独立用量分析页**：总览 / 站点 / 模型 / 下游 Key / 客户端 / 账号 / Token 构成 七个维度的用量拆解
- 全局搜索（站点、账号、模型），站点与账号列表支持模糊搜索 + 服务端分页
- 系统事件日志、代理请求日志（模型、状态、延迟、Token 用量、成本估算、实际上游端点）

<div align="center">
  <img src="docs/screenshots/dashboard.png" alt="dashboard-detail" width="700"/>
  <p><sub>数据看板 — 余额分布、消费趋势、系统健康状态一目了然</sub></p>
</div>

### 🎮 模型操练场

- 交互式聊天测试，即时验证模型可用性与响应质量
- 选择任意路由模型，对比不同通道输出；模型下拉按站点过滤
- 流式 / 非流式双模式测试，请求超时可配置
- **协议徽章**：基于真实代理日志展示每个模型实际使用的上游协议（chat / messages / responses）
- **调试追踪**：请求与返回左右对照，JSON 语法高亮，SSE 流式合并输出

<div align="center">
  <img src="docs/screenshots/playground.png" alt="playground-detail" width="700"/>
  <p><sub>模型操练场 — 在线交互测试，验证模型可用性与响应质量</sub></p>
</div>

### 📦 轻量部署

- **单 Docker 容器**，默认本地数据目录部署，支持外接 MySQL / PostgreSQL 运行时数据库
- Docker 镜像支持 `amd64`、`arm64` 和 `armv7l`（`linux/arm/v7`）服务端部署
- 站点配置导出导入（按平台 + 地址非破坏合并），数据完整导入导出，迁移无忧

---

## 🧩 相对原版的增强

本分支在原版 Metapi 之上持续演进，除上游改进外还包括：

- **用量分析**：独立 `/usage-analytics` 页面，7 维度使用拆解（总览/站点/模型/Key/客户端/账号/Token 构成）
- **贡献热力图**：仪表盘内 GitHub 风格的每日请求热力图
- **代理调试追踪**：操练场内可查看每次调用的请求/返回对照、JSON 高亮与 SSE 合并输出
- **模型协议徽章**：基于真实代理日志识别模型实际走的上游协议，可配置回看窗口
- **双层模型禁用**：账号级 + 站点级禁用并集生效，站点禁用模型同步过滤路由候选统计
- **站点级并发控制**：按站点限制最大并发请求数
- **Rerank 代理**：`/v1/rerank` 端点支持
- **Gemini 原生桥接**：工具调用历史自动桥接 Gemini 原生 API，thought signature 正确回传
- **结构化代理日志**：请求日志新增实际上游端点列，余额兜底推算更准确
- **签到可靠性**：识别阿里云 ESA 浏览器挑战并给出明确诊断，签到失败原因可读
- **设置页拆分**：`/settings` 按域拆分为多个子页，补齐任务开关、探测窗口等隐藏设置
- **站点/账号搜索**：列表页模糊搜索 + 服务端分页

---

## 🚀 快速开始

### Docker Compose（推荐）

```bash
mkdir metapi && cd metapi

cat > docker-compose.yml << 'EOF'
services:
  metapi:
    image: jiqinga/metapi:latest
    ports:
      - "127.0.0.1:4000:4000"
    volumes:
      - ./data:/app/data
    environment:
      AUTH_TOKEN: ${AUTH_TOKEN:?AUTH_TOKEN is required}
      PROXY_TOKEN: ${PROXY_TOKEN:?PROXY_TOKEN is required}
      CHECKIN_CRON: "${CHECKIN_CRON:-0 8 * * *}"
      BALANCE_REFRESH_CRON: "${BALANCE_REFRESH_CRON:-0 * * * *}"
      PORT: ${PORT:-4000}
      DATA_DIR: /app/data
      TZ: ${TZ:-Asia/Shanghai}
    restart: unless-stopped
EOF

# 设置 Token 并启动
# AUTH_TOKEN = 管理后台登录令牌（登录时输入此值）
export AUTH_TOKEN=your-admin-token
# PROXY_TOKEN = 下游客户端调用 /v1/* 的 Token
export PROXY_TOKEN=your-proxy-sk-token
docker compose up -d
```

<details>
<summary><strong>一行 Docker 命令</strong></summary>

```bash
docker run -d --name metapi \
  -p 4000:4000 \
  -e AUTH_TOKEN=your-admin-token \
  -e PROXY_TOKEN=your-proxy-sk-token \
  -e TZ=Asia/Shanghai \
  -v ./data:/app/data \
  --restart unless-stopped \
  jiqinga/metapi:latest
```

</details>

启动后访问 `http://localhost:4000`，用 `AUTH_TOKEN` 登录即可。

> [!NOTE]
> Docker 镜像支持 `amd64`、`arm64` 和 `armv7l`（`linux/arm/v7`）服务端部署。
> 当前 `armv7l` 支持范围仅限服务端 / Docker 运行，不包含桌面安装包。

<!-- markdownlint-disable-next-line MD028 -->
> [!IMPORTANT]
> 请务必修改 `AUTH_TOKEN` 和 `PROXY_TOKEN`，不要使用默认值。数据存储在 `./data` 目录，升级不会丢失。

> [!TIP]
> 初始管理员令牌即启动时配置的 `AUTH_TOKEN`。
> 若在 Compose 外运行且未显式设置 `AUTH_TOKEN`，默认为 `change-me-admin-token`（仅用于本地调试）。
> 桌面安装包首次启动也属于这类场景：如果你没有额外注入 `AUTH_TOKEN`，默认管理员令牌同样是 `change-me-admin-token`。
> 如果在「设置」面板中修改了管理员令牌，后续登录请使用新令牌。

Docker Compose、桌面安装包、反向代理、升级与数据库选项等详见 [部署指南](./docs/deployment.md)。

📖 **[环境变量与配置](./docs/configuration.md)** · **[客户端接入指南](./docs/client-integration.md)** · **[常见问题](./docs/faq.md)**

---

## 🏗️ 技术栈

| 层                   | 技术                                                              |
| -------------------- | ----------------------------------------------------------------- |
| **后端框架**   | [Fastify](https://fastify.dev) — 高性能 Node.js 后端框架            |
| **前端框架**   | [React 18](https://react.dev) + [Vite](https://vitejs.dev)              |
| **语言**       | [TypeScript](https://www.typescriptlang.org) — 端到端类型安全       |
| **样式**       | [Tailwind CSS v4](https://tailwindcss.com) — 原子化样式框架         |
| **数据库**     | SQLite / MySQL / PostgreSQL +[Drizzle ORM](https://orm.drizzle.team) |
| **数据可视化** | [VChart](https://visactor.io/vchart) (@visactor/react-vchart)        |
| **定时任务**   | [node-cron](https://github.com/node-cron/node-cron)                  |
| **容器化**     | Docker (Debian slim) + Docker Compose                             |
| **测试**       | [Vitest](https://vitest.dev)                                         |

---

## 🛠️ 本地开发

```bash
# 安装依赖
npm install

# 数据库迁移
npm run db:migrate

# 启动开发环境（前后端热更新）
npm run dev
```

```bash
npm run build          # 构建前端 + 后端
npm run build:web      # 仅构建前端（Vite）
npm run build:server   # 仅构建后端（TypeScript）
npm run dist:desktop:mac:intel # 构建 mac Intel (x64) 桌面安装包
npm test               # 运行全部测试
npm run test:watch     # 监听模式
npm run db:generate    # 生成 Drizzle 迁移文件
```

---

## 🔗 相关项目

### 上游兼容平台

| 项目                                            | 说明                                    |
| ----------------------------------------------- | --------------------------------------- |
| [New API](https://github.com/QuantumNous/new-api)  | 新一代大模型网关，Metapi 的主要上游之一 |
| [One API](https://github.com/songquanpeng/one-api) | 经典 OpenAI 接口聚合管理                |
| [OneHub](https://github.com/MartialBE/one-hub)     | One API 增强分支                        |
| [DoneHub](https://github.com/deanxv/done-hub)      | OneHub 增强分支                         |
| [Veloera](https://github.com/Veloera/Veloera)      | API 网关平台                            |

### 参考和使用的项目

| 项目                                                 | 说明                                                      |
| ---------------------------------------------------- | --------------------------------------------------------- |
| [All API Hub](https://github.com/qixing-jk/all-api-hub) | 浏览器扩展版 — 一站式管理中转站账号，Metapi 最初灵感来源 |
| [LLM Metadata](https://github.com/nicepkg/llm-metadata) | LLM 模型元数据库，用于模型描述参考                        |
| [New API](https://github.com/QuantumNous/new-api)       | 平台适配器参考实现                                        |

---

## 🔒 数据与隐私

Metapi 完全自托管，所有数据（账号、令牌、路由、日志）均存储在你自己的部署环境中，不会向任何第三方发送数据。代理请求仅在你的服务器与上游站点之间直连传输。

---

## 🤝 贡献

欢迎各种形式的贡献！

- 🐛 报告 Bug — [提交 Issue](https://github.com/jiqinga/metapi/issues)
- 💡 功能建议 — [发起讨论](https://github.com/jiqinga/metapi/issues)
- 🔧 代码贡献 — [提交 Pull Request](https://github.com/jiqinga/metapi/pulls)
- 📝 贡献指南 — [CONTRIBUTING.md](CONTRIBUTING.md)
- 📜 行为准则 — [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

---

## 🛡️ 安全

如发现安全问题，请参考 [SECURITY.md](SECURITY.md) 使用非公开方式报告。

---

## 📜 License

[MIT](LICENSE)

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=jiqinga/metapi&type=date&legend=top-left&v=2)](https://www.star-history.com/#jiqinga/metapi&type=date&legend=top-left)

---

<div align="center">

**⭐ 如果 Metapi 对你有帮助，给个 Star 就是最大的支持！**

</div>
