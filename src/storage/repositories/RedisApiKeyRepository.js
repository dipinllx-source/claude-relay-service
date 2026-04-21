'use strict'

// RedisApiKeyRepository —— 基于现有 redis.js 的 API Key 仓储实现
//
// 零行为变化：所有方法均为现有 redis 方法的薄封装，业务层切换到 Repository
// 后运行时路径与此前一致。未来用 SqliteApiKeyRepository 替换时，业务层不变。

const redis = require('../../models/redis')
const IApiKeyRepository = require('./IApiKeyRepository')

class RedisApiKeyRepository extends IApiKeyRepository {
  async save(keyId, keyData, hashedKey = null) {
    return redis.setApiKey(keyId, keyData, hashedKey)
  }

  async findById(keyId) {
    return redis.getApiKey(keyId)
  }

  async findByHash(hashedKey) {
    return redis.findApiKeyByHash(hashedKey)
  }

  async delete(keyId) {
    return redis.deleteApiKey(keyId)
  }

  async getAll() {
    return redis.getAllApiKeys()
  }

  async scanIds() {
    return redis.scanApiKeyIds()
  }
}

module.exports = RedisApiKeyRepository
