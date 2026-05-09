## 1. 数据模型与迁移

- [x] 1.1 在 `src/services/account/claudeAccountService.js` 的 `createAccount` 增加 `axiosRefreshEnabled='false'` / `axiosCloudflareConfirmed='false'` / `axiosLastBlockedAt=''` / `axiosBlockedReason=''` 默认字段（claudeAiOauth 路径与旧格式路径都写）
- [x] 1.2 在 `updateAccount` 中接受这两个字段的更新；服务端校验 `axiosRefreshEnabled='true'` 必须配 `axiosCloudflareConfirmed='true'`，否则 throw 400-class 错误
- [x] 1.3 在 `src/app.js`（或对应启动钩子）增加 idempotent migration：扫描所有 Claude 账号，对缺失 `axiosRefreshEnabled` 字段的账号写 `'false'`；产出一行 info 日志 "axios opt-in defaults written to N accounts"
- [x] 1.4 在 SQLite metadata backend（若启用）确认新字段通过 hybrid `data` JSON 落盘，不需要 schema migration；写一个本地手动测试笔记验证字段往返不丢
- [x] 1.5 在管理后台 `/admin/claude-accounts/:id` 的 GET 响应里把 4 个新字段透出（去掉敏感字段过滤白名单可能挡掉的情况）

## 2. Cloudflare 检测器

- [x] 2.1 在 `src/services/account/claudeAccountService.js` 增加内部 helper `_isCloudflareBlocked(response)`：接收 axios response（或 error.response），返回 true/false。仅在 `status` 非 200 时执行检测
- [x] 2.2 检测规则：`status === 403` 且（headers 中存在 `cf-mitigated`/`cf-ray`/`server: cloudflare` 任一，或 body 是字符串且匹配 `/Cloudflare|Ray ID|Attention Required|cf-error/i`）
- [x] 2.3 写一个内部 helper `_extractCloudflareReason(response)`：返回 `Cloudflare WAF blocked direct OAuth call (cf-ray=...)` 风格的字符串，cf-ray 缺失时省略 ray id

## 3. 失败分类与处置矩阵

- [x] 3.1 修改 `_classifyRefreshError(err, ctx)`，新增 `'cloudflare_blocked'` 枚举；优先级：CF 检测在 invalid_grant 之前
- [x] 3.2 把 `_axiosRefresh` 的非 200 响应分支改造：先 `_isCloudflareBlocked` 判断，CF 命中则 throw 一个携带 `categoryHint='cloudflare_blocked'` 的 Error
- [x] 3.3 修改 `_classifyRefreshError` 接受 axios error 携带的 `categoryHint`，优先使用之
- [x] 3.4 在 CLI 循环里，把 `lastErrorCategory` 的赋值改为：
  - `cliSubprocessError && file accessToken 未变` → 当前 attempt 标记 `cli_subprocess`，同时累计到一个 boolean `hadAnySubprocessError=true`
  - `cliSubprocessError 无 && file accessToken 未变` → 当前 attempt 标记 `cli_no_op`
- [x] 3.5 CLI 三次耗尽后、进入 axios 之前，根据 `hadAnySubprocessError` 决定 "如果不进 axios" 时的最终 category：true → `cli_subprocess`，false → `cli_no_op`。把它存到 `cliExhaustedCategory` 变量里
- [x] 3.6 加 axios 门控判断：读账号 `axiosRefreshEnabled` / `axiosCloudflareConfirmed`，两者都是 'true' 才进 axios；否则把 `lastErrorCategory = cliExhaustedCategory` 然后 throw
- [x] 3.7 catch 块新增 `cloudflare_blocked` 处置分支：
  - `markTempUnavailable(accountId, 'claude-official', 503, ...)`
  - 原子写账号 hash：`axiosRefreshEnabled='false'`, `axiosCloudflareConfirmed='false'`, `axiosLastBlockedAt=ISO`, `axiosBlockedReason=...`
  - 不写 `status='error'`，不发凭据 webhook
  - 发 `CLAUDE_REFRESH_CLOUDFLARE_BLOCKED` webhook
- [x] 3.8 catch 块的 `cli_no_op` 分支改为：写 `status='error'` + `errorMessage='CLI cannot refresh token (file refresh_token rejected)'`，发 `CLAUDE_REFRESH_CLI_NO_OP` webhook（受 `disableAutoProtection` 豁免）
- [x] 3.9 catch 块的 `cli_subprocess` 分支改为：调 `markTempUnavailable`（短冷却），不写 `status='error'`，不发 webhook
- [x] 3.10 删除 catch 块里那个 "理论上已被 axios 兜底替换，保底逻辑" 的 else 分支（替换为显式按 cli_subprocess / cli_no_op 分发）

## 4. Webhook 类型扩展

- [x] 4.1 在 `src/utils/webhookNotifier.js` 增加 `CLAUDE_REFRESH_CLI_NO_OP` 与 `CLAUDE_REFRESH_CLOUDFLARE_BLOCKED` 两个 errorCode 类型；正确传递到 `sendAccountAnomalyNotification`
- [x] 4.2 在 `tokenRefreshLogger.logRefreshError` 调用点把 `category` 字段加入日志结构（如果尚未传），便于后续按 category 检索

## 5. 简化 `getValidAccessToken` & `claudeRelayService`

- [x] 5.1 这两处当前调用 `refreshTokenViaCredentials(accountId, trigger)` 的逻辑不需要修改——失败矩阵在 `refreshTokenViaCredentials` 内部处置，调用方仍然只看 `success`。本任务作为显式确认（验证后打 [x]）

