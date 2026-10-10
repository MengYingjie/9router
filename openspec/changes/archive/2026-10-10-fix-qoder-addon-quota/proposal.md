# Proposal

## Why

上游 9Router（v0.5.99 及以前）的 Qoder 用量处理器只解析 `userQuota`（套餐额度）与 `orgResourcePackage`（组织资源包）两层，丢掉了 `addOnQuota`（个人资源包）层。Qoder 个人账号的套餐额度常为 0，真实可用余量都在资源包里；上游渲染结果因此显示为 "0 / ∞" 或 "13 / ∞" 加红色 0%，资源包余量完全不可见，用户误以为配额耗尽。本修复已在分支 fix/qoder-addon-quota 实现并部署验证，本次以 OpenSpec 规格形式补记该行为，使现行代码有可追溯的规格文档。

## What Changes

- 用量处理器 `getQoderUsage`（open-sse/services/usage/misc.js）：当上游配额响应携带 `addOnQuota` 字段时，解析并输出 `quotas.addOn` 层（total / used / remaining / unit / resetAt），与既有 user、organization 层并列；响应不含该字段时不输出该层。
- 仪表盘配额解析（src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js 的 parseQuotaData，qoder / qoder-cn 分支）：将 addOn 层渲染为显示名 "Add-on"；延续既有规则——user 层显示为 "Personal"，organization 层在 total 为 0 时整行隐藏，且不把绝对剩余积分当作百分比使用。
- 新增回归测试 tests/unit/qoder-usage-addon.test.js：以 intl 免费档、CN 试用档、CN 免费档三个真实账号的响应形状，验证 addOn 层解析与仪表盘行渲染。

不包含（Non-goals）：修改配额接口地址或认证方式；调整 user 与 organization 层的既有渲染规则；改动上游其他 provider 的配额行为；向 decolua/9router 提交上游 PR。

## Capabilities

### New Capabilities

- `qoder-quota-tracking`: Qoder（intl，provider id `qoder`）与 Qoder CN（provider id `qoder-cn`）两个 provider 的配额拉取与仪表盘展示行为，包括三层配额（套餐 user、资源包 addOn、组织 organization）的解析条件、展示名映射、空层隐藏规则与重置时间透传。

### Modified Capabilities

无。本分支为全新 OpenSpec 初始化，openspec/specs/ 下暂无既有能力；上游代码库不使用 OpenSpec。

## Impact

- 代码：open-sse/services/usage/misc.js（getQoderUsage）、src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js（parseQuotaData 的 qoder 分支）。
- 测试：新增 tests/unit/qoder-usage-addon.test.js；对 unit/usage-dispatch.test.js 与既有 qoder 系列测试无影响。
- 接口：/api/usage/[connectionId] 响应 quotas 对象新增可选键 addOn（仅当上游响应含 addOnQuota 时出现）；既有 user、organization 键不变。
- 界面：仪表盘 Quota Tracker 页 Qoder / Qoder CN 卡片新增 "Add-on" 配额行。
- 依赖与兼容：无新增依赖；intl 与 CN 共用同一处理路径（getQoderUsageFor），两地区行为一致；不影响其他 provider。
