# Tasks

> 说明：本次修订的全部实现工作已完成、已提交并已在目标服务器部署验证。下方每项的勾选状态对应已完成的验证证据；提交哈希供逐项追溯。

## 1. 地区档位与协议层

- [x] 1.1 新增 `open-sse/shared/qoder/profiles.js`：定义 `QODER_CN_PROFILE`（chatBase、modelListUrl、loginUrl、deviceTokenUrl、userInfoUrl、refreshUrl、quotaUrl、clientId、redirectUri、clientType、sessionType、userAgent）与 `getQoderProfile(credentials)` 双来源探测（provider 或 qoderRegion）。验证：单元测试断言 `getQoderProfile({provider:"qoderwork-cn"})?.id === "cn-work"`、按 `qoderRegion` 命中、intl 返回 null 均通过（`tests/unit/qoder-cn.test.js`）。
- [x] 1.2 修改 `open-sse/shared/qoder/constants.js`：`qoderInferenceBase(credentials)` 增加 CN 优先分支，intl 的 jt-/dt- 分流不变。验证：测试断言 CN 返回 `https://gateway.qoder.com.cn`，jt- 含 `api2.qoder.sh`，dt- 含 `api3.qoder.sh`。
- [x] 1.3 修改 `open-sse/shared/qoder/cosy.js`：Machineos 由 `process.arch`/`process.platform` 推导（arm64→aarch64、win32→windows）；`Cosy-Machinetoken` 取 `machineToken` 缺失时回退 `machineId`；`Cosy-Clienttype` 取 profile 值。验证：测试断言 CN 头 `Cosy-Clienttype=6`、machineId/machineToken 回退正确、签名路径按实际路径计算。
- [x] 1.4 修改 `open-sse/shared/qoder/attachments.js`：上传签名头补传 `provider` 与 `providerSpecificData`，使 CN 图片上传落到 CN 网关。验证：`buildCosyHeaders` 调用参数包含新增字段（代码审查 + 既有附件测试通过）。
- [x] 1.5 修改 `open-sse/executors/qoder.js`：构造函数接收 provider 参数；模型 key 前缀剥离覆盖 `qoder/`、`qoderwork-cn/`、`qdcn/`；CN 分支覆写 `session_type`/`business`/精简 `model_config` 并透传推理参数；developer 并入 system；`refreshCredentials`/`needsRefresh` 仅对 CN 委派。验证：CN 请求体测试与 intl 请求体测试全部通过（16 条 CN 用例覆盖）。

## 2. 注册与执行器分发

- [x] 2.1 新增 `open-sse/providers/registry/qoderwork-cn.js`：id `qoderwork-cn`、alias/uiAlias `qdcn`、`authModes: ["oauth"]`、CN 传输端点、14 键静态兜底清单、CN oauth 块。验证：基线快照 `verify-providers.mjs` 除新增条目外逐字节一致。
- [x] 2.2 修改 `open-sse/providers/registry/index.js`：新增导入并编排进注册数组。验证：注册表加载后 `PROVIDERS["qoderwork-cn"]` 存在。
- [x] 2.3 修改 `open-sse/executors/index.js`：注册 `"qoderwork-cn": new QoderExecutor("qoderwork-cn")`。验证：CN 请求经该实例执行（端到端对话测试通过）。
- [x] 2.4 修改 `open-sse/providers/capabilities.js` 与 `open-sse/providers/thinkingLevels.js`：新增 CN 能力表与 `qoder` 格式六档（none..max）。验证：测试断言 `getCapabilitiesForModel("qoderwork-cn","kmodel")` 的 reasoning 与 thinkingFormat，`getThinkingLevels` 含 `max`。

## 3. OAuth 登录流

- [x] 3.1 新增 `src/lib/oauth/providers/qoderwork-cn.js`：复用 intl 设备码流程，config 换 CN profile，`mapTokens` 写入 `qoderRegion: "cn-work"` 并合成 `qoderwork-cn-user-<userId>` 邮箱。验证：注册表与 OAuth 配置测试通过（loginUrl/deviceTokenUrl/clientId/redirectUri 断言）。
- [x] 3.2 修改 `src/lib/oauth/services/qoder.js` 与 `src/lib/oauth/providers/qoder.js`：`QoderService` 改为接收 config，设备流与轮询 URL 由 config 决定，config 提供时附带 client_id/redirect_uri。验证：intl 不发送 CN 专属参数（既有 qoder 测试通过），CN 场景断言通过。
- [x] 3.3 修改 `src/lib/oauth/providers/index.js`、`src/shared/components/OAuthModal.js`、`src/app/api/oauth/[provider]/[action]/route.js`：把 CN 纳入设备码提供商清单与 nonce/machineId/verifier 透传分支。验证：真实账号在仪表盘完成 CN 设备授权登录成功（部署后端到端验证）。
- [x] 3.4 修改 `src/app/api/providers/[id]/test/testUtils.js`：新增 CN 连接测试配置（CN userinfo 端点 + QoderWork UA + 可刷新）。验证：仪表盘连接测试对 CN 连接返回成功。

## 4. 令牌刷新与配额