## 6. 后端 API & 校验

- [x] 6.1 在 admin claude-accounts PUT 路由（或 service `updateAccount`）增加服务端校验：payload 含 `axiosRefreshEnabled='true'` 且 `axiosCloudflareConfirmed !== 'true'` 时，返回 400 + 明确错误消息 `axiosRefreshEnabled requires axiosCloudflareConfirmed=true`
- [x] 6.2 GET 单账号详情 / 列表响应中暴露 `axiosLastBlockedAt` / `axiosBlockedReason`（敏感性低，无需脱敏）

## 7. 前端 UI

- [x] 7.1 在 `web/admin-spa/src/views/accounts/...` 的 Claude 账号编辑表单里新增 "Token 刷新策略" 区块；CLI 路径标记为 "始终启用"，不可关
- [x] 7.2 增加可折叠 "直连 OAuth 兜底（高级）" 面板，默认折叠
- [x] 7.3 面板内部按设计草图渲染：
  - 风险提示（4 条 bullets：CF 拦截风险、403 错误归类问题、refresh_token 漂移、CLI 退化）
  - "如何验证不被 Cloudflare 拦截" 提示与 `curl` 示例
  - `axiosCloudflareConfirmed` 勾选框
  - `axiosRefreshEnabled` 开关，初始灰显
- [x] 7.4 实现交互：勾选确认 → 开关激活；取消勾选 → 强制开关回 off
- [x] 7.5 在面板顶部条件渲染：若 `axiosLastBlockedAt` 非空，显示红色警告横幅，包含时间和 `axiosBlockedReason`
- [x] 7.6 表单提交前在前端再做一次 invariant 校验（`enabled=true && confirmed=false` → 阻止提交并提示）
- [x] 7.7 暗黑模式适配（`dark:` 前缀），保持玻璃态风格
- [x] 7.8 文案中文化（与 `CLAUDE.md` 现有风格一致）

## 8. 单元测试

- [x] 8.1 扩展 `tests/services/account/claudeAccountService.refresh.test.js`
- [x] 8.2 测试：axios 关 + CLI ×3 全 no-op → cli_no_op → status='error' + webhook 类型 `CLAUDE_REFRESH_CLI_NO_OP`
- [x] 8.3 测试：axios 关 + CLI ×3 含 subprocess error → cli_subprocess → markTempUnavailable + 不写 status + 不发 credential webhook
- [x] 8.4 测试：axios 关 + CLI ×3 全 subprocess error → cli_subprocess（同上）
- [x] 8.5 测试：axios 关 + CLI ×3 mix(no-op + subprocess) → cli_subprocess（保守倾斜）
- [x] 8.6 测试：axios 开 + CLI ×3 失败 + axios 200 → 现状路径 success
- [x] 8.7 测试：axios 开 + axios 403 with `cf-ray` header → cloudflare_blocked → markTempUnavailable + axios 字段被自动重置 + 发 `CLAUDE_REFRESH_CLOUDFLARE_BLOCKED` webhook + 不发 credential webhook
- [x] 8.8 测试：axios 开 + axios 403 with body 含 'Attention Required' 但无 cf-ray header → 仍归 cloudflare_blocked
- [x] 8.9 测试：axios 开 + axios 200 with cf-ray header（合法转发）→ success，不归 cloudflare_blocked，axios 字段不变
- [x] 8.10 测试：axios 开 + axios 4xx invalid_grant 无 CF 特征 → invalid_grant，按现状 status='error'
- [x] 8.11 测试：disableAutoProtection=true + cli_no_op → 跳过 status='error'，仅 recordErrorHistory，但仍发 webhook
- [x] 8.12 测试：disableAutoProtection=true + cloudflare_blocked → axios 字段仍被重置（不是 status 变化，不受 disableAutoProtection 影响）

## 9. 后端校验测试

- [x] 9.1 加测试覆盖 `updateAccount` 校验：payload `enabled=true && confirmed=false` 应抛错；`enabled=true && confirmed=true` 通过；`enabled=false` 总是通过
- [x] 9.2 加测试覆盖启动 migration：mock 一组旧账号缺字段，跑 migration，验证字段被填 'false' 且其它字段不变

## 10. 集成验证与上线

- [x] 10.1 `npm run lint` 与 `npm run format` 全通过（仅检查本变更触及的文件）
- [x] 10.2 `npm test` 全部通过；新增 12 个测试全绿
- [ ] 10.3 启动服务，在管理后台手工创建一个新 Claude 账号，验证默认 axios 关 + 勾选交互正常
- [ ] 10.4 修改一个现有账号开 axios（确认勾选 → 开关 → 保存），验证 Redis 字段写入正确
- [ ] 10.5 模拟 CF 拦截（mock `_axiosRefresh` 抛 403 含 cf-ray），验证账号字段被自动重置 + UI 警告条出现
- [ ] 10.6 模拟 CLI 永久 no-op（手工把 `~/.claude/.credentials.json` 设为不可写或 stub `execFileAsync` 让文件不变），axios 关时验证账号 status='error' + webhook 触发
- [ ] 10.7 在 `redesign-claude-token-refresh-with-cli-priority` 归档之后再归档本变更（顺序在 PR 描述写明）

## 11. 文档与归档

- [x] 11.1 更新 `CLAUDE.md` 故障排除表 "Token 刷新失败" 行，增加 axios 开关与 CF 拦截两个排查方向
- [ ] 11.2 PR merge 后运行 `openspec archive gate-axios-refresh-with-cloudflare-confirmation`
