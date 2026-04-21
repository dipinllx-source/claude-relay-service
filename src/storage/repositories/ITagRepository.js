'use strict'

// ITagRepository —— 全局 tag 与 key-tag 关联仓储接口
//
// 当前只覆盖"全局 tag 集合"的 CRUD；key-tag 关联管理由 ApiKeyRepository
// 在 save/delete 时一并维护（保持与 SQLite 原子事务的一致性）。

class ITagRepository {
  /**
   * 注册一个全局 tag（若已存在则为 no-op）。
   * @returns {Promise<void>}
   */
  async addTag(_name) {
    throw new Error('ITagRepository.addTag not implemented')
  }

  /**
   * 从全局 tag 集合移除。
   * 注意：移除前应确保没有 api_key 还引用它（外键 / 业务层检查）。
   * @returns {Promise<void>}
   */
  async removeTag(_name) {
    throw new Error('ITagRepository.removeTag not implemented')
  }

  /**
   * 返回全部全局 tag（去重）。
   * @returns {Promise<string[]>}
   */
  async listTags() {
    throw new Error('ITagRepository.listTags not implemented')
  }
}

module.exports = ITagRepository
