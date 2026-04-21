/**
 * Admin Routes - 存储健康状态（只读）
 *
 * 不在此处暴露任何写入、重置或删除入口；运维脚本请通过 CLI 运行
 * （npm run data:backup / data:migrate / ...）。
 */

const express = require('express')

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const redis = require('../../models/redis')
const StorageStatusService = require('../../services/storageStatusService')

const router = express.Router()

// Lazy-constructed service: SQLite backend 下需要 getDb，Redis-only 部署没必要加载
let svc = null
function getSvc() {
  if (svc) {
    return svc
  }
  const params = {
    config,
    redisClient: redis.getClientSafe?.() ?? null,
    logger
  }
  if (config.metadata.backend === 'sqlite') {
    // eslint-disable-next-line global-require
    const { getDb } = require('../../storage/sqlite')
    params.getDb = getDb
  }
  svc = new StorageStatusService(params)
  return svc
}

// 由 app.js 在 flusher 启动后调用，把实例注入进来，用于面板展示其 status
function setFlusher(flusher) {
  getSvc().setFlusher(flusher)
}

router.get('/storage/status', authenticateAdmin, async (req, res) => {
  try {
    const data = await getSvc().snapshot()
    return res.json({ success: true, data })
  } catch (err) {
    logger.error(`/admin/storage/status failed: ${err.stack || err.message}`)
    return res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
module.exports.setFlusher = setFlusher
