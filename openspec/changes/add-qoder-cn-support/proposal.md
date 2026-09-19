# Proposal

## Why

9Router 目前只支持国际版 Qoder（`qoder` / 别名 `qd`，走 api3.qoder.sh）。QoderWork 国内版（Qoder CN）是独立产品线，使用完全不同的网关（gateway.qoder.com.cn）、设备授权参数与客户端身份字段，现有实现无法登录、无法列出模型、无法发起聊天。

上游 PR #2952（`feat(qoder): deep protocol module`）曾尝试引入 CN 支持，但它基于 v0.5.45，而当前主分支已是 v0.5.81；PR 把 `open-sse/shared/qoder/` 整体重命名为 `open-sse/protocol/qoder/`，与本分支在 v0.5.45 之后新增的 attachments、contextTier、sse 等文件产生结构性冲突（8 个冲突文件），直接合并会丢失主分支的 PAT 支持、计费阻断探测、附件改写、上下文档位、usage 上报等修复。

因此本变更以主分支代码为基础，按 PR 的能力目标补齐 CN 支持，不执行目录级重构。

## What Changes

- 新增 Qoder CN 提供商 `qoderwork-cn`（别名 `qdcn`），仅支持设备 OAuth 登录。
- 新增地区 profile 机制：`getQoderProfile(credentials)` 通过 `provider` 或 `providerSpecificData.qoderRegion` 识别地区，所有 CN/intl 分支据此选择端点与参数，intl 路径行为逐字节不变。
- CN 聊天走 `gateway.qoder.com.cn`：`Cosy-Clienttype=6`、`session_type=qoder_work`、`business.product=qoder_work`、`business.stage=init`、`model_config` 精简为 CN 桌面端十个字段，并透传 `reasoning_effort` / `max_thinking_tokens` / `tool_choice` / `context_length`。
- CN 支持设备令牌刷新（`openapi.qoder.com.cn/api/v1/deviceToken/refresh`），intl 设备令牌刷新维持不提供（用户重新登录）。
- CN 配额解析支持三层（user / addOn / organization），配额端点要求 `User-Agent: QoderWork`。
- CN 模型目录在 dashboard 与 `/v1/models` 中实时解析（与 intl 缓存隔离），静态兜底清单与 CN 网关实时目录对齐（14 个模型）。
- CN 提供商复用 intl 的头像资源与主题色。
- 修正 Cosy 头部：`Cosy-Machineos` 由运行平台与架构推导（不再硬编码），`Cosy-Machineid`（登录 UUID）与 `Cosy-Machinetoken`（可选 SecurityGuard UMID）分离。
- 新增 `tests/unit/qoder-cn.test.js` 覆盖上述行为，并同步刷新 provider/alias 基线快照。

不包含：PR 中的 `open-sse/protocol/qoder/` 目录重构、签到与活动功能。

## Capabilities

### New Capabilities

- `qoder-cn-provider`: Qoder CN（QoderWork 国内版）作为 9Router 提供商的完整能力——设备授权登录、模型目录解析、聊天请求的地区差异注入、金额/配额查询、令牌刷新、连接测试，以及与 intl Qoder 的隔离要求。

### Modified Capabilities

无。仓库当前没有任何既有 spec（`openspec list --specs` 返回空），本次为首个能力规格。

## Impact

受影响代码：

- 协议与执行器：`open-sse/shared/qoder/{profiles.js,constants.js,cosy.js,attachments.js}`、`open-sse/executors/{qoder.js,index.js}`、`open-sse/services/qoderModels.js`、`open-sse/providers/{capabilities.js,thinkingLevels.js}`、`open-sse/providers/registry/{qoderwork-cn.js,index.js}`、`open-sse/translator/concerns/thinkingUnified.js`
- OAuth：`src/lib/oauth/providers/{qoderwork-cn.js,qoder.js,index.js}`、`src/lib/oauth/services/qoder.js`、`src/app/api/oauth/[provider]/[action]/route.js`、`src/shared/components/OAuthModal.js`
- 令牌刷新与用量：`open-sse/services/tokenRefresh/{providers.js,tokenRefresh.js}`、`open-sse/services/usage/{misc.js,usage.js}`、`src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js`
- 模型列表与测试：`src/app/api/providers/[id]/{models,test}/route.js|testUtils.js`、`src/app/api/v1/models/route.js`
- UI：`src/shared/utils/providerIcon.js`
- 测试与基线：`tests/unit/qoder-cn.test.js`、`tests/__baseline__/{providers-baseline.json,alias-baseline.json}`

对外接口：

- 新增 OpenAI 兼容模型前缀 `qdcn/<model>`（如 `qdcn/dfmodel`）。
- 新增提供商 id `qoderwork-cn` 与其 OAuth 动作路由。
- 不修改任何既有 intl Qoder 的端点、参数与响应结构。

系统与依赖：

- 无新增 npm 依赖。
- 部署侧需要 CN 账号完成一次真实设备授权登录（服务器为无界面环境，需在用户浏览器完成）。
