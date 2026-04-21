#!/usr/bin/env node
'use strict'

// 紧急回滚：把 SQLite 中的 API Key / Account / Tag 反向导出回 Redis。
// 使用场景：切换到 sqlite backend 后发现问题、准备切回 redis backend，
// 但 Redis 源数据已经被 cleanup 掉。
//
// 不删除 SQLite 数据；仅以覆盖方式写回 Redis。

const config = require('../config/config')

if (config.metadata.backend !== 'sqlite') {
  config.metadata.backend = 'sqlite'
}

const redis = require('../src/models/redis')
const { getDb, closeDb } = require('../src/storage/sqlite')
const SqliteApiKeyRepository = require('../src/storage/repositories/SqliteApiKeyRepository')
const SqliteAccountRepository = require('../src/storage/repositories/SqliteAccountRepository')
const RedisApiKeyRepository = require('../src/storage/repositories/RedisApiKeyRepository')
const RedisAccountRepository = require('../src/storage/repositories/RedisAccountRepository')

function log(...args) {
  process.stdout.write(`${args.join(' ')}\n`)
}

async function main() {
  log('== SQLite → Redis rollback ==')

  await redis.connect()
  const db = getDb()

  const sqApiKey = new SqliteApiKeyRepository(db)
  const sqAccount = new SqliteAccountRepository(db)
  const redisApiKey = new RedisApiKeyRepository()
  const redisAccount = new RedisAccountRepository()

  const keys = await sqApiKey.getAll()
  log(`  api_keys to restore: ${keys.length}`)
  for (const k of keys) {
    const { id, apiKey, ...rest } = k
    if (!id || !apiKey) {
      continue
    }
    // eslint-disable-next-line no-await-in-loop
    await redisApiKey.save(id, { apiKey, ...rest }, apiKey)
  }

  let accountTotal = 0
  for (const platform of SqliteAccountRepository.SUPPORTED_PLATFORMS) {
    // eslint-disable-next-line no-await-in-loop
    const list = await sqAccount.getAllByPlatform(platform)
    log(`  ${platform}: ${list.length} accounts`)
    for (const a of list) {
      const { id, ...rest } = a
      if (!id) {
        continue
      }
      // eslint-disable-next-line no-await-in-loop
      await redisAccount.save(platform, id, rest)
      accountTotal += 1
    }
  }

  // Tags
  const tagRows = db.prepare('SELECT name FROM tags').all()
  for (const { name } of tagRows) {
    // eslint-disable-next-line no-await-in-loop
    await redis.addTag(name)
  }
  log(`  tags restored: ${tagRows.length}`)

  closeDb()
  await redis.disconnect()
  log(
    `\nDone. Restored ${keys.length} api_keys + ${accountTotal} accounts + ${tagRows.length} tags.`
  )
}

main().catch((err) => {
  process.stderr.write(`rollback failed: ${err.stack || err.message}\n`)
  process.exit(1)
})
