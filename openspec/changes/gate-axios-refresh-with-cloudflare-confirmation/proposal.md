## Why

`redesign-claude-token-refresh-with-cli-priority`（in-progress 中）让 axios OAuth refresh_token grant 在 CLI 三次失败后自动兜底。这有两个不可接受的副作用：

1. **CLI 路径永久退化**：每次 axios 兜底成功，Anthropic 服务端会旋转 refresh_token，Redis 同步更新，但 `~/.claude/.credentials.json` 不能被我们写。下次 CLI 用文件里的旧 refresh_token → 401 → 永远 no-op → 永远落到 axios。运维侧无信号、无告警。
2. **Cloudflare 误分类下线**：Anthropic OAuth 端点在 Cloudflare WAF 后。被拦截的部署（数据中心 IP、被滥用过的 IP 段）会收到 403 + Cloudflare HTML body。当前 `_classifyRefreshError` 把所有 4xx 归为 `invalid_grant`，触发 `status='error'` 把好账号下线，并发凭据失效 webhook。这是一个现成的故障模式：**只要部署出口被 CF 挡，axios 兜底跑过一次就会下线账号**。

设计目标：让 axios 兜底从隐式总是开变成显式选项，要求管理员明确知情同意（确认未被 CF 拦截）才能启用，并独立识别 CF 拦截避免误下线。

## What Changes

- **BREAKING**: axios OAuth fallback 默认关闭，且依赖账户级 `axiosRefreshEnabled` + `axiosCloudflareConfirmed` 双开关。一次性切关，旧账号迁移后 axios 默认禁用。
- 在 `refreshTokenViaCredentials` CLI 三次耗尽分支增加门控：
  - 仅当 `axiosRefreshEnabled === 'true'` 且 `axiosCloudflareConfirmed === 'true'` 才进入 axios 兜底
  - 否则按 CLI 失败的具体子分类（`cli_subprocess` / `cli_no_op`）执行处置
- 失败矩阵新增 `cloudflare_blocked` 分类：检测 axios 响应中的 CF 特征（`cf-mitigated` / `cf-ray` 头、403 + body 含 `Cloudflare`/`Ray ID`/`Attention Required`），独立处置（短冷却 + 在账号上记录拦截标识，**不**写 `status='error'`，**不**发凭据失效 webhook）
- 失败矩阵区分 `cli_subprocess`（短冷却，临时机器问题）与 `cli_no_op`（`status='error'`，CLI 真没工作）
- 检测到 Cloudflare 拦截时，自动把 `axiosRefreshEnabled` 重置为 `false`，账号上写 `axiosLastBlockedAt` / `axiosBlockedReason`
- 账号编辑页 / API 增加 `axiosRefreshEnabled` / `axiosCloudflareConfirmed` 两个字段：
  - UI 强制 "Cloudflare 不拦截" 勾选 + 显示风险提示后才能开启 axios
  - 显示最近一次 CF 拦截时间和原因（若有）
- Webhook：新增 `CLAUDE_REFRESH_CLI_NO_OP` 类型（CLI 永久失效，需 re-login），与 `CLAUDE_REFRESH_INVALID_GRANT` 区分
- 不修改 `~/.claude/.credentials.json`（保持现有 PROHIBITED 约束）

## Capabilities

### New Capabilities

无。本变更扩展已有 `claude-token-refresh` 能力，不引入独立的能力域。

### Modified Capabilities

- `claude-token-refresh`: 新增 axios 默认禁用 + Cloudflare 确认门控、Cloudflare 拦截独立分类、`cli_subprocess` vs `cli_no_op` 处置区分三条 SHALL 要求；修改原有"axios 在 CLI 失败后自动兜底"语义为"显式启用后才兜底"。

> **依赖说明**：本变更修改的能力来自 `redesign-claude-token-refresh-with-cli-priority`（目前 in-progress）。需在该 change 归档（即 `openspec/specs/claude-token-refresh/spec.md` 落地）后再归档本 change，或两个 change 顺序合并归档。

## Impact

**代码**：
- `src/services/account/claudeAccountService.js` — `refreshTokenViaCredentials`（CLI 耗尽分支门控）、`_classifyRefreshError`（新增 `cloudflare_blocked`）、`_axiosRefresh`（CF 检测）、catch 块失败矩阵（`cli_subprocess` 与 `cli_no_op` 区分处置、CF 自动关闭 axios）、`createAccount` / `updateAccount`（新增字段）
- `src/utils/tokenRefreshLogger.js` — 失败日志增加 `category` 字段
- `src/utils/webhookNotifier.js` — 新增 `CLAUDE_REFRESH_CLI_NO_OP` 类型
- 前端 `web/admin-spa/src/views/accounts/...`（Claude 账号编辑表单）— 加 axios 开关 + CF 确认勾选 + 风险提示 + 拦截历史显示

**数据**：账号 hash 新增字段 `axiosRefreshEnabled` / `axiosCloudflareConfirmed` / `axiosLastBlockedAt` / `axiosBlockedReason`。SQLite metadata backend 同步处理（hybrid schema 落 JSON）。

**迁移**：所有现存 Claude 账号一次性写入 `axiosRefreshEnabled='false'` / `axiosCloudflareConfirmed='false'`。运行 `npm run setup` 或独立 migration 脚本完成。

**行为变化**：
- 现网默认全部进入"仅 CLI"模式。CLI 真有问题的账号会立刻 `status='error'`，触发管理员介入（修 CLI / 开 axios / 换代理）。
- 隐式 axios 兜底依赖结束。
- CF 拦截不再误下线账号。

**测试**：补充 `claudeAccountService.refresh.test.js` 覆盖：axios 关时 CLI 耗尽 → cli_no_op→`status='error'` / cli_subprocess→`temp_unavailable`；axios 开 + CF 拦截 → 自动关闭 + 短冷却；axios 开 + CF 未拦截 → 走旧路径。

**文档**：`CLAUDE.md` 故障排除表更新；管理后台账户编辑页文案。
