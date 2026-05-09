## Context

`redesign-claude-token-refresh-with-cli-priority` 让 axios OAuth refresh_token grant 在 CLI 三次失败后自动兜底。线上跑了几天后两个问题浮现：

1. **CLI 路径永久退化**：每次 axios 兜底成功，Anthropic 服务端轮转 refresh_token，Redis 同步更新。但 `~/.claude/.credentials.json` 受 CLI 自管，本服务的 PROHIBITED 约束禁止写它。下一次 CLI 用文件里的旧 refresh_token → 被 OAuth 服务拒绝 → CLI 永远 no-op → 永远落到 axios。运维侧无任何信号反映 CLI 已死。

2. **Cloudflare 误下线**：Anthropic OAuth 端点 `https://console.anthropic.com/v1/oauth/token` 经 Cloudflare WAF。被 WAF 拦截的部署收到 403 + Cloudflare HTML body。当前 `_classifyRefreshError` 把所有 4xx 归 `invalid_grant`，触发 `status='error'` 把好账号下线，并发凭据失效 webhook。**只要部署出口被 CF 挡，axios 跑过一次就会下线账号**。

部署侧的现实：
- 大部分国内 VPS、被滥用过的数据中心 IP 段 → CF 拦截
- Anthropic 官方 CLI 走 OS keychain + 自己的 TLS 栈，路径不同，通常不被拦截
- 用户对自己出口 IP 是否被 CF 拦截，不一定有先验认知

## Goals / Non-Goals

**Goals:**
- axios OAuth fallback 由"隐式总是开"变为"账号级显式开关"
- 强制管理员在启用前进行 Cloudflare 不拦截的知情确认
- 失败矩阵识别 Cloudflare 拦截，独立处置（不下线账号）
- 检测到 CF 拦截时自动关闭 axios 开关 + UI 反向告警
- 区分 `cli_subprocess`（短冷却）与 `cli_no_op`（下线），让 CLI 真正失效的账号可见

**Non-Goals:**
- 不在本服务侧自动修复 `.credentials.json`（保持 PROHIBITED）
- 不实现自动 CF challenge solver、proxy rotation
- 不引入新的全局服务级开关（只在账号级别）—— 见 Decision 1
- 不修改 `getValidAccessToken` 的过期判断逻辑
- 不改变 CLI ×3 + 5s mtime poll + 退避（500/1000/2000ms）这套机制本身

## Decisions

### Decision 1: 账号级开关，不引入全局开关

**Choice**: `axiosRefreshEnabled` / `axiosCloudflareConfirmed` 作为 Claude 账号 hash 字段，每账号独立配置。

**Rationale**:
- Claude 账号本身有 `proxy` 字段。不同账号的出口 IP 可能完全不同（A 账号走干净住宅 socks5，B 账号直连数据中心）→ CF 拦截状态本就是账号级而不是部署级。
- 全局开关 + 账号覆盖的双层模型增加状态机复杂度，对最终用户的认知负担更高。
- 反例：如果某天确实需要 "全部禁用 axios" 的紧急 kill switch，可加一个全局只读字段（不在本变更范围）。

**Alternatives considered**:
- 全局开关：简单但不准确反映 per-account proxy 现实
- 双层（global default + per-account override）：太复杂，决定路径包含 4 状态

### Decision 2: 默认值与迁移 — 一次性切关

**Choice**: 上线即把所有现存 Claude 账号 `axiosRefreshEnabled` / `axiosCloudflareConfirmed` 写为 `'false'`。无缓冲期、无横幅过渡。

**Rationale**:
- 隐式 axios 兜底就是当前的故障源。保留它意味着保留风险。
- CLI 真能工作的账号切关后无感。
- CLI 已退化的账号切关后会立刻 `status='error'` → 触发管理员介入（重新登录 CLI / 主动开 axios 并确认 CF / 换代理）。这正是设计目的。
- 用渐进式（如 30 天宽限）会让 "强制知情同意" 的语义被淡化。

**Alternatives considered**:
- 30 天宽限期 + 横幅：保留风险，与设计意图相悖
- 按账号最近 7 天 axios 成功记录决定默认值：复杂、需要观察期数据；本系统当前没有这个统计

### Decision 3: Cloudflare 检测信号

