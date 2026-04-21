'use strict'

const Database = require('better-sqlite3')
const { initSchema } = require('../../src/storage/schema')
const StorageStatusService = require('../../src/services/storageStatusService')

function makeMockRedis({ memory = '1234', save = '1700000000', dbsize = 42 } = {}) {
  return {
    async info() {
      return [`used_memory:${memory}`, 'redis_version:7.2.0', `rdb_last_save_time:${save}`].join(
        '\r\n'
      )
    },
    async dbsize() {
      return dbsize
    },
    async scan(cursor, _m, pattern, _c, _n) {
      if (cursor !== '0') {
        return ['0', []]
      }
      if (pattern === 'apikey:runtime:*') {
        return ['0', ['apikey:runtime:a', 'apikey:runtime:b']]
      }
      return ['0', []]
    }
  }
}

function makeFakeConfig(backend, sqlitePath = '/tmp/cr-storage-test.db') {
  return {
    metadata: { backend, sqlitePath }
  }
}

describe('StorageStatusService', () => {
  test('snapshot with redis backend returns redis info and null sqlite/backup', async () => {
    const svc = new StorageStatusService({
      config: makeFakeConfig('redis'),
      redisClient: makeMockRedis(),
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    })
    const snap = await svc.snapshot()
    expect(snap.backend).toBe('redis')
    expect(snap.redis.connected).toBe(true)
    expect(snap.redis.usedMemoryBytes).toBe(1234)
    expect(snap.redis.dbSize).toBe(42)
    expect(snap.sqlite).toBeNull()
    expect(snap.backup).toBeNull()
  })

  test('snapshot with sqlite backend returns rowCounts + integrity', async () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    initSchema(db)

    const svc = new StorageStatusService({
      config: makeFakeConfig('sqlite'),
      redisClient: makeMockRedis(),
      getDb: () => db,
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    })

    const snap = await svc.snapshot()
    expect(snap.backend).toBe('sqlite')
    expect(snap.sqlite.integrityCheck).toBe('ok')
    expect(snap.sqlite.rowCounts).toEqual({
      apiKeys: 0,
      accounts: 0,
      tags: 0,
      usageDaily: 0
    })
    expect(snap.sqlite.journalMode).toBeTruthy()
    expect(snap.backup).not.toBeNull()
    db.close()
  })

  test('flusher status is surfaced with pendingRuntimeKeyCount', async () => {
    const fakeFlusher = {
      status: () => ({
        intervalSec: 30,
        running: false,
        lastSuccessAt: 100,
        lastErrorAt: null,
        lastErrorMessage: null
      })
    }
    const svc = new StorageStatusService({
      config: makeFakeConfig('redis'),
      redisClient: makeMockRedis(),
      flusher: fakeFlusher,
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    })
    const snap = await svc.snapshot()
    expect(snap.flusher.lastSuccessAt).toBe(100)
    expect(snap.flusher.pendingRuntimeKeyCount).toBe(2)
  })

  test('integrity check is memoised for 60s', async () => {
    const db = new Database(':memory:')
    initSchema(db)
    const spy = jest.spyOn(db, 'prepare')
    const svc = new StorageStatusService({
      config: makeFakeConfig('sqlite'),
      redisClient: makeMockRedis(),
      getDb: () => db,
      logger: { info: () => {}, warn: () => {}, error: () => {} }
    })
    await svc.snapshot()
    const firstCallCount = spy.mock.calls.filter((c) =>
      String(c[0]).includes('integrity_check')
    ).length
    await svc.snapshot()
    const secondCallCount = spy.mock.calls.filter((c) =>
      String(c[0]).includes('integrity_check')
    ).length
    expect(secondCallCount).toBe(firstCallCount)
    db.close()
  })
})
