# qoder-quota-tracking Specification

## Purpose

定义 Qoder（intl，provider id `qoder`）与 Qoder CN（provider id `qoder-cn`）两个 provider 的配额拉取与仪表盘展示行为：从上游配额接口解析套餐、资源包、组织三层额度，并在 Quota Tracker 页以稳定命名与空层隐藏规则展示，保证个人账号的资源包余量始终可见。

## Requirements

### Requirement: 三层配额解析

用量处理器 MUST 解析上游配额响应中的三层额度：`userQuota` 映射为 `user` 层，`addOnQuota` 映射为 `addOn` 层，`orgResourcePackage` 映射为 `organization` 层；每层 MUST 输出 `total`、`used`、`remaining`、`unit`、`resetAt` 五个字段，数值缺失时 MUST 以 0 补齐，`unit` 缺失时 MUST 取 `credits`。当响应不含 `addOnQuota` 字段时，输出 MUST 不包含 `addOn` 键。响应非 200 状态或响应体不是 JSON 时，处理器 MUST 返回带说明的 `message` 对象而不是抛出异常。

#### Scenario: 响应含 addOnQuota 时输出 addOn 层

- WHEN 上游返回 intl 免费档形状的响应（`userQuota: {total: 0, used: 0, remaining: 0}`、`addOnQuota: {total: 200, used: 0, remaining: 200}`，无 `orgResourcePackage`）
- THEN 解析结果包含 `user` 与 `addOn` 两层，其中 `addOn` 为 `{total: 200, used: 0, remaining: 200, unit: "credits"}`，`organization` 层各数值为 0

#### Scenario: 响应不含 addOnQuota 时不输出该层

- WHEN 上游返回的响应体中没有 `addOnQuota` 字段
- THEN 解析结果的 `quotas` 对象中不存在 `addOn` 键

#### Scenario: 请求失败返回说明而不抛错

- WHEN 上游配额接口返回非 200 状态码，或响应体无法解析为 JSON
- THEN 处理器返回包含 `message` 字段的对象，不抛出异常

### Requirement: 重置时间透传

解析结果中每一层配额的 `resetAt` MUST 取上游响应的 `expiresAt` 字段（毫秒时间戳）并转换为 ISO 8601 字符串；`expiresAt` 缺失、非数值或不大于 0 时 `resetAt` MUST 为 null。处理器 MUST 原样透传上游给出的时间戳，不因数值远在未来（如公元 9999 年哨兵值）而改写。

#### Scenario: 毫秒时间戳转换为 ISO

- WHEN 上游响应 `expiresAt` 为 `1791005667118`
- THEN 解析结果各层的 `resetAt` 为 `1791005667118` 对应的 ISO 8601 字符串

#### Scenario: 缺失时间戳时为 null

- WHEN 上游响应没有 `expiresAt` 字段
- THEN 解析结果各层的 `resetAt` 为 null

### Requirement: 仪表盘配额行渲染

仪表盘配额解析 MUST 对 `qoder` 与 `qoder-cn` 两个 provider 将 `user` 层渲染为显示名 `Personal`、`addOn` 层渲染为显示名 `Add-on`、`organization` 层渲染为显示名 `Organization`。`organization` 层 `total` 为 0 时 MUST 整行隐藏；`addOn` 层存在即 MUST 渲染，不因 `total` 为 0 而隐藏。渲染 MUST NOT 把绝对剩余积分（`remaining`）当作百分比使用，剩余百分比 MUST 由 `used` 与 `total` 计算。

#### Scenario: 三层齐备时渲染两行并隐藏空组织层

- WHEN 某 CN 账号解析出 `user: {total: 300, used: 300}`、`addOn: {total: 400, used: 200}`、`organization: {total: 0}`
- THEN 仪表盘渲染 `Personal`（300 / 300，0%）与 `Add-on`（200 / 400，50%）两行，且不渲染 `Organization` 行

#### Scenario: 缺少 addOn 层时仅渲染 Personal

- WHEN 解析结果只有 `user` 层且 `organization` 层 `total` 为 0
- THEN 仪表盘仅渲染 `Personal` 一行

### Requirement: intl 与 CN 地区行为一致

`qoder` 与 `qoder-cn` MUST 共用同一用量处理路径：两者各自使用注册表中配置的配额端点（intl 为 `openapi.qoder.sh`、CN 为 `openapi.qoder.com.cn`），除端点差异外解析与渲染行为 MUST 完全一致。

#### Scenario: 相同响应形状产生相同结构

- WHEN 向 intl 与 CN 分别返回字段结构相同的配额响应（均含 `userQuota` 与 `addOnQuota`）
- THEN 两次解析结果的键集合、字段类型与渲染行命名完全一致
