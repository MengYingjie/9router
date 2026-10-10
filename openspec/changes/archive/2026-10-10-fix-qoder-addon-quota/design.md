# Design

## Context

动机见 proposal.md。相关现状与约束：

1. 上游 decolua/9router 自 v0.5.82 引入 `qoder-cn` provider 以来，用量处理器只解析 `userQuota` 与 `orgResourcePackage`；截至 v0.5.99 仍未解析 `addOnQuota`（已在源码与构建产物中核实）。
2. 本仓库 master 采用上游代码；本修复以独立分支 fix/qoder-addon-quota 携带（1 个提交），部署采用本地构建 tgz 覆盖安装的方式，每次上游升级需将补丁 rebase 到新 master 后重新构建部署。
3. 上游配额响应为实测形状：`userQuota` 与 `addOnQuota` 均为 `{total, used, remaining, percentage, unit}`；个人账号无 `orgResourcePackage` 字段；`expiresAt` 为毫秒时间戳，免费档为公元 9999 年哨兵值。
4. 仪表盘侧 parseQuotaData 对 qoder/qoder-cn 的既有规则：organization 层 total 为 0 时隐藏；不将绝对剩余积分当百分比。

## Goals / Non-Goals

Goals:

1. 资源包（addOnQuota）余量在 /api/usage 响应与仪表盘 Quota Tracker 页可见。
2. 改动最小化：只动解析与命名两处，intl 与 CN 行为一致。
3. 补丁可低成本跟随上游升级（rebase 零冲突为目标）。

Non-Goals:

1. 不改变 user 与 organization 层的既有渲染行为（含 user 层 total 为 0 时显示 "0 / ∞" 的现状）。
2. 不向 decolua/9router 提交上游 PR（另行决定）。
3. 不改配额端点、认证或刷新逻辑。

## Decisions

1. addOn 层按需输出（响应含 `addOnQuota` 才输出 `addOn` 键），而不是恒定输出零值层。
   理由：与 organization 层的隐藏语义保持一致——空层不应产生误导性行；同时避免对不含该字段的旧响应改变输出形状。备选（恒定输出零值层）被否，因会产生 "0 / ∞" 噪音行且无信息量。

2. 显示名取 "Add-on"，与既有 "Personal" / "Organization" 命名风格一致。
   备选（"Add-on Credits" / "Resource Pack"）被否，前者与单位列冗余，后者与上游字段命名不符。

3. 不隐藏 user 层 total 为 0 的行。
   理由：user 层的 "0 / ∞" 是上游既有行为，本次修复范围外；且该行仍反映套餐额度状态，改动会扩大与上游的补丁面。备选（顺带隐藏空 user 行）被否，违反最小改动原则。

4. 补丁以独立分支 + 本地构建部署的方式携带，master 保持纯上游。
   理由：保持 master 与上游可快进同步；补丁面小（2 个源文件 + 1 个测试文件），rebase 成本低。备选（并入 master 长期携带）被否，会使 master 无法快进、每次同步需常规合并。

## Risks / Trade-offs

1. 上游若自行修复 addOnQuota（字段名或层名可能不同）→ 届时以更优实现为准，删除本补丁并回归上游实现；rebase 时如冲突，人工核对后取舍。
2. 服务器被更新为纯上游版本会导致补丁丢失、配额行再次消失（2026-10-08 已实际发生过一次）→ 部署脚本固定使用本地构建的 cnfix 包，部署后核验产物含 addOnQuota；发现丢失时按记录流程重新部署。
3. 免费档 resetAt 为公元 9999 年哨兵，仪表盘倒计时显示 "in 2912xxxd" 类长串 → 接受现状（不属本次修复范围）；如后续需要可在渲染层单独处理。
4. 该补丁未被上游采用前，每次上游升级都需要重放 → 已纳入部署流程记忆；如补丁长期存在可考虑向上游提 PR。

## Migration Plan

部署步骤（本地 Windows 构建、服务器 ser1）：

1. git 切到 fix/qoder-addon-quota 并确认含补丁提交。
2. cd cli && node scripts/build-cli.js，成功后 npm pack --pack-destination ..，得到 9router-<ver>.tgz（如报缺依赖先在仓库根目录 npm install）。
3. scp 上传至服务器 /root/，停旧服务（pkill 9router/cli.js 与 next-server），npm i -g 本地 tgz，nohup setsid 启动并等待就绪。
4. 核验：安装产物含 addOnQuota 代码；/api/usage 三个连接返回 addOn 层；仪表盘显示 Add-on 行；/v1/models 正常。

回滚：重新 npm i -g 上一版本 tgz（历史包保留在 /root）并重启。

## Open Questions

无（修复已实现并部署验证，本文档为补记）。
