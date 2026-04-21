'use strict'

// 仓储装配点——业务代码只从此处获取 Repository 实例。
// 根据 config.metadata.backend 在启动时决定采用 Redis 还是 SQLite 实现。

const config = require('../../../config/config')
const logger = require('../../utils/logger')

const RedisApiKeyRepository = require('./RedisApiKeyRepository')
const RedisAccountRepository = require('./RedisAccountRepository')
const RedisTagRepository = require('./RedisTagRepository')

let cache = null

function assemble() {
  const { backend } = config.metadata

  if (backend === 'sqlite') {
    // 阶段 2/3/4 补上 SQLite 实现后，在此分支装配
    // 目前回退到 Redis，并发出告警提醒：sqlite 实现尚未就绪
    logger.warn(
      '⚠️  METADATA_BACKEND=sqlite 但 SQLite Repository 尚未实现；回退到 Redis。请等待阶段 2+ 完成后重启。'
    )
  } else if (backend !== 'redis') {
    throw new Error(`Invalid METADATA_BACKEND="${backend}"; expected "redis" or "sqlite"`)
  }

  return {
    backend: 'redis',
    apiKeyRepository: new RedisApiKeyRepository(),
    accountRepository: new RedisAccountRepository(),
    tagRepository: new RedisTagRepository()
  }
}

function getRepositories() {
  if (!cache) {
    cache = assemble()
  }
  return cache
}

// 便于测试：允许显式重置装配缓存
function resetRepositories() {
  cache = null
}

module.exports = {
  getRepositories,
  resetRepositories
}
