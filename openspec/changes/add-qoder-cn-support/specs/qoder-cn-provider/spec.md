# Spec Delta

## Purpose

让 9Router 在保留国际版 Qoder 全部既有行为的前提下，新增 QoderWork 国内版（Qoder CN）作为一等提供商：支持设备授权登录、实时模型目录、地区专属聊天协议注入、三层配额查询、设备令牌刷新与连接测试，并保证 CN 与 intl 在端点、缓存与参数上完全隔离。

## ADDED Requirements

### Requirement: CN 提供商注册与寻址

系统 MUST 注册提供商 id `qoderwork-cn`，别名 `qdcn`，显示名 `Qoder CN`，类别为 `oauth`，且 MUST 仅声明 OAuth 认证方式（不提供 API key / PAT 入口）。CN 模型 MUST 以 `qdcn/<model-key>` 形式对外暴露，且该前缀在请求解析时 MUST 与 `qoder/`、`qoderwork-cn/` 一同被剥离，使三种写法等价。

#### Scenario: 提供商与别名可见
- **WHEN** 读取提供商注册表与别名映射
- **THEN** 存在 `qoderwork-cn` 条目，`PROVIDER_ID_TO_ALIAS` 中 `qoderwork-cn` 映射为 `qdcn`，且注册表仅含 `oauth` 认证方式

#### Scenario: 三种前缀等价寻址
- **WHEN** 客户端分别以 `qdcn/dfmodel`、`qoderwork-cn/dfmodel`、`dfmodel` 请求同一 CN 连接
- **THEN** 三者解析到同一模型键 `dfmodel` 并走同一 CN 执行路径

### Requirement: CN 设备授权登录

CN 登录 MUST 使用设备授权流程，登录页为 `https://qoder.com.cn/device/selectAccounts`，设备轮询端点为 `https://openapi.qoder.com.cn/api/v1/deviceToken/poll`。发起设备流时 MUST 携带 `client_id`（值 `1c5e33e1-364d-4ce6-b02c-acaa81274a5c`）与 `redirect_uri`（值 `qoder-work-cn://`）；轮询 MUST 走支持代理的 HTTP 通道。登录成功后 MUST 在连接数据中写入 `qoderRegion: "cn-work"`，并在账号缺少邮箱时使用 `qoderwork-cn-user-<userId>` 作为稳定合成标识，使同一账号重复登录命中同一条连接记录而非新增记录。

#### Scenario: 发起 CN 设备流
- **WHEN** 用户在仪表盘对 Qoder CN 触发 OAuth 登录
- **THEN** 设备流请求指向 CN 登录页与 CN 轮询端点，且请求参数含 CN 的 client_id 与 redirect_uri

#### Scenario: 重复登录不产生重复连接
- **WHEN** 同一 CN 账号在邮箱缺失的情况下完成两次设备授权
- **THEN** 两次登录产生相同的合成邮箱标识，连接记录被复用而非新增

### Requirement: 地区档位识别

系统 MUST 提供统一的地区识别入口，判定依据为连接数据中的 `provider === "qoderwork-cn"` 或 `providerSpecificData.qoderRegion === "cn-work"`。该入口 MUST 能被仅持有连接数据（不含 provider 字段）的调用点使用，用于选择目录端点、推理网关、配额端点与客户端身份字段。

#### Scenario: 按 provider 识别
- **WHEN** 以 `provider: "qoderwork-cn"` 调用识别入口
- **THEN** 返回 CN 档位（id 为 `cn-work`）

#### Scenario: 按连接数据识别
- **WHEN** 以 `providerSpecificData: { qoderRegion: "cn-work" }`（无 provider 字段）调用识别入口
- **THEN** 返回 CN 档位

#### Scenario: intl 连接不误判
- **WHEN** 以 `provider: "qoder"` 调用识别入口
- **THEN** 返回空，intl 路径继续使用既有常量

### Requirement: CN 聊天请求构造

CN 聊天请求 MUST 注入以下地区字段：`session_type` 为 `qoder_work`，`business.product` 为 `qoder_work`，`business.stage` 为 `init`。CN 的 `model_config` MUST 精简为十个桌面端字段：`api_key`、`display_name`、`format`、`is_reasoning`、`is_vl`、`key`、`max_input_tokens`、`model`、`source`、`url`，其中 `api_key` 与 `url` MUST 为空字符串。`parameters.reasoning_effort` MUST 按客户端传入值原样透传（含 `max` 与 `none`，不得被降级或改写）；客户端未提供时，仅当模型标记为推理模型时 MUST 兜底为 `high`。`tool_choice`、`max_thinking_tokens`、`context_length` MUST 在提供时透传。角色为 `developer` 的消息 MUST 并入 system 提示（CN 网关不接受该角色）。

#### Scenario: 注入 CN 会话标识
- **WHEN** 构造 CN 聊天请求体
- **THEN** `session_type=qoder_work`、`business.product=qoder_work`、`business.stage=init`

