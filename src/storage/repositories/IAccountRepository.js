'use strict'

// IAccountRepository —— 账号元数据仓储接口
//
// 现有 10 个平台共用此接口，通过 `platform` 参数区分：
//   claude / claude-console / gemini / gemini-api / openai / openai-responses
//   bedrock / azure-openai / ccr / droid
//
// 背景：历史上每个平台的 Redis key 前缀并不统一——有些用 `:account:`，
// 有些用 `_account:`；Redis 实现负责维护这层 legacy 映射。SQLite 实现
// 将所有平台统一到单表（通过 `platform` 列区分），彻底摆脱前缀差异。

class IAccountRepository {
  /**
   * Upsert 一个账号。与 Redis hash 一致的字段级 upsert 语义。
   * @param {string} platform
   * @param {string} accountId
   * @param {Object} accountData 平铺字段；凭据保持加密后的字符串即可
   * @returns {Promise<void>}
   */
  async save(_platform, _accountId, _accountData) {
    throw new Error('IAccountRepository.save not implemented')
  }

  /**
   * 按 (platform, id) 精确查找。
   * @returns {Promise<Object>} Redis 实现未命中时返回 `{}`；SQLite 返回 `null`
   */
  async findById(_platform, _accountId) {
    throw new Error('IAccountRepository.findById not implemented')
  }

  /**
   * 列出指定平台的所有账号。
   * @returns {Promise<Array<Object>>}
   */
  async getAllByPlatform(_platform) {
    throw new Error('IAccountRepository.getAllByPlatform not implemented')
  }

  /**
   * 删除指定账号。
   * @returns {Promise<number>} 被删除记录数
   */
  async delete(_platform, _accountId) {
    throw new Error('IAccountRepository.delete not implemented')
  }
}

module.exports = IAccountRepository