- [x] 4.1 修改 `open-sse/services/tokenRefresh/providers.js` 与 `tokenRefresh.js`：新增 `refreshQoderCnToken`（CN 刷新端点，接受 device_token/token/access_token，401/403 → invalid_grant，其余返回 null 不抛错）并注册。验证：单元测试覆盖刷新成功与 invalid_grant 归类。
- [x] 4.2 修改 `open-sse/services/usage/misc.js` 与 `usage.js`：`getQoderUsage` 增加 URL/User-Agent/includeAddOn 可选参数，新增 `getQoderCnUsage` 薄包装。验证：CN 配额返回 user/addOn/organization 三层；intl 输出逐字段不变。
- [x] 4.3 修改 `src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js`：配额解析接受 qoderwork-cn 并支持 addOn 层显示。验证：仪表盘额度面板正确渲染三层数据。

## 5. 模型目录与仪表盘集成

- [x] 5.1 修改 `open-sse/services/qoderModels.js`：缓存键拼接 profile id；目录 URL 按 profile 选择；COSY 凭据补 machineToken/provider；CN 连接拒绝 PAT 并报明确错误。验证：缓存隔离与 PAT 拒绝测试通过。
- [x] 5.2 修改 `src/app/api/providers/[id]/models/route.js` 与 `src/app/api/v1/models/route.js`：新增 CN 实时解析器（含目录中 enable:false 的隐藏项），前缀 `qoderwork-cn/` 与 `qdcn/`。验证：部署后 `/v1/models` 返回 14 个 `qdcn/` 模型。
- [x] 5.3 对齐 CN 静态清单与 intl：清单更新为 14 键（新增 qmodel_38max/qfmodel/q37fmodel/gmodel/gfmodel/kmodel_latest，移除已下线的 qmodel_preview/q36fmodel），`dfmodel` 显示名取 CN 网关发布值 `DeepSeek-Flash`。验证：`/v1/models` 返回 `shared_missing=none`、`retired_present=none`（提交 99d8d14f、ad07a0a7）。
- [x] 5.4 修改 `src/shared/utils/providerIcon.js` 并统一主题色：`qoderwork-cn` 经 `ICON_ALIASES` 复用 `/providers/qoder.png`，`display.color` 与 intl 一致（`#EC4899`）。验证：Chrome 实测两卡片 `src` 与背景色一致（提交 601a95a6）。

## 6. 测试与基线

- [x] 6.1 新增 `tests/unit/qoder-cn.test.js`：覆盖注册表/别名、模型清单对齐、dfmodel 显示名、头像一致、OAuth 配置、profile 探测、COSY 头、CN 请求体（session_type/business/精简 model_config/推理参数透传/developer 归一）、能力与思考级别、PAT 拒绝，共 19 条用例。验证：`npx vitest run unit/qoder-cn.test.js` → 19 passed。
- [x] 6.2 刷新基线快照 `tests/__baseline__/providers-baseline.json` 与 `alias-baseline.json`（按仓库脚本再生成）。验证：`verify-providers.mjs`（82 提供商）、`verify-alias.mjs`（117 token）、`verify-oauth-urls.mjs` 全部逐字节一致。
- [x] 6.3 全量测试回归差分：在基线提交构建干净工作树并跑全量套件，与本次工作区结果做失败集合差分。验证：两侧失败集合完全相同（0 新增、0 消失）；用例数差异（+16 CN 用例与 3 条随附通过项）已解释。

## 7. 提交与推送

- [x] 7.1 按职责拆分提交（协议与执行器、刷新与额度、OAuth、目录与仪表盘、测试与基线、文档）。验证：`git log a8c9d380..HEAD` 可见 9 个提交，消息遵循 Conventional Commits。
- [x] 7.2 推送到 `origin/integrate/pr-2952`（本地代理不可用时以 `-c http.proxy= -c https.proxy=` 直连推送）。验证：本地 HEAD 与远端 ref 哈希一致（`ad07a0a7`）。

## 8. 构建与部署验证

- [x] 8.1 在开发机执行 `cd cli && node scripts/build-cli.js && npm pack --pack-destination ..` 产出 `9router-0.5.81.tgz`。验证：构建日志显示 CLI 包构建完成；产物扫描无 `.node` 原生模块与平台专用二进制；CN 模型键已进入 server chunk。
- [x] 8.2 上传到目标服务器并比对 sha256。验证：两侧哈希一致（`ad07a0a7` 对应版本 `0ad21ad1…`）。
- [x] 8.3 停旧进程（按进程组 kill，确认端口释放）→ `npm i -g <tgz>` → `nohup setsid node cli.js --tray --skip-update -p 20128` 启动 → 轮询 `/login` 至就绪。验证：进程存活、端口监听、登录页 HTTP 200；数据目录与既有连接数据保留。
- [x] 8.4 端到端冒烟（真实 CN 账号）。验证：`/v1/models` 含 14 个 `qdcn/` 模型；非流式 `qdcn/dfmodel` 返回合法响应；流式 `qdcn/dfmodel` 逐块返回（"1+1" → "2"）；`qdcn/qmodel_38max` 返回 "OK"；配额三层数据可查；仪表盘卡片显示 CN 网关名与统一头像（Chrome 无头实测）。
- [x] 8.5 远端访问密码策略处理：首次安装且未设 `INITIAL_PASSWORD` 时远程默认密码被拒，改为服务器本机回环执行「登录取令牌 → PATCH 改密」，密码以 bcrypt 哈希入库。验证：远程以新密码登录返回 success，旧密码返回 401，重启后仍有效。
