## Context

Claude 账户的 access token 刷新当前由 `src/services/account/claudeAccountService.js` 中的两条路径承担：`refreshAccountToken`（直接调用 Anthropic OAuth `refresh_token` grant）与 `refreshTokenViaCredentials`（通过 `execFile claude -p hello world` 让本地 Claude CLI 自行刷新，再读 `~/.claude/.credentials.json`）。两条路径的优先级在过去若干次 PR 中反复调整，目前的形态（`dcc44d0`）是 "OAuth 优先 → CLI fallback"，并在 CLI fallback 内部加入 `previousAccessToken === credentials.accessToken` 的内容比较以发现"假成功"。

线上观测到的失败模式：上游 API 返回 401（token 被服务端单方面失效或限流），但本地 `.credentials.json` 中的 `expiresAt` 仍在未来；CLI 据此判断"本地仍有效"不刷新；relay 检测到文件未变，抛出 `Credentials refresh did not yield a new accessToken`，账户被置 `status='error'`，调度器判定不可路由。同一抛错路径还会吞掉以下情形：CLI 子进程异常（PATH/超时/权限）、relay 与 CLI 写入的文件路径错位、读早于写。这些根因性质各异但被合并为同一种处置。

调用方 `claudeRelayService.js` 的 401 重试路径（非流式 L718 / 流式 L2411）还在外层叠加一次"未变即失败"的二次校验，使得"判失败"的逻辑分布在多处。

约束：
1. 禁止修改 `.credentials.json` 文件（CLI 的私有状态领域）。
2. CLI 命令刷新（`execFile claude -p hello world`）的优先级必须**高于** axios 直调 OAuth；只在 CLI 连续 3 次失败之后才允许 axios 兜底。
3. 触发刷新的两个条件：缓存中 `expiresAt` 已过期，或者上游响应表明 token 异常。
4. 刷新失败时不得污染缓存。
5. 必须有并发锁，防止多实例 / 多请求并发刷新。

## Goals / Non-Goals

**Goals:**
- 让 5 种性质不同的 CLI 失败情形（CLI 自判仍有效、子进程异常、路径错位、读早于写、文件 RT 失效）按各自语义被处置，而非一律置 `status='error'`。
- 把 token 刷新的优先级、重试预算、并发锁、缓存写入语义统一收口在 `refreshTokenViaCredentials` 一个函数。
- 删除调用方层面（relay）的"未变即失败"二次校验，让"刷新成功/失败"在 refresh 函数内部就有确定语义。
- 在不接触 `.credentials.json` 的前提下，提供一条 axios 兜底路径处理 "上游 token 失效但本地 expiresAt 仍未到" 的死区。

**Non-Goals:**
- 不引入新的存储后端、不变更 Redis schema、不变更环境变量。
- 不修改账户接入（onboarding）流程；CLI 仍是初始 `refresh_token` 的来源。
- 不重新设计 `refreshAccountToken` 内部的 OAuth 调用细节（agent / proxy / headers / subscription 解析等保持原样）；仅作为 axios 兜底阶段被调用的内部 helper。
- 不改变其他平台账户（Gemini / OpenAI / Bedrock 等）的刷新逻辑。
- 不为 CLI 写回 `.credentials.json` 任何字段（含 `expiresAt`）。

## Decisions

### Decision 1: CLI 优先 + 3 次预算 + axios 兜底

入口函数采用 "CLI 重试循环 → axios 兜底" 的固定阶段顺序：

```
acquireLock
  ↓
prev = cache.accessToken
  ↓
for attempt in 1..3:
   exec_start_mtime = stat(file).mtime    // stat 仅读，不写文件
   try execFileAsync('claude', ['-p', 'hello world'], {timeout: 60000})
   poll until stat(file).mtime > exec_start_mtime  (max 5s)
   credentials = readCredentialsFile()
   if credentials.accessToken !== prev:
      updateCache(credentials)
      releaseLock; return success
   else:
      logRefreshAttemptNoOp(attempt)
      sleep backoff(attempt)              // 500ms / 1000ms / 2000ms
      continue

// 3 次都未变
rt = cache.refreshToken
resp = await refreshAccountToken_internal(accountId, rt)   // 复用现有 OAuth 实现
if resp.success:
   // refreshAccountToken_internal 内部已写 cache
   releaseLock; return success
else:
   throw 'all refresh paths exhausted'
```

