'use strict'

// RedisAccountRepository —— 10 个平台账号的统一 Redis 仓储实现
//
// 历史上各平台的 Redis key 前缀并不统一（见 PLATFORM_KEY_PREFIX 表）。
// 本实现维护这层 legacy 映射；业务代码只需用统一的 (platform, id) 调用。
//
// 并非所有平台在 redis.js 中都有对应的 `setXxxAccount` 包装方法，所以此处
// 统一走 `redis.client` 原语；对已有包装（claude/droid/openai）的分支，
// 仍优先走包装以保留其附带的索引维护逻辑。

const redis = require('../../models/redis')
const IAccountRepository = require('./IAccountRepository')

const PLATFORM_KEY_PREFIX = {
  claude: 'claude:account:',
  'claude-console': 'claude_console_account:',
  gemini: 'gemini_account:',
  'gemini-api': 'gemini_api_account:',
  openai: 'openai:account:',
  'openai-responses': 'openai_responses_account:',
  bedrock: 'bedrock:account:',
  'azure-openai': 'azure_openai:account:',
  ccr: 'ccr_account:',
  droid: 'droid:account:'
}

// 拥有 redis.js 现成包装方法的平台（带有 index set 维护）
const WRAPPED_PLATFORMS = new Set(['claude', 'droid', 'openai'])

function methodName(platform, op) {
  const capital = platform
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
  return `${op}${capital}Account`
}

function keyFor(platform, accountId) {
  const prefix = PLATFORM_KEY_PREFIX[platform]
  if (!prefix) {
    throw new Error(`Unsupported platform: ${platform}`)
  }
  return `${prefix}${accountId}`
}

async function scanIdsByPrefix(client, prefix) {
  const ids = []
  let cursor = '0'
  do {
    // eslint-disable-next-line no-await-in-loop
    const [next, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100)
    cursor = next
    for (const k of keys) {
      ids.push(k.slice(prefix.length))
    }
  } while (cursor !== '0')
  return ids
}

class RedisAccountRepository extends IAccountRepository {
  async save(platform, accountId, accountData) {
    if (WRAPPED_PLATFORMS.has(platform)) {
      const fn = redis[methodName(platform, 'set')]
      if (typeof fn === 'function') {
        return fn.call(redis, accountId, accountData)
      }
    }
    const client = redis.getClientSafe()
    await client.hset(keyFor(platform, accountId), accountData)
  }

  async findById(platform, accountId) {
    if (WRAPPED_PLATFORMS.has(platform)) {
      const fn = redis[methodName(platform, 'get')]
      if (typeof fn === 'function') {
        return fn.call(redis, accountId)
      }
    }
    const client = redis.getClientSafe()
    return client.hgetall(keyFor(platform, accountId))
  }

  async getAllByPlatform(platform) {
    const prefix = PLATFORM_KEY_PREFIX[platform]
    if (!prefix) {
      throw new Error(`Unsupported platform: ${platform}`)
    }
    const client = redis.getClientSafe()
    const ids = await scanIdsByPrefix(client, prefix)
    if (ids.length === 0) {
      return []
    }
    const pipeline = client.pipeline()
    ids.forEach((id) => pipeline.hgetall(`${prefix}${id}`))
    const results = await pipeline.exec()
    const accounts = []
    results.forEach(([err, data], idx) => {
      if (!err && data && Object.keys(data).length > 0) {
        accounts.push({ id: ids[idx], ...data })
      }
    })
    return accounts
  }

  async delete(platform, accountId) {
    if (WRAPPED_PLATFORMS.has(platform)) {
      const fn = redis[methodName(platform, 'delete')]
      if (typeof fn === 'function') {
        return fn.call(redis, accountId)
      }
    }
    const client = redis.getClientSafe()
    return client.del(keyFor(platform, accountId))
  }
}

module.exports = RedisAccountRepository
module.exports.PLATFORM_KEY_PREFIX = PLATFORM_KEY_PREFIX
