# Tasks

## 1. 用量处理器解析

- [x] 1.1 在 open-sse/services/usage/misc.js 的 getQoderUsage 中解析 addOnQuota：响应携带该字段时输出 `quotas.addOn`（total / used / remaining / unit / resetAt）→ 验证：单测断言 intl 与 CN 两种响应形状下 addOn 层数值正确
- [x] 1.2 响应不含 addOnQuota 时不输出 addOn 键，且 user / organization 层输出形状不变 → 验证：单测断言 `usage.quotas.addOn` 为 undefined

## 2. 仪表盘渲染

- [x] 2.1 在 ProviderLimits/utils.js 的 parseQuotaData（qoder / qoder-cn 分支）将 addOn 层映射为显示名 "Add-on"，organization 层 total 为 0 时继续隐藏 → 验证：单测断言行名为 ["Personal", "Add-on"]、Add-on 行数值 200/400

## 3. 回归测试

- [x] 3.1 新增 tests/unit/qoder-usage-addon.test.js，覆盖 intl 免费档、CN 试用档、CN 免费档三个真实账号响应形状与渲染断言 → 验证：npx vitest run unit/qoder-usage-addon.test.js 全部通过
- [x] 3.2 运行 usage 相关既有测试并做全量基线对比 → 验证：unit/usage-dispatch.test.js 通过；全量失败集与干净 master 对比无新增回归

## 4. 构建与部署

- [x] 4.1 本地构建补丁版 CLI 包（cli/scripts/build-cli.js + npm pack），核验产物含 addOnQuota 代码 → 验证：构建产物 grep 命中 addOnQuota；上传服务器后 MD5 与本机一致
- [x] 4.2 部署 ser1：停旧服务、npm i -g 本地 tgz、nohup setsid 启动 → 验证：服务就绪（/api/auth/status 返回 200）、安装产物含补丁、进程存活

## 5. 线上验收与提交

- [x] 5.1 线上核验：/api/usage 三个连接均返回 addOn 层；仪表盘 Quota Tracker 显示 Add-on 行；公网 /v1/models 正常 → 验证：接口实测输出与无头浏览器文本断言
- [x] 5.2 提交 OpenSpec 文档与修复并推送 GitHub（fix/qoder-addon-quota 分支）→ 验证：远端 ref 与本地 HEAD 一致
