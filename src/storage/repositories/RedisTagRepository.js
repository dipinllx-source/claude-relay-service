'use strict'

// RedisTagRepository —— 全局 tag 集合的 Redis 仓储实现
//
// 底层仍使用 redis.js 暴露的 addTag / removeTag / getGlobalTags；
// 业务层迁到 Repository 后零行为变化。

const redis = require('../../models/redis')
const ITagRepository = require('./ITagRepository')

class RedisTagRepository extends ITagRepository {
  async addTag(name) {
    return redis.addTag(name)
  }

  async removeTag(name) {
    return redis.removeTag(name)
  }

  async listTags() {
    return redis.getGlobalTags()
  }
}

module.exports = RedisTagRepository
