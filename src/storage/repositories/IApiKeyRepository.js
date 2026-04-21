'use strict'

// IApiKeyRepository —— API Key 元数据仓储接口
//
// 设计契约：
// - 所有方法均为异步（Promise）；实现方须遵守这一语义
// - `keyData` 为平铺字段对象；与 Redis hash 语义保持一致（字段级 upsert）
// - 允许实现内部做缓存或装饰（例如 Caching decorator）
// - `findById` 未命中时 Redis 实现返回 `{}`（历史兼容），SQLite 实现返回 `null`
//   —— 这个差异在 Caching 装饰器层统一
//
// 业务代码只依赖此接口，不应直接调用 redis/sqlite 原语。

class IApiKeyRepository {
  /**
   * Upsert 一条 API Key。
   * @param {string} keyId
   * @param {Object} keyData 平铺字段；至少包含 name；密钥哈希通过 hashedKey 参数传
   * @param {string|null} hashedKey SHA-256 哈希值，用于建立快速查找映射
   * @returns {Promise<void>}
   */
  async save(_keyId, _keyData, _hashedKey = null) {
    throw new Error('IApiKeyRepository.save not implemented')
  }

  /**
   * 按 id 查找 API Key 完整字段。
   * @returns {Promise<Object>} 平铺对象；未命中时实现自定空值语义
   */
  async findById(_keyId) {
    throw new Error('IApiKeyRepository.findById not implemented')
  }

  /**
   * 认证热路径：通过 hashed key 快速定位。
   * @returns {Promise<Object|null>}
   */
  async findByHash(_hashedKey) {
    throw new Error('IApiKeyRepository.findByHash not implemented')
  }

  /**
   * 删除 API Key 及其相关索引 / tag 关联。
   * @returns {Promise<number>} 被删除记录数
   */
  async delete(_keyId) {
    throw new Error('IApiKeyRepository.delete not implemented')
  }

  /**
   * 遍历所有 API Key（非分页；大规模场景请优先用 scanIds 分批加载）。
   * @returns {Promise<Array<Object>>}
   */
  async getAll() {
    throw new Error('IApiKeyRepository.getAll not implemented')
  }

  /**
   * 扫描所有 keyId（O(N) 但不加载字段体）。
   * @returns {Promise<string[]>}
   */
  async scanIds() {
    throw new Error('IApiKeyRepository.scanIds not implemented')
  }
}

module.exports = IApiKeyRepository
