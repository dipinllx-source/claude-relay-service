#!/usr/bin/env node
'use strict'

// 观察期结束后清理 Redis 中已迁移到 SQLite 的 metadata hash。
//
// ⚠ 危险操作：要求 --confirm 明确允许，否则仅 dry-run 列出将删除的 key。
//
// 清理范围（仅 metadata；保留热状态、并发、限流、usage、session 等）：
//   - apikey:<id>                     （API Key hash）
//   - apikey:hash_map                 （反向索引 hash）
//   - apikey:tags:all                 （全局 tag 集合）
//   - {platform}:account:<id>         claude / openai / bedrock / azure-openai / droid
//   - {platform}_account:<id>         claude_console / ccr / gemini_api / openai_responses
//   - gemini_account:<id>
//   - {platform}:account:index        （平台账号索引 set）

const redis = require('../src/models/redis')
const RedisAccountRepositoryModule = require('../src/storage/repositories/RedisAccountRepository')

const CONFIRM = process.argv.includes('--confirm')

const { PLATFORM_KEY_PREFIX } = RedisAccountRepositoryModule
const INDEX_KEYS = ['claude:account:index', 'droid:account:index', 'openai:account:index']

async function scanKeys(client, pattern) {
  const keys = []
  let cursor = '0'
  do {
    // eslint-disable-next-line no-await-in-loop
    const [next, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200)
    cursor = next
    keys.push(...batch)
  } while (cursor !== '0')
  return keys
}

function log(...args) {
  process.stdout.write(`${args.join(' ')}\n`)
}

async function main() {
  log(`== Cleanup Redis metadata ${CONFIRM ? '(CONFIRMED)' : '(dry-run)'} ==`)
  if (!CONFIRM) {
    log('  Pass --confirm to actually delete. This preview will NOT modify Redis.')
  }

  await redis.connect()
  const client = redis.getClientSafe()

  const toDelete = []

  // API key hashes
  const keys = await scanKeys(client, 'apikey:*')
  // 排除 apikey:runtime:*（属于热状态，保留）、apikey:cache:*（读缓存，保留）
  const excludeRuntime = (k) => !k.startsWith('apikey:runtime:') && !k.startsWith('apikey:cache:')
  const apiKeyRelated = keys.filter(excludeRuntime)
  toDelete.push(...apiKeyRelated)

  // Global tag set
  toDelete.push('apikey:tags:all')

  // Per-platform account hashes
  for (const prefix of Object.values(PLATFORM_KEY_PREFIX)) {
    // eslint-disable-next-line no-await-in-loop
    const platformKeys = await scanKeys(client, `${prefix}*`)
    toDelete.push(...platformKeys)
  }

  // Platform index sets
  for (const idx of INDEX_KEYS) {
    toDelete.push(idx)
  }

  // Dedup + filter non-existent
  const uniq = [...new Set(toDelete)]
  log(`\nKeys to delete (${uniq.length}):`)
  uniq.slice(0, 50).forEach((k) => log(`  ${k}`))
  if (uniq.length > 50) {
    log(`  ... (+${uniq.length - 50} more)`)
  }

  if (!CONFIRM) {
    log('\n[dry-run] exiting without deletion')
    await redis.disconnect()
    return
  }

  // Delete in batches of 100
  let deleted = 0
  for (let i = 0; i < uniq.length; i += 100) {
    const slice = uniq.slice(i, i + 100)
    // eslint-disable-next-line no-await-in-loop
    const n = await client.del(...slice)
    deleted += n
  }
  log(`\nDeleted ${deleted} keys.`)

  await redis.disconnect()
}

main().catch((err) => {
  process.stderr.write(`cleanup failed: ${err.stack || err.message}\n`)
  process.exit(1)
})
