# 元数据存储（Redis / SQLite）运维指南

Relay Service 支持两种元数据后端：

| backend | 存储位置 | 适合场景 |
|---|---|---|
| `redis`（默认） | 所有元数据 + 热状态都在 Redis | Redis 可控、可靠持久化的传统部署 |
| `sqlite` | 账号 / API Key / 标签在本地 SQLite；Redis 仅作缓存和热状态 | Redis 是托管/共享/纯缓存，不能依赖其持久化 |

**切换后端不是热操作**：需要修改 `.env` 并重启进程。

## 1. 切换到 SQLite

### 1.1 前置

- 仅支持**单实例**部署（SQLite 文件不能被多进程共享写入）
- 服务进程对 `data/` 目录有 `0700` 权限；`metadata.db` 将写成 `0600`
- 必须保留 Redis：并发计数、限流、会话、实时 usage 仍然依赖它

### 1.2 执行迁移（服务可保持运行）

```bash
# 1) 先 dry-run 查看计划
npm run data:migrate:dry

# 2) 正式迁移
npm run data:migrate

# 输出末尾会打印对比报告：
#   api_keys : N (src) → N (dst)
#   accounts : N (src) → N (dst)
#   tags     : N (src) → N (dst)
#   sample diff (up to 5 keys): ✓ ✓ ✓ ✓ ✓
```

迁移脚本**幂等**，可安全重跑；不会修改 Redis 数据。

### 1.3 切换 backend

```bash
# .env
METADATA_BACKEND=sqlite
# SQLITE_PATH=./data/metadata.db            # 可选
# SQLITE_STATS_FLUSH_INTERVAL=30            # 可选
```

重启服务。启动日志出现：

```
🗄️  SQLite metadata ready at .../data/metadata.db (WAL, foreign_keys=ON)
🗄️  repositories wired with SQLite backend (Redis used as read-through cache)
🗄️  metadata backend: sqlite
```

### 1.4 观察期（推荐 ≥ 72 小时）

- 检查错误日志 `logs/` 中是否出现 SQLite / flusher 相关错误
- 监控 API 路径的 p99 延迟是否稳定
- 管理后台的"系统设置 → 存储健康"（阶段 10）可实时查看 row count 与 flusher 状态

观察期内不要运行 `data:cleanup`——Redis 旧数据是你的回滚安全网。

### 1.5 回退到 Redis backend（若发现问题）

```bash
# 1) .env 改回
METADATA_BACKEND=redis
# 2) 重启

# 如果此时 Redis 仍保留原始 metadata（尚未 cleanup），可直接运行
#
# 如果 Redis 已被 cleanup，需要先从 SQLite 反向导出：
npm run data:rollback
```

### 1.6 清理 Redis 中的旧 metadata（观察期结束后）

```bash
# dry-run：只列出将要删除的 key
npm run data:cleanup

# 实际删除：要求 --confirm
npm run data:cleanup:confirm
```

被清理的 key 前缀：
- `apikey:<id>`、`apikey:hash_map`、`apikey:tags:all`
- 各平台账号 hash（`claude:account:*`、`claude_console_account:*` 等）
- 平台索引 set（`claude:account:index` 等）

**保留**（热状态，不能清）：
- `apikey:runtime:*` — flusher 待 flush 的统计累加
- `apikey:cache:*` — Repository 缓存
- `usage:*` — 实时 usage 计数
- `session:*`、`concurrency:*`、`ratelimit:*` — 会话/并发/限流

## 2. 备份与恢复

### 2.1 创建备份

```bash
npm run data:backup
# → data/backup/metadata-2026-04-22T03-15-00.db
```

使用 SQLite 内置 `.backup` API，**支持热备份**（服务可继续运行）。

### 2.2 恢复备份

```bash
# 1) 停服务
# 2) 替换文件
cp data/backup/metadata-<timestamp>.db data/metadata.db
# 3) 启动服务
```

SQLite 启动时会做完整性自检；损坏时 fail-fast 退出。

### 2.3 周期性备份（crontab 示例）

```
# 每天凌晨 2 点备份，保留 14 天
0 2 * * * cd /opt/relay-service && npm run data:backup
0 3 * * * find /opt/relay-service/data/backup -name 'metadata-*.db' -mtime +14 -delete
```

## 3. 数据结构参考

**SQLite 主表**（完整 DDL 见 `src/storage/schema.js`）：

- `api_keys(id PK, hashed_key UNIQUE, name, owner_user_id, status, data JSON, last_used_at, request_count, total_cost, created_at, updated_at)`
- `accounts(id PK, platform, name, status, data JSON, created_at, updated_at)`
- `tags(name PK, created_at)`
- `api_key_tags(api_key_id, tag_name)`  with ON DELETE CASCADE
- `usage_daily(scope, id, model, date, request_count, input_tokens, output_tokens, cost)`  PK (scope, id, model, date)

`data` JSON 列与 Redis hash 字段 1:1 对应（camelCase 保持不变），新字段无需 schema 变更。

## 4. 常见问题

| 问题 | 处理 |
|---|---|
| 启动日志看不到 `metadata backend: sqlite` | `.env` 里 `METADATA_BACKEND` 没设或拼错；默认仍是 `redis` |
| "falling back to Redis backend" | SQLite 打开失败（权限/目录）；查日志定位 `data/metadata.db` 相关错误 |
| flusher 连续失败 | 查 `logs/`；存储健康面板会标红；一般是 SQLite 磁盘/权限问题 |
| 多实例部署 | **不支持**；会出现文件锁冲突与数据分裂 |
| Docker 部署 | `data/` 必须挂 volume，否则容器重建清空 |

---

本文档对应 OpenSpec 变更：`migrate-source-of-truth-to-sqlite`（archive 后归入主 specs 的 `metadata-storage` capability）。
