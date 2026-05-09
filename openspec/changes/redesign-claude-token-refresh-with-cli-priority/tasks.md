## 1. Foundation

- [x] 1.1 在 `src/utils/tokenRefreshLogger.js` 的 `logRefreshStart` 增加 `trigger` 字段透传，并在注释中列出合法值（`cache_expired` / `upstream_error` / `manual_refresh`）
- [x] 1.2 在 `src/services/account/claudeAccountService.js` 添加内部 helper `_pollFileMtime(filePath, baselineMtime, timeoutMs)`，仅依赖 `fs.statSync`，超时返回 `false`，mtime 推进返回 `true`
- [x] 1.3 在同文件添加内部 helper `_backoffDelayMs(attempt)`：返回 `500 * Math.pow(2, attempt - 1)`

## 2. Refactor `refreshTokenViaCredentials`

- [x] 2.1 修改函数签名为 `refreshTokenViaCredentials(accountId, trigger = 'manual_refresh')`，并在入口校验 trigger 合法性（非法值降级为 `'manual_refresh'` 并 warn）
- [x] 2.2 删除原 L144-167 "OAuth 优先 preamble"
- [x] 2.3 删除原 L213-217 `previousAccessToken === credentials.accessToken` 抛错块
- [x] 2.4 删除原 L197-207 对 `cmdError` 的 `logger.warn` 静默吞，改为：将 cmdError 计入 attempt 失败、但不立即抛出
- [x] 2.5 用 CLI 重试循环（最多 3 次）替换原单次 `execFile` 调用：每次记录 `mtime` 基线、执行 `execFileAsync`、`_pollFileMtime` 等待 5s、读文件、比较 `accessToken`，未变则计入失败、`_backoffDelayMs` 退避后继续；变化则原子写 cache 并 return
- [x] 2.6 在 3 次循环耗尽后调用内部 axios helper（见 §3）：成功则 return；失败抛 `'all refresh paths exhausted: <reason>'`
- [x] 2.7 实现"路径错位/文件解析失败"前置校验：若 `getCredentialsPath()` 返回路径不存在或 `readCredentialsFile` 抛错，直接走 `status='error'` 失败处置，不进入 CLI 循环
- [x] 2.8 catch 块按失败分类（CLI 子进程错 / CLI no-op / axios 4xx / axios 网络错 / 文件错）应用 §4 的处置矩阵
- [x] 2.9 finally 块释放锁的语义保持不变；确认所有抛错路径都经过 finally
- [x] 2.10 锁等待路径（`!lockAcquired`）保持原 `sleep + 读 cache + return` 行为，仅 `logRefreshSkipped` 日志补 `trigger` 字段

## 3. Refactor `refreshAccountToken` 为内部 axios helper

- [x] 3.1 把 `refreshAccountToken` 标注为 `@internal`，加注释说明其作为 axios 兜底分支被调用，不再作为对外的优先路径
- [x] 3.2 抽取一个新的内部函数 `_axiosRefresh(accountId, refreshToken)` 包裹 `refreshAccountToken` 的核心 OAuth 调用逻辑（保留 agent / proxy / headers / subscription 解析），但不再单独锁/不再单独写 `status='error'`（由调用方根据失败矩阵处置）
- [x] 3.3 `refreshTokenViaCredentials` 在 axios 兜底阶段调用 `_axiosRefresh`；返回值带 `{ success, accessToken, expiresAt, refreshToken, errorCategory }`
- [x] 3.4 保留 `refreshAccountToken` 作为兼容入口（其他既存调用方可能直接调它），其内部转调 `_axiosRefresh` 并保留原有的 `status='error'` 处置（兼容性）

## 4. 失败处置矩阵

- [x] 4.1 实现失败分类判断函数 `_classifyRefreshError(err, ctx)` 返回枚举：`'invalid_grant' | 'oauth_network' | 'cli_subprocess' | 'cli_no_op' | 'file_path_error'`
- [x] 4.2 `'invalid_grant'` → 写 `status='error'`、`errorMessage`，发凭据 webhook
- [x] 4.3 `'oauth_network'` → 调 `upstreamErrorHelper.markTempUnavailable` 记录短冷却（不写 `status='error'`）
- [x] 4.4 `'cli_subprocess'` 和 `'cli_no_op'` 在循环内仅累计计数，不直接写 cache；3 次耗尽后由后续 axios 路径决定
- [x] 4.5 `'file_path_error'` → 写 `status='error'` 配置告警类 `errorMessage`
- [x] 4.6 任何写 `status='error'` 路径都先检查 `disableAutoProtection`，若为 true 则跳过状态写入，仅 `recordErrorHistory`