#### Scenario: 精简 model_config
- **WHEN** 构造 CN 聊天请求体并传入包含完整上游字段的模型配置
- **THEN** 输出 `model_config` 仅含约定的十个字段，且 `api_key` 与 `url` 为空字符串

#### Scenario: 推理档位原样透传与兜底
- **WHEN** 客户端传入 `reasoning_effort=max` 或 `none`，或未传入任何档位
- **THEN** 传入值被原样保留；未传入且模型为推理模型时结果为 `high`

#### Scenario: developer 角色归一
- **WHEN** 消息列表包含 `developer` 角色
- **THEN** 该消息内容并入 system 提示，且输出消息列表中不再出现 `developer` 角色

### Requirement: CN Cosy 签名头

CN 请求的 Cosy 头 MUST 使用 `Cosy-Clienttype=6`，`Cosy-Machineos` MUST 由运行平台与架构推导（`arm64` 归一为 `aarch64`，其余架构原样；平台 `win32` 归一为 `windows`，其余平台原样）。`Cosy-Machineid` MUST 承载登录侧机器标识，`Cosy-Machinetoken` MUST 优先使用连接数据中的机器令牌，缺失时才回退到机器标识。签名路径 MUST 按实际请求路径计算。

#### Scenario: CN 头字段取值
- **WHEN** 以 CN 连接构造 Cosy 头
- **THEN** `Cosy-Clienttype` 为 `6`，`Cosy-Machineid` 为连接中的机器标识，`Cosy-Machinetoken` 在提供机器令牌时取该令牌，未提供时回退为机器标识

### Requirement: CN 模型目录实时解析

CN 模型目录 MUST 从 `https://gateway.qoder.com.cn/algo/api/v2/model/list?Encode=1` 实时拉取（COSY 签名），目录缓存键 MUST 包含地区标识，使 CN 与 intl 的同一账号缓存互不污染。目录中标记为未启用的模型 MUST 一并缓存原始配置并计入可路由清单（上游仍接受这些键）。当实时拉取失败时，系统 MUST 回退到静态兜底清单，且 `/v1/models` 的 CN 列表 MUST 与 CN 网关实时目录对齐，当前包含 14 个模型键：`auto`、`qmodel_38max`、`qfmodel`、`qmodel_latest`、`qmodel`、`q37fmodel`、`dmodel`、`dfmodel`、`gmodel`、`gfmodel`、`gm51model`、`kmodel_latest`、`kmodel`、`mmodel`。其中 `dfmodel` 的显示名 MUST 采用 CN 网关发布的 `DeepSeek-Flash`。intl 的 `ultimate`、`performance`、`efficient`、`lite` 为国际版订阅档位，CN MUST NOT 提供。

#### Scenario: 实时目录走 CN 网关
- **WHEN** 已配置 CN 连接并请求 `/v1/models`
- **THEN** 目录拉取指向 CN 网关端点，返回的 CN 模型以 `qdcn/` 前缀列出

#### Scenario: 缓存按地区隔离
- **WHEN** 同一账号同时存在 CN 与 intl 连接并分别拉取目录
- **THEN** 两次拉取使用不同缓存键，互不覆盖

#### Scenario: 静态兜底清单对齐
- **WHEN** 未配置连接或实时拉取失败
- **THEN** 静态清单提供上述 14 个模型键，`dfmodel` 显示名为 `DeepSeek-Flash`，且不含 intl 订阅档位键

### Requirement: CN 配额查询

CN 配额查询 MUST 使用 `https://openapi.qoder.com.cn/api/v2/quota/usage`，MUST 携带 `User-Agent: QoderWork`，且结果 MUST 包含 user、addOn、organization 三层额度（每层含 total、used、remaining、unit、resetAt）。intl 的配额查询 MUST 保持原有输出结构不变（不含 addOn 层）。

#### Scenario: 三层额度返回
- **WHEN** 对 CN 连接查询配额
- **THEN** 响应包含 user、addOn、organization 三层额度数据

#### Scenario: intl 输出不变
- **WHEN** 对 intl Qoder 连接查询配额
- **THEN** 响应结构与本次变更前逐字段一致，不含 addOn 层

### Requirement: CN 设备令牌刷新

系统 MUST 通过 `https://openapi.qoder.com.cn/api/v1/deviceToken/refresh` 刷新 CN 设备令牌，响应中的 `device_token`、`token`、`access_token` 任一字段 MUST 被接受为新的访问令牌，刷新结果 MUST 更新访问令牌、刷新令牌与过期时间。HTTP 401 与 403 MUST 归类为 `invalid_grant`，其余失败 MUST 返回空值且 MUST NOT 抛出，以避免阻塞其它连接的请求。intl 设备令牌刷新 MUST 维持不提供（保持返回空值，由用户重新登录）。

