'use strict'

// StorageStatusService —— 聚合元数据存储层的运行时状态，供 /admin/storage/status 返回。
//
// 只做"查询 + 聚合"，不做写入；昂贵检查（integrity_check）带 60 秒缓存以避免高频触发。

const fs = require('fs')
const path = require('path')

const DEFAULT_INTEGRITY_CACHE_TTL_MS = 60 * 1000

class StorageStatusService {
  constructor({ config, redisClient, getDb, flusher = null, logger } = {}) {
    this.config = config
    this.redis = redisClient
    this.getDb = typeof getDb === 'function' ? getDb : null
    this.flusher = flusher
    this.logger = logger
    this._integrityCache = null
  }

  setFlusher(flusher) {
    this.flusher = flusher
  }

  async _redisStatus() {
    if (!this.redis) {
      return { connected: false }
    }
    try {
      const info = await this.redis.info('memory,server,persistence')
      const usedMemory = /used_memory:(\d+)/.exec(info)?.[1]
      const lastSave = /rdb_last_save_time:(\d+)/.exec(info)?.[1]
      const dbSize = typeof this.redis.dbsize === 'function' ? await this.redis.dbsize() : null
      return {
        connected: true,
        usedMemoryBytes: usedMemory ? Number.parseInt(usedMemory, 10) : null,
        lastSaveAt: lastSave ? Number.parseInt(lastSave, 10) * 1000 : null,
        dbSize: dbSize ?? null
      }
    } catch (err) {
      return { connected: false, error: err.message }
    }
  }

  _sqliteFileSize(filepath) {
    try {
      const stat = fs.statSync(filepath)
      return stat.size
    } catch (_err) {
      return null
    }
  }

  _checkIntegrity(db) {
    const now = Date.now()
    if (this._integrityCache && now - this._integrityCache.at < DEFAULT_INTEGRITY_CACHE_TTL_MS) {
      return this._integrityCache.result
    }
    let result
    try {
      const row = db.prepare('PRAGMA integrity_check').get()
      result = row && row.integrity_check === 'ok' ? 'ok' : row?.integrity_check || 'unknown'
    } catch (err) {
      result = `error: ${err.message}`
    }
    this._integrityCache = { at: now, result }
    return result
  }

  async _sqliteStatus() {
    if (!this.getDb) {
      return null
    }
    const db = this.getDb()
    const { sqlitePath } = this.config.metadata
    const rowCounts = {
      apiKeys: db.prepare('SELECT COUNT(*) AS n FROM api_keys').get().n,
      accounts: db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,
      tags: db.prepare('SELECT COUNT(*) AS n FROM tags').get().n,
      usageDaily: db.prepare('SELECT COUNT(*) AS n FROM usage_daily').get().n
    }
    const journalMode = db.pragma('journal_mode', { simple: true })
    return {
      path: sqlitePath,
      fileSizeBytes: this._sqliteFileSize(sqlitePath),
      walSizeBytes: this._sqliteFileSize(`${sqlitePath}-wal`),
      journalMode,
      integrityCheck: this._checkIntegrity(db),
      rowCounts
    }
  }

  _backupStatus() {
    const { sqlitePath } = this.config.metadata
    const backupDir = path.join(path.dirname(sqlitePath), 'backup')
    try {
      if (!fs.existsSync(backupDir)) {
        return { backupDir, lastBackupAt: null, lastBackupSizeBytes: null }
      }
      const files = fs
        .readdirSync(backupDir)
        .filter((f) => f.startsWith('metadata-') && f.endsWith('.db'))
        .map((f) => {
          const full = path.join(backupDir, f)
          try {
            const st = fs.statSync(full)
            return { name: f, mtimeMs: st.mtimeMs, size: st.size }
          } catch (_err) {
            return null
          }
        })
        .filter(Boolean)
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
      const latest = files[0] || null
      return {
        backupDir,
        lastBackupAt: latest ? Math.floor(latest.mtimeMs) : null,
        lastBackupSizeBytes: latest ? latest.size : null,
        backupCount: files.length
      }
    } catch (err) {
      return { backupDir, lastBackupAt: null, error: err.message }
    }
  }

  async _flusherStatus() {
    if (!this.flusher || typeof this.flusher.status !== 'function') {
      return null
    }
    const base = this.flusher.status()
    let pendingRuntimeKeyCount = null
    try {
      if (this.redis && typeof this.redis.scan === 'function') {
        let cursor = '0'
        let count = 0
        do {
          // eslint-disable-next-line no-await-in-loop
          const [next, batch] = await this.redis.scan(
            cursor,
            'MATCH',
            'apikey:runtime:*',
            'COUNT',
            200
          )
          cursor = next
          count += batch.length
        } while (cursor !== '0')
        pendingRuntimeKeyCount = count
      }
    } catch (_err) {
      pendingRuntimeKeyCount = null
    }
    return { ...base, pendingRuntimeKeyCount }
  }

  async snapshot() {
    const { backend } = this.config.metadata
    const [redis, sqlite, flusher] = await Promise.all([
      this._redisStatus(),
      backend === 'sqlite' ? this._sqliteStatus() : Promise.resolve(null),
      this._flusherStatus()
    ])
    const backup = backend === 'sqlite' ? this._backupStatus() : null
    return {
      backend,
      redis,
      sqlite,
      flusher,
      backup,
      collectedAt: Date.now()
    }
  }
}

module.exports = StorageStatusService
