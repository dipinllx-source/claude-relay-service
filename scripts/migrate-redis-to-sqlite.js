#!/usr/bin/env node
'use strict'

// 一次性迁移脚本：把现有 Redis 中的 API Key / Account / Tag 导入 SQLite。
//
// 用法：
//   node scripts/migrate-redis-to-sqlite.js              # 实际写入
//   node scripts/migrate-redis-to-sqlite.js --dry-run    # 仅打印计划
//
// 幂等：对已存在的行走 save（字段级合并），不破坏 SQLite 已有数据。
// Redis 源数据不会被本脚本删除；清理由 scripts/cleanup-redis-metadata.js 完成。

const config = require('../config/config')

// 强制在本进程内使用 sqlite backend 装配，用于直接构建 SQLite 仓储
if (config.metadata.backend !== 'sqlite') {
  config.metadata.backend = 'sqlite'
}

const redis = require('../src/models/redis')
const { getDb, closeDb } = require('../src/storage/sqlite')
const SqliteApiKeyRepository = require('../src/storage/repositories/SqliteApiKeyRepository')
const SqliteAccountRepository = require('../src/storage/repositories/SqliteAccountRepository')
const SqliteTagRepository = require('../src/storage/repositories/SqliteTagRepository')
const RedisAccountRepository = require('../src/storage/repositories/RedisAccountRepository')

const DRY_RUN = process.argv.includes('--dry-run')

function log(...args) {
  process.stdout.write(`${args.join(' ')}\n`)
}

async function main() {
  log(`== Redis → SQLite metadata migration ${DRY_RUN ? '(dry-run)' : ''} ==`)

  await redis.connect()
  const db = getDb()

  const apiKeyRepo = new SqliteApiKeyRepository(db)
  const accountRepo = new SqliteAccountRepository(db)
  const tagRepo = new SqliteTagRepository(db)
  const redisAccountRepo = new RedisAccountRepository()

  // 1. API keys
  const redisKeys = await redis.getAllApiKeys()
  log(`  api_keys in Redis: ${redisKeys.length}`)
  let keyCount = 0
  for (const k of redisKeys) {
    const { id, apiKey, ...rest } = k
    if (!id) {
      continue
    }
    if (!DRY_RUN) {
      // 第一次 insert 需要 hashedKey；若 apiKey 字段不存在则跳过并告警
      if (!apiKey) {
        log(`  ! skip api_key ${id}: no stored hash`)
        continue
      }
      // eslint-disable-next-line no-await-in-loop
      await apiKeyRepo.save(id, { apiKey, ...rest }, apiKey)
    }
    keyCount += 1
  }

  // 2. Accounts across all 10 platforms
  let accountCount = 0
  for (const platform of SqliteAccountRepository.SUPPORTED_PLATFORMS) {
    // eslint-disable-next-line no-await-in-loop
    const accounts = await redisAccountRepo.getAllByPlatform(platform)
    log(`  ${platform}: ${accounts.length} accounts`)
    for (const a of accounts) {
      const { id, ...rest } = a
      if (!id) {
        continue
      }
      if (!DRY_RUN) {
        // eslint-disable-next-line no-await-in-loop
        await accountRepo.save(platform, id, rest)
      }
      accountCount += 1
    }
  }

  // 3. Tags
  const tags = (await redis.getGlobalTags()) || []
  log(`  global tags: ${tags.length}`)
  if (!DRY_RUN) {
    for (const t of tags) {
      // eslint-disable-next-line no-await-in-loop
      await tagRepo.addTag(t)
    }
  }

  // Diff report
  log('\n== migration report ==')
  if (DRY_RUN) {
    log(
      `(dry-run) would write ${keyCount} api_keys + ${accountCount} accounts + ${tags.length} tags`
    )
  } else {
    const sqliteKeyCount = db.prepare('SELECT COUNT(*) AS n FROM api_keys').get().n
    const sqliteAccountCount = db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n
    const sqliteTagCount = db.prepare('SELECT COUNT(*) AS n FROM tags').get().n
    log(`  api_keys : ${keyCount} (src) → ${sqliteKeyCount} (dst)`)
    log(`  accounts : ${accountCount} (src) → ${sqliteAccountCount} (dst)`)
    log(`  tags     : ${tags.length} (src) → ${sqliteTagCount} (dst)`)

    if (redisKeys.length > 0) {
      log('\n== sample diff (up to 5 keys) ==')
      for (const r of redisKeys.slice(0, 5)) {
        // eslint-disable-next-line no-await-in-loop
        const s = await apiKeyRepo.findById(r.id)
        const match = r.name === s.name && (r.apiKey || null) === (s.apiKey || null)
        log(`  ${r.id}: ${match ? '✓' : '✗ MISMATCH'}`)
      }
    }
  }

  closeDb()
  await redis.disconnect()
  log('\nDone.')
}

main().catch((err) => {
  process.stderr.write(`migration failed: ${err.stack || err.message}\n`)
  process.exit(1)
})