## 5. 简化 `getValidAccessToken`

- [x] 5.1 删除 L724-749 的 OAuth → CLI 顺序 fallback 分支
- [x] 5.2 当过期判断为真时，直接调 `refreshTokenViaCredentials(accountId, 'cache_expired')`
- [x] 5.3 catch 路径保留"all refresh failed → 尝试返回当前缓存 token"的兜底语义（不变）

## 6. 简化 `claudeRelayService` 401 路径

- [x] 6.1 删除 `claudeRelayService.js:718` 的 `refreshResult.accessToken !== accessToken` 二次校验；只检查 `refreshResult.success`
- [x] 6.2 删除 `claudeRelayService.js:2411` 的同款二次校验；只检查 `refreshResult.success`
- [x] 6.3 修改两处 `refreshTokenViaCredentials` 调用，传入 `'upstream_error'` 作为 trigger 参数
- [x] 6.4 移除两处的 `'⚠️ Refresh returned unchanged accessToken... treating as failure'` warn 日志

## 7. 单元测试

- [x] 7.1 新增 `tests/services/account/claudeAccountService.refresh.test.js`，使用 `jest.mock` 模拟 `child_process.execFile`、`fs`、`redis`、`tokenRefreshService`
- [x] 7.2 测试用例：第 1 次 CLI exec 成功、文件已变 → return success、cache 一次性更新
- [x] 7.3 测试用例：CLI 连续 3 次 no-op（exec 成功但文件未变）→ axios 成功 → return success、cache 用 axios 响应更新
- [x] 7.4 测试用例：CLI 连续 3 次 subprocess error → axios 4xx invalid_grant → throw、`status='error'`、不写 token 字段
- [x] 7.5 测试用例：CLI 连续 3 次 no-op → axios 网络错 → throw、`status` 仍为 active、`temp_unavailable` 被记录
- [x] 7.6 测试用例：并发两次调用，第二次锁等待 → 直接读 cache 返回成功
- [x] 7.7 测试用例：`getCredentialsPath()` 返回不存在路径 → 直接 `'file_path_error'` 处置，不进 CLI 循环
- [x] 7.8 测试用例：`disableAutoProtection=true` 账户在 invalid_grant 失败时不写 `status='error'`，仅记录历史
- [x] 7.9 测试用例：mtime 在 5s 内未推进时仍读文件，`accessToken` 与基线一致 → 计入 no-op
- [x] 7.10 测试用例：mtime 在 1s 时推进 → 立即读文件，不等满 5s

## 8. 验证与上线

- [x] 8.1 `npm run lint` 与 `npm run format` 全通过
- [x] 8.2 `npm test` 全部通过（新测试 10/10；唯一失败 `modelsConfig.test.js` 与本变更无关，已确认在 main HEAD 同样失败）
- [ ] 8.3 本地灰度：手工模拟 401 响应（如改私有 stub 或拦截 axios），验证 axios 兜底路径打通
- [ ] 8.4 上线后 24h 监控 `logs/token-refresh-error.log`，确认 `Credentials refresh did not yield` 抛错条目消失
- [ ] 8.5 上线后 24h 监控 `logs/token-refresh.log`，按 `trigger` 字段统计 `cache_expired` vs `upstream_error` 触发占比，记录到运维 wiki 作为基线

## 9. 文档与归档

- [x] 9.1 在 `CLAUDE.md` 故障排除表的 "Token 刷新失败" 行扩展处置说明（新增 axios 兜底、cache 原子语义两点）
- [ ] 9.2 在 `docs/`（若存在）补充一个 token 刷新流程图（可选；此次跳过）
- [ ] 9.3 PR merge 后运行 `openspec archive redesign-claude-token-refresh-with-cli-priority` 把变更归档
