## Why

`dcc44d0` 引入的 `previousAccessToken === credentials.accessToken` 一致性校验把多种性质不同的失败（CLI 子进程没起来、文件路径错配、读早于写、CLI 自判本地 token 仍有效因而不刷）一律映射为"凭据失效"，触发 `status='error'` 让账户永久不可路由。线上已观测到该问题（`logs/token-refresh-error.log` 中 `81d8c79b...` 账户在 2026-05-07 14:45 因此被踢出池）。当前刷新路径还存在三处结构性缺陷：（1）OAuth 与 CLI 两条刷新机制的优先级散落在调用方和函数内部，不一致；（2）`execFile` 子进程异常被 `logger.warn` 静默吞掉；（3）刷新失败处置一刀切，不区分上游凭据失效与基础设施抖动。

## What Changes

- **BREAKING**: 推翻当前 `refreshTokenViaCredentials` 的 "OAuth 优先 → CLI fallback" 顺序，反转为 "CLI 优先（最多 3 次） → axios OAuth 兜底"。
- **BREAKING**: 删除 `refreshTokenViaCredentials` 内的 `previous === current` 抛错（L213-217）。
- **BREAKING**: 删除调用方（`claudeRelayService.js` L718 / L2411）对返回 token 的"未变即失败"二次校验。
- **BREAKING**: 删除 `getValidAccessToken` 中 OAuth → CLI 顺序 fallback 的散落分支（L724-749），全部统一进 `refreshTokenViaCredentials`。
- 入口新增显式 `trigger` 参数，区分 `'cache_expired'` 与 `'upstream_error'` 两种触发来源，用于日志与指标。
- 引入 CLI 重试循环：最多 3 次 `execFile claude -p`，每次失败（子进程异常 / 文件未变）计入预算，3 次耗尽后才进入 axios 兜底；重试间指数退避。
- `execFile` 异常不再被吞，作为本次失败计入预算。
- CLI 阶段加入 mtime 推进校验代替固定 `sleep(2000)`，避免读早于写的伪失败（仅 `stat`，不写文件）。
- 失败处置矩阵化：上游 OAuth grant 4xx → `status='error'`；网络/超时/CLI infra 错 → `temp_unavailable` 短冷却。
- 全程并发由 `tokenRefreshService.acquireRefreshLock` 串行化；waiter 直接读 cache 不重复刷新。
- 失败路径绝不写 cache（保持 cache atomicity）。

不动 `.credentials.json`：CLI 阶段仅 `readFileSync` + `stat`，axios 阶段不接触文件。

## Capabilities

### New Capabilities
- `claude-token-refresh`: Claude 账户 access token 的刷新机制，包括触发条件、CLI 优先重试、axios 兜底、失败处置、并发锁与缓存语义的正式契约。

### Modified Capabilities
（无现有 spec 涉及该能力，全部以新 capability 形式记录。）

## Impact

- **代码**:
  - `src/services/account/claudeAccountService.js` —— `refreshTokenViaCredentials` 整体重写；`getValidAccessToken` 简化；保留 `refreshAccountToken` 作为 axios 内部 helper。
  - `src/services/relay/claudeRelayService.js` —— 删除 401 重试路径中的"未变"二次校验（非流式 L718、流式 L2411）。
  - `src/utils/tokenRefreshLogger.js` —— `logRefreshStart` 新增 `trigger` 字段透传。
- **行为**:
  - 上游 401 但本地 file expiresAt 仍未到的场景下，账户不再被永久置 `error`；3 次 CLI no-op 后由 axios 接管。
  - 之前被静默吞掉的 CLI 子进程错误（PATH 找不到、超时、权限）现在会作为失败计入并进入 axios 兜底，可观测。
- **副作用**:
  - axios 兜底成功时刷新出的新 `refresh_token` 只写 Redis、不写文件；多次 axios 后文件里的 RT 会变陈旧，CLI 路径在"本地 expiresAt 也过期"的场景下可能开始失败。这是已知接受的退化（兜底会处理）。
- **配置 / 数据**:
  - 不引入新 Redis key、不修改现有数据格式。
  - 不变更环境变量。
- **测试**:
  - 新增针对 `refreshTokenViaCredentials` 的单元测试覆盖 5 种根因情形（CLI 成功、CLI no-op×3 → axios 成功、CLI 进程错、axios grant 失败、并发锁等待）。