**为何选 CLI 优先**：约束条件之一。CLI 拥有 `.credentials.json` 的写权限，是 `refresh_token` 轮换的"权威来源"；axios 兜底每次成功都会让 Redis 与文件出现 refresh_token 漂移，长期会让 CLI 路径在自然过期场景也开始失败。让 CLI 优先意味着大多数刷新仍由 CLI 完成、文件 RT 与服务端保持同步。

**为何固定 3 次而非可配置**：在线观测到的失败几乎都是单次 no-op；3 次循环主要为吸收偶发的 race（mtime 校验已能消除大部分）和短暂 CLI 异常。可配置会引入又一个 magic number 调参面，3 是简单基线，可在 spec 演进中再升级。

**为何用 mtime 校验代替固定 sleep**：原 `sleep(2000)` 在 CLI 启动慢时会产生"读早于写"的伪失败。mtime poll 是 stat 操作，不写文件，最小代价能消除该噪声。

### Decision 2: 触发器显式化

`refreshTokenViaCredentials(accountId, trigger)` 新增 `trigger` 参数，取值：

- `'cache_expired'`：由 `getValidAccessToken` 的过期判断（`now >= expiresAt - 60000`）触发
- `'upstream_error'`：由 `claudeRelayService.js` 的 401 处理触发
- `'manual_refresh'`：管理后台手动触发（保留入口，行为同 `cache_expired`）

`logRefreshStart` 透传 `trigger` 到 `token-refresh.log`，便于事后分析两个触发器的失败分布。

**替代方案**：保留 `'credentials_refresh'` 单一 reason 字面量。被否决，因为线上日志现在无法区分"主动过期检查"与"被动 401 触发"，对故障响应不利。

### Decision 3: 删除调用方的二次校验

`claudeRelayService.js:718` / `L2411` 的 `refreshResult.accessToken !== accessToken` 校验被移除。refresh 函数现在保证：返回 `success: true` 时 token 一定可用（CLI 真刷了 / axios 真刷了），返回失败时调用方自行决定行为（401 透传 / 重试退出）。

**替代方案**：保留作为防御性深度。被否决，因为它实质上是把"refresh 函数的不变量"写在了调用方，散落在两处（流式 + 非流式），且任何对 refresh 行为的改动都需要同步两层逻辑。

### Decision 4: 失败处置矩阵化

| 失败类别 | 信号 | 处置 |
|---|---|---|
| CLI 子进程异常 | `execFile` 抛 throw | 计入 attempt 失败；3 次后进 axios |
| CLI 退出 0 但文件未变 | `prev === current` 且 mtime 已推进或超时 | 计入 attempt 失败；3 次后进 axios |
| axios OAuth 4xx (`invalid_grant`) | response.status 4xx | `status='error'`，不写 cache，凭据告警 |
| axios OAuth 网络/超时 | axios reject (ECONNRESET/ETIMEDOUT) | `temp_unavailable`（短冷却），不写 cache |
| 文件路径错位 | `getCredentialsPath()` 不存在 | `status='error'` 配置告警；不进 CLI/axios 循环 |
| 文件 JSON 解析失败 | `readCredentialsFile` 抛 | 同上 |

`temp_unavailable` 复用现有 `upstreamErrorHelper` 的短冷却机制（默认 60s），失败 N 次后自动升级为 `error`（沿用现有策略）。

### Decision 5: cache 原子写入语义

"cache" 在本设计中即 Redis 中的账户记录。`updateCache(payload)` 是单次 `setClaudeAccount`，一次性更新 `accessToken / refreshToken / expiresAt / lastRefreshAt / status / errorMessage / scopes`。任何刷新分支只在**成功结束前**调用一次 `updateCache`；失败分支永不触碰 cache（除了 Decision 4 中"凭据真坏"的 `status='error'` 写入，那是一次单独的状态写入，不混入 token 字段）。

### Decision 6: 并发锁

复用现有 `tokenRefreshService.acquireRefreshLock(accountId, 'claude')`。锁未拿到时，等待 3s 后读 cache 并直接返回（视为他人已完成刷新）。锁路径中失败必须释放锁（finally）。

**替代方案**：waiter 也参与重试。被否决，因为当锁持有者失败时，waiter 重试只会加重负载；让 waiter 信任 cache 即可，下一次 401 自然会触发新的刷新。

## Risks / Trade-offs

