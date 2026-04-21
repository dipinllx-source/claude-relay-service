#!/usr/bin/env node
'use strict'

// 生成 SQLite metadata 数据库的一致性备份（使用 SQLite 内置 .backup API）。
// 备份文件放在 data/backup/metadata-<ISO 时间戳>.db，权限 0600。

const path = require('path')
const fs = require('fs')
const config = require('../config/config')

if (config.metadata.backend !== 'sqlite') {
  process.stdout.write('metadata backend is not sqlite; nothing to back up.\n')
  process.exit(0)
}

const { getDb, closeDb } = require('../src/storage/sqlite')

function timestamp() {
  return new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '')
}

async function main() {
  const db = getDb()
  const dbDir = path.dirname(config.metadata.sqlitePath)
  const backupDir = path.join(dbDir, 'backup')
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 })
  }
  const target = path.join(backupDir, `metadata-${timestamp()}.db`)

  process.stdout.write(`backing up ${config.metadata.sqlitePath}\n  → ${target}\n`)
  await db.backup(target)

  try {
    fs.chmodSync(target, 0o600)
  } catch (_err) {
    // non-fatal
  }

  const { size } = fs.statSync(target)
  process.stdout.write(`done. file size: ${size} bytes\n`)

  closeDb()
}

main().catch((err) => {
  process.stderr.write(`backup failed: ${err.stack || err.message}\n`)
  process.exit(1)
})
