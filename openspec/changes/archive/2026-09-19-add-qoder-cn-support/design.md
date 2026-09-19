# Design

## Context

Qoder intl 与 QoderWork CN 使用同一套私有协议栈：COSY 签名（`Cosy-*` 头 + MD5 签名）、请求体编码（`qoderEncodeBody`）、SSE 信封解包（`wrapQoderSSE`）。既有实现把它们集中在 `open-sse/shared/qoder/`（constants / cosy / attachments / sse / contextTier）与 `open-sse/executors/qoder.js`，全部按 intl 端点与身份参数硬编码。

主分支在 v0.5.45 至 v0.5.81 之间新增了若干 Qoder 相关能力（PAT 端到端支持、计费阻断探测、附件改写与图片上传缓存、上下文档位、usage 归一化），这些逻辑与 CN 支持处在同一批文件里，是本次改动必须保住的既有资产。

上游 PR #2952 选择了把 `open-sse/shared/qoder/` 整体重命名为 `open-sse/protocol/qoder/` 的重构路线。该路线与主分支新增文件（attachments、contextTier、sse）产生目录级冲突，8 个文件需要人工重写，且要把上述四项数据面逻辑移植进新架构（见 proposal.md - Why）。

约束：

- intl 路径必须逐字节不变——现有 intl 用户在生产使用，任何参数漂移都可能导致上游拒绝或降级。
- 供应商侧无官方 CN SDK 或文档，端点与字段取自 PR 的逆向结论与实测（本变更部署后经真实账号验证通过）。
- 服务器为无界面环境，设备授权登录的浏览器交互必须发生在用户本机。

## Goals / Non-Goals

**Goals:**

- 用最小的结构性改动表达「同一协议、两个地区」：地区差异集中为数据（profile），分支点收敛到少数几处。
- CN 与 intl 在缓存、端点、客户端身份上完全隔离，互不污染。
- CN 走独立提供商与独立执行器实例，避免运行时共享可变状态。
- 新增能力可被单元测试直接覆盖，且为未来第三地区预留同构扩展位。

**Non-Goals:**

- 不落地 PR 的 `open-sse/protocol/qoder/` 目录重构（纯代码组织收益，风险集中在数据面）。
- 不实现签到与活动类功能（PR 明确排除）。
- 不改变 intl 的 PAT 交换链路与 `api2`/`api3` 分流规则。
- 不为 intl 增加设备令牌刷新（缺少实测依据，见 Risks）。
- 不做 CN 特有 UI 皮肤（头像与主题色直接复用 intl）。

## Decisions

### 决策 1：用地区 profile 数据表达差异，而非抽象基类或策略对象

在 `open-sse/shared/qoder/profiles.js` 定义单一常量 `QODER_CN_PROFILE`（端点、clientId、redirectUri、clientType、sessionType、userAgent）与探测函数 `getQoderProfile(credentials)`；调用点按 profile 是否存在分支。

理由：差异维度少且全是标量，Profile 常量最直接；探测函数同时支持「按 provider 判定」与「按连接数据判定」两种来源，覆盖了执行器内部只有连接数据的调用点。

被放弃的方案：为 CN 建独立执行器类或协议子模块。那会复制 COSY 签名、编码、SSE 解包逻辑，违反既有 DRY 约定，并把 intl 后续修复割裂成两份。

### 决策 2：执行器实例按 provider 参数化，两实例并列注册

`QoderExecutor` 构造函数接收 provider 名（默认 `qoder`），`open-sse/executors/index.js` 以 `"qoderwork-cn": new QoderExecutor("qoderwork-cn")` 并列注册；执行入口把 provider 写回连接数据，使下游的 profile 探测、Cosy 客户端类型、签名路径都能得到正确地区。

理由：执行器内部存在 provider 相关的配置查找（`this.config`、超时、URL 构造）与日志标签；实例级 provider 让这些查找天然正确，避免在每次调用里逐层透传 provider。

被放弃的方案：单实例按 credentials 动态判定。会让 `this.config`、日志标签等实例级状态在地区间串味。

### 决策 3：CN 分支只做「落地后覆写」，intl 分支保持原语句序列

`buildQoderRequestBody` 先按既有逻辑构造完整请求体（intl 行为不变），随后在 `getQoderProfile` 命中时覆写 `session_type`、`business.product`、`business.stage`，并把 `model_config` 重建为 CN 桌面端十字段；推理参数在同一分支内注入（`reasoning_effort` 原样透传，未提供且 `is_reasoning` 时兜底 `high`）。

理由：覆写模式让 intl 分支的代码路径逐语句不变，回归面收敛为「CN 分支是否命中」，而非「公共逻辑有没有被改坏」。

被放弃的方案：抽取公共构造器再按地区分派字段。会把 intl 的既有语句重排，产生无谓的回归风险。

### 决策 4：缓存键拼接地区标识

`open-sse/services/qoderModels.js` 的 `cacheKey` 由 `qoder:<seed>` 改为 `<profile-id 或 "qoder">:<seed>`；进程内还有 PAT→job-token 缓存与 in-flight 去重表同样按该键组织。

理由：同一账号可能同时存在 CN 与 intl 连接（同 userId 或同 refreshToken 作为 seed）。若键不含地区，先到达的一方会污染另一方，表现为「CN 拿到 intl 的模型目录」这类难排查故障。

### 决策 5：CN 走独立的令牌刷新与配额实现，复用 intl 解析逻辑但按需传参

刷新：`refreshQoderCnToken` 独立实现（CN 端点、接受 `device_token`/`token`/`access_token` 三种字段名、401/403 归类 `invalid_grant`），经 `dedupRefresh` 去重；执行器的 `refreshCredentials` 仅对 CN 委派，intl 保持返回空值。