**Choice**: 在 `_axiosRefresh` 收到响应（或 axios 抛错的 response）后做以下任一即归类 `cloudflare_blocked`：

- 响应 status=403
- 响应头存在 `cf-mitigated`、`cf-ray`、`server: cloudflare` 中任意一个
- 响应 body 是字符串且匹配 `/Cloudflare|Ray ID|Attention Required|cf-error/i`

注意：成功的 axios 调用也可能经过 Cloudflare（合法转发），所以**只在 status 非 200 时**做检测，避免假阳性。

**Rationale**:
- CF 的拦截响应有稳定特征头（`cf-ray`），结合 status 4xx 误报率极低。
- body 字符串匹配是 fallback，因为有些 CF 配置可能去掉特征头。
- 不去查询第三方"我的 IP 是否被 CF 拦截"接口 —— 网络可达性问题不能用第三方推断。

**Alternatives considered**:
- 在管理员开启 axios 时主动发探测请求：浪费一次请求；不能保证测试时刻和实际刷新时刻 CF 状态一致
- 仅靠 status 判断：4xx 仍含真正的 invalid_grant，会误将 invalid_grant 当 CF 拦截

### Decision 4: 失败处置矩阵的修订

```
关闭 axios 模式（默认）
  CLI ×3 全失败:
    - 全部 cli_no_op   → status='error'      （CLI 永久失效，需 re-login）
    - 含 cli_subprocess → temp_unavailable   （短冷却，可能临时机器问题）
  CLI 任一次成功 → 现状不变
  file_path_error → 现状不变（status='error'）

启用 axios 模式
  CLI ×3 全失败 → 进入 axios
    axios 200            → 现状不变
    axios cloudflare_blocked → 短冷却 + axiosRefreshEnabled='false' + 记录拦截信息
                              （不写 status='error'）
    axios invalid_grant  → 现状不变（status='error'）
    axios oauth_network  → 现状不变（短冷却）
```

**Rationale**:
- `cli_no_op` 表示文件没变 → CLI 用文件里的 refresh_token 调上游被拒 → CLI 真没工作 → 必须 surface
- `cli_subprocess` 含 timeout、ENOENT、permission denied 等机器侧瞬时问题 → 短冷却给一次自愈机会
- CF 拦截不是凭据问题，自动下线开关而不是账号

### Decision 5: CF 拦截后自动关闭 axios 开关

**Choice**: 检测到 `cloudflare_blocked` 时：
- `axiosRefreshEnabled = 'false'`（自动关）
- `axiosCloudflareConfirmed = 'false'`（自动重置确认）—— 强制管理员重新评估
- `axiosLastBlockedAt = ISO timestamp`
- `axiosBlockedReason = 'Cloudflare WAF blocked direct OAuth call (cf-ray=...)'`

**Rationale**:
- 用户明确点过"我已确认未被拦截"，但实际被拦了 → 用户的认知和现实不一致 → 不能继续按用户意图操作
- 自动关 axios 后，账号回到"仅 CLI"模式，CLI 失败会按 `cli_no_op` 处理，比一直被 CF 挡然后下线好
- 重置 `axiosCloudflareConfirmed` 是关键：下次管理员要重新开 axios，必须重新阅读警告并主动勾选

### Decision 6: UI 强制确认交互

**Choice**: 账号编辑页"Token 刷新策略"区域：
- 默认显示"通过本地 Claude CLI 刷新"——始终启用，不可关
- 折叠面板"直连 OAuth 兜底（高级）"展开后显示风险提示
- "我已确认部署出口未被 Cloudflare 拦截"勾选框
- "启用 axios 兜底"开关，只有勾选后才可激活
- 取消勾选时强制把开关回拨到关
- 显示 `axiosLastBlockedAt` / `axiosBlockedReason`（若有）

**Rationale**:
- 折叠+警告+勾选+开关四步设计来源于 GDPR 一类同意式 UI 的工业实践，避免误开
- 自动重置勾选保证了"知情同意"是一个 fresh action 而不是历史残留

## Risks / Trade-offs

- **Risk**: 大批账号切关后立刻下线，对生产流量造成冲击 → **Mitigation**: 上线前在 Redis 跑只读 dry-run 脚本统计有多少账号最近 24h 走过 axios 路径（即潜在的 CLI 退化账号）。如果数量大，先发预警通知到管理员，再上线。或者先把切关脚本作为 npm script 让运维主动跑，而不是启动时强制迁移。