- **Risk**: axios 兜底会让 Redis 与文件的 `refresh_token` 漂移，长期使用 axios 后 CLI 路径在"本地 expiresAt 也过期"场景也可能因文件 RT 陈旧而失败。
  → **Mitigation**: 兜底成功率接受性退化是设计折衷；监控 axios 兜底成功率与 CLI 路径成功率比，超过阈值时人工触发重新登录刷新文件。

- **Risk**: 3 次 CLI 重试 + 退避延迟（500+1000+2000 ≈ 3.5s）+ 单次 exec 最多 60s，触发 axios 前最坏可达 ~3 分钟，对客户端 401 重试延迟影响显著。
  → **Mitigation**: 单次 `execFile` timeout 在 CLI no-op 场景下其实很短（CLI 不联网，立刻退出）；只有真"CLI 进程卡住"时才接近 60s。可在后续 spec 演进中把单次 timeout 降低到 15s。

- **Risk**: `readCredentialsFile()` 的 `getCredentialsPath()` 来自 Redis，若管理员手工 `setCredentialsPath` 设错，所有 CLI 刷新会读到错的文件，3 次循环全部 no-op，最终走 axios。从行为上"系统仍能刷新"，但 CLI 路径失效不易被发现。
  → **Mitigation**: 在 `Decision 4` 把"路径不存在/JSON 解析失败"识别为单独的 `status='error'` 配置告警类，让告警显式化；后续可加启动期路径自检。

- **Risk**: `tokenRefreshService.acquireRefreshLock` 的实现依赖 Redis；如果 Redis 抖动导致锁获取失败，本设计 fallback 到"读 cache 返回 success"会让调用方拿到旧 token 重试，可能产生连锁 401。
  → **Mitigation**: 锁获取失败本身已被现有代码捕获并降级；本次改动不改变其语义。属于已有风险范围。

- **Trade-off**: 把"判失败"的逻辑全部下沉到 refresh 函数内部，使调用方更薄、更易复用，但任何 refresh 行为变更都需要修改单点函数（也就意味着回归面集中）。
  → **Mitigation**: 单元测试覆盖 5 种核心情形（CLI 成功 / CLI no-op×3 → axios 成功 / CLI 进程错全部失败 / axios grant 失败 / 并发锁等待）。

- **Trade-off**: 触发器枚举（`cache_expired` / `upstream_error` / `manual_refresh`）是简单的字符串字段，不强制校验。
  → **Mitigation**: 在 `tokenRefreshLogger` 注释中列出合法值；后续若需更严格可改为 enum 常量。

## Migration Plan

1. **代码改动**（同一 PR 内）：
   - 重写 `refreshTokenViaCredentials`。
   - 把现 `refreshAccountToken` 重命名为 `_axiosRefresh`（内部 helper），或在原函数上加注释表明其作为兜底入口。
   - 简化 `getValidAccessToken` 中 OAuth/CLI 分支，统一调 `refreshTokenViaCredentials`。
   - 删除 `claudeRelayService.js` 两处"未变即失败"校验。
   - `tokenRefreshLogger.logRefreshStart` 增加 `trigger` 字段。

2. **回归验证**：
   - 单元测试覆盖 5 种情形（见 Goals）。
   - 灰度：先在测试账户上手动触发 401（伪造响应），验证 axios 兜底路径打通。
   - 监控：上线 24h 内观察 `token-refresh-error.log` 中 `Credentials refresh did not yield` 抛错应消失。

3. **回滚策略**：
   - 改动集中在 `claudeAccountService.js` 与 `claudeRelayService.js` 两处，必要时 `git revert` 整 commit。
   - 不引入持久化数据迁移，回滚无数据残留。

## Open Questions

- axios 兜底使用 Redis 中的 `refresh_token` 还是文件中的？当前 `refreshAccountToken` 用 Redis，本设计沿用。但如果 Redis 中 RT 因历史 bug 已失效、文件中 RT 仍有效，axios 也会失败。是否需要双 RT 来源（Redis → File）？短期保持单源，待运维数据验证后决定。
- 单次 `execFile` 的 timeout 是否需要从 60s 降到 15s 以缩短最坏情况延迟？建议在本次实施完成后用一周的指标回看再决定。
- `manual_refresh` 触发器是否应不走 3 次循环（管理员通常希望立刻看到结果）？可选优化，本次按统一流程实现。