#### Scenario: 成功刷新
- **WHEN** 使用有效刷新令牌调用 CN 刷新端点
- **THEN** 连接获得新的访问令牌与更新后的过期时间

#### Scenario: 无效授权归类
- **WHEN** 刷新端点返回 401 或 403
- **THEN** 结果为 `invalid_grant` 而非通用错误，且不影响其它连接

#### Scenario: intl 不提供刷新
- **WHEN** 对 intl Qoder 连接请求刷新
- **THEN** 返回空值，行为与本次变更前一致

### Requirement: CN 拒绝 PAT 凭据

CN 连接 MUST 拒绝 PAT（`pt-` 前缀）凭据：目录解析 MUST 结果为不可用，且错误信息 MUST 明确提示 CN 需使用设备 OAuth 认证。

#### Scenario: PAT 被拒绝
- **WHEN** 以 `pt-` 前缀凭据调用 CN 目录解析
- **THEN** 返回不可用，且错误信息指出 CN 仅支持设备 OAuth

### Requirement: CN 仪表盘集成

仪表盘 MUST 将 Qoder CN 作为独立提供商卡片展示，且 MUST 复用国际版 Qoder 的头像资源（`/providers/qoder.png`）与主题色（`#EC4899`）。提供商详情页 MUST 提供 CN 实时模型列表（以 `qoderwork-cn/` 前缀返回）与连接测试能力；连接测试 MUST 使用 CN userinfo 端点并携带 `QoderWork` User-Agent，且 MUST 支持通过 CN 刷新端点刷新后重试。

#### Scenario: 头像与主题色一致
- **WHEN** 打开提供商列表页
- **THEN** Qoder CN 卡片的图像地址与 Qoder 相同（`/providers/qoder.png`），背景色与 Qoder 相同

#### Scenario: CN 连接测试
- **WHEN** 在仪表盘对 CN 连接执行测试
- **THEN** 测试请求指向 CN userinfo 端点并携带 `QoderWork` User-Agent，令牌过期时通过 CN 刷新端点刷新后重试

### Requirement: 思考档位透传

CN 模型的能力表 MUST 将思考格式标记为 `qoder`，可选档位 MUST 包含 `none`、`low`、`medium`、`high`、`xhigh`、`max` 六档。对 `qoder` 格式，系统 MUST 将客户端档位原样写回 `reasoning_effort`，MUST NOT 将 `max` 压缩为其它档位；当客户端选择禁用且模型允许禁用时 MUST 写入 `none`。

#### Scenario: max 不被压缩
- **WHEN** 客户端以 `reasoning_effort=max` 请求 CN 模型
- **THEN** 输出请求体中的 `reasoning_effort` 仍为 `max`

#### Scenario: 六档可选
- **WHEN** 查询 CN 模型的思考可选级别
- **THEN** 结果包含 `max`（六档枚举 none/low/medium/high/xhigh/max 齐备）

### Requirement: intl 非回归

本变更 MUST NOT 改变国际版 Qoder 的任何可观察行为：intl 请求体的 `session_type` MUST 保持 `qodercli`、`business.product` MUST 保持 `cli`、`business.stage` MUST 保持 `start`，且 MUST NOT 注入 `reasoning_effort` 等 CN 专属参数；intl 的 PAT 交换与 `api2`/`api3` 分流 MUST 保持原状；intl 的 Cosy 头 MUST 继续使用既有常量（Clienttype=5、既有 Machineos）。既有提供商定义、别名映射与 OAuth 端点 MUST 除新增 CN 条目外逐字节不变。

#### Scenario: intl 请求体不含 CN 字段
- **WHEN** 以 intl 凭据构造聊天请求体
- **THEN** `session_type=qodercli`、`business.product=cli`、`business.stage=start` 且 `reasoning_effort` 未被注入

#### Scenario: 基线逐字节一致
- **WHEN** 变更后运行提供商与别名基线校验脚本
- **THEN** 除新增 `qoderwork-cn` 条目与 `qdcn` 别名外，其余内容与基线逐字节一致

### Requirement: 端到端可用性

部署形态下，CN 提供商 MUST 能在配置连接后完成：列出模型、发起非流式对话并获得合法 OpenAI 格式响应、发起流式对话并按 SSE 逐块返回内容、查询配额。运维侧 MUST 能在不修改任何连接数据的前提下重启服务（数据目录保留）。

#### Scenario: 非流式对话
- **WHEN** 以有效密钥调用 `POST /v1/chat/completions`，model 为 `qdcn/dfmodel`，stream 为 false
- **THEN** 返回包含 choices 与 usage 的合法响应

#### Scenario: 流式对话
- **WHEN** 以 model 为 `qdcn/dfmodel` 且 stream 为 true 发起对话
- **THEN** 服务按 SSE 分块返回内容增量直至结束标记

#### Scenario: 重启后可用
- **WHEN** 服务进程被重启
- **THEN** 端口恢复监听、登录页可访问，且既有连接的凭据与数据不丢失