- **Risk**: 管理员开了 axios 但确实被 CF 挡，自动关后 CLI 又确实退化了，账号陷入 "axios 关 + CLI 失败" 双绝境 → **Mitigation**: webhook + UI 都会显示 `cli_no_op` 与 `cloudflareBlocked` 两类信号。运维需要重新登录 CLI 同步文件态（外部行为，不在本系统）。这是真实状态，不是被设计掩盖的状态。

- **Risk**: Cloudflare 检测信号变化（CF 改了 header 名 / body 文案）导致漏检 → **Mitigation**: 检测函数集中在一个 helper，便于后续调整；漏检的最坏后果是退化为 `invalid_grant` 处置（账号被错误下线），是当前已存在的失败模式，不是新引入的。

- **Risk**: SQLite metadata backend 与 Redis 字段同步遗漏 → **Mitigation**: 字段加在账号 hash 里，hybrid schema 直接走 `data` JSON，不需要 schema migration。

- **Risk**: 现有 `redesign-claude-token-refresh-with-cli-priority` 中的 spec 还没归档到 `openspec/specs/`，本变更修改的能力依赖它先归档 → **Mitigation**: 在 PR 描述中明确归档顺序：先归档 `redesign-claude-token-refresh-with-cli-priority`，再归档本变更。如果时间不允许，把两个变更合并归档。

- **Trade-off**: 切关后某些"靠 axios 兜底维系"的账号会在管理员介入前不可路由。接受 —— 因为这就是设计目的：让真实失败可见。

## Migration Plan

1. **预热 (T-3 days)**：
   - 部署只读监控脚本统计：a) 最近 24h `logs/token-refresh.log` 中 `method: 'axios_fallback'` 的成功条目；b) 这些账号是否同时也有 `credentials_file_attempt_X` 成功条目。第一组占第二组的比例越高，说明 CLI 退化越严重。
   - 数据通报到运维 wiki，让管理员对受影响账号有预期。

2. **代码上线 (T0)**：
   - 后端 + 前端代码同时上。
   - 启动时 idempotent migration：扫描所有 Claude 账号，对没有 `axiosRefreshEnabled` 字段的写入 `'false'`；已有字段的不动。
   - 启动时再扫一遍 `disableAutoProtection=true` 的账号，写一条 info log（这些不会被切关式下线，但 UI 上仍显示新字段）。

3. **观察期 (T0..T+24h)**：
   - 每小时巡检 `status='error'` 新增计数，与历史基线对比
   - 巡检 `cli_no_op` webhook 发送量
   - 任何异常激增 → 触发回滚预案

4. **回滚预案**：
   - 紧急回滚：revert PR，重启服务。所有账号 hash 字段保留，不删除（向前兼容下次再上线）
   - 部分回滚：如果只是某批账号问题，管理员手动开 `axiosRefreshEnabled='true'` + `axiosCloudflareConfirmed='true'` 让它们继续走 axios

## Open Questions

1. **是否需要"全局 kill switch"**：紧急情况下一键禁所有账号的 axios，避免 CF 拦截爆炸。当前 Decision 1 决定不做，后续如有需要可加全局只读 config（不影响 per-account）。
2. **Cloudflare 检测的 helper 是否独立模块**：现在打算放在 `claudeAccountService.js` 里。如果 Gemini / OpenAI 等其他 platform 未来也走 axios 直连且被 CF 挡，可以提到 `src/utils/cloudflareDetector.js`。本变更暂不抽。
3. **UI 文案翻译**：管理后台目前主要是中文。本变更新增的 axios 风险提示采用中文文案。如果项目正式国际化，需要单独抽 i18n 字符串（不在本变更范围）。
4. **`disableAutoProtection=true` 账号是否豁免 axios 门控**：当前设计仍然受门控（哪怕 disableAutoProtection 也得显式开 axios）。可讨论。
5. **测试 Cloudflare 拦截分支**：单测里需要 mock `axios.post` 返回带 `cf-ray` header 的 403。这个不难，但需要确认 axios mock 框架支持自定义 response headers + body。