配额：`getQoderUsage` 增加可选参数（URL、User-Agent、是否附带 addOn 层），`getQoderCnUsage` 作为薄包装传 CN 参数；intl 调用点不传新参数，输出逐字段不变。

理由：两地区响应字段名与分层结构不同，强行统一会引入条件分支到 intl 输出路径；可选参数把差异限制在调用侧。

### 决策 6：模型目录以「实时优先、静态兜底」为准，并容忍隐藏模型

静态清单镜像 CN 网关实时目录（2026-09-19 抓取，14 键），运行时对已配置连接优先走实时拉取；目录中 `enable:false` 的模型仍缓存原始配置并计入可路由清单（上游对聊天接口仍接受这些键），使仪表盘广告的清单与路由实际能力一致。

静态清单与 intl 的差异是有意的：intl 的 `ultimate`/`performance`/`efficient`/`lite` 是国际版订阅档位，CN 不提供，不虚设。

### 决策 7：头像与主题色复用 intl 资源

通过 `src/shared/utils/providerIcon.js` 的 `ICON_ALIASES` 把 `qoderwork-cn` 映射到 `qoder`，注册表 `display.color` 与 intl 一致（`#EC4899`）。

理由：CN 是同一品牌的不同区域产品线，复用既有 PNG 资产避免新增二进制与额外的 404 回退路径；`ICON_ALIASES` 是仓库既有的品牌别名机制（perplexity-agent、gitlab-duo 等已有先例）。

### 决策 8：思考档位新增 `qoder` 格式，纯透传不压缩

`open-sse/providers/thinkingLevels.js` 增加 `qoder: budgetX`（none/low/medium/high/xhigh/max 六档）；`thinkingUnified.js` 新增 `qoder` 分支，把客户端档位原样写入 `reasoning_effort`。

理由：既有 `openai` 分支会把 `max` 归一为 `xhigh`；CN 网关接受完整枚举，压缩会静默降低推理强度。语义上这是「透传」而非「归一」，独立格式名让意图在代码里自解释。

### 决策 9：developer 角色并入 system

CN 分支把 `developer` 消息内容合并进 system 提示。

理由：CN 网关不接受 `developer` 角色（实测被拒）。放在 CN 分支内，intl 的既有角色处理不变。

## Risks / Trade-offs

[CN 端点与字段取自逆向结论，缺少上游文档] → 静态清单与参数以实测为准：本变更部署后以真实 CN 账号完成了登录、目录、非流式对话、流式对话与配额验证；字段若上游漂移，优先核对 `session_type`、`business`、精简 `model_config` 三处。

[模型被静默降级] → CN 网关对请求体格式敏感，缺字段可能降级而非报错。已通过「流量实测 + 上游回显核对」验证：请求体携带 `model_config.key` 为请求的模型键，响应中的 `model` 字段由上游自报（CN 网关对会话回显 `auto`），此为上游行为而非路由错误。

[静态兜底清单随上游上新而漂移] → 运行时优先实时目录，静态清单只在无连接或拉取失败时生效；清单来源与日期已写入注册表注释，便于后续刷新时定位。

[intl 设备令牌刷新维持不提供] → PR 曾把 intl 的 refreshUrl 改为 openapi deviceToken/refresh，但缺少实测依据；在无验证前不改动，避免把「刷新失败」引入原本靠重新登录可用的路径。CN 侧则是实测可用，因此单独实现。

[远端访问默认密码被拒] → 与本变更无关的既有安全机制：首次安装且未设置 `INITIAL_PASSWORD` 时，远程用默认密码登录会被拒绝且不发放令牌。部署后已通过「服务器本机回环改密」流程解决，密码以 bcrypt 哈希入库，重启不失效。

[构建资源不足导致构建机不可用] → 目标服务器为 2 核 / 3.9G 内存 / 无 swap，`next build` 会触发 OOM 并拖死整机（本次实测发生过两次，两次都需要服务器还原）。构建改为在开发机完成，仅把打包产物（`9router-0.5.81.tgz`）上传服务器执行 `npm i -g` 覆盖安装；服务以 nohup 常驻，数据目录保留。

## Migration Plan

部署步骤（已执行并验证）：

1. 在开发机执行 `cd cli && node scripts/build-cli.js`，产物落到 `cli/app/`；随后 `npm pack --pack-destination ..` 生成 `9router-0.5.81.tgz`。
2. 校验产物：无 `.node` 原生模块、无平台专用二进制，确认 CN 模型键已进入 server chunk。
3. `scp` 上传 tgz 到服务器，比对两侧 sha256。
4. 停旧进程：按进程组 `kill -TERM`，确认 20128 端口释放（残留 `next-server` 一并终止）。
5. `npm i -g <tgz>` 覆盖安装，`node cli.js --version` 核对版本。
6. 以 `nohup setsid node cli.js --tray --skip-update -p 20128` 启动，轮询 `/login` 至就绪。
7. 冒烟：登录页 200、`/v1/models` 含 14 个 `qdcn/` 模型、真实账号非流式与流式对话、配额查询、仪表盘卡片头像与显示名。

回滚：

- 代码层：分支已按职责拆分为多个提交（`5100a346` 起），`git revert` 对应提交即可；基线快照文件随提交一起回退。
- 服务层：保留上一版 tgz 与全局安装目录，恢复旧产物并重启进程；端口与数据目录（`~/.9router`、`/var/lib/9router`）不变，连接凭据与账务数据不受影响。

## Open Questions

无。影响实现路径的未知项（CN 端点字段正确性、intl 刷新可用性、构建资源约束）已在 Risks 中给出结论或明确处置方式。
