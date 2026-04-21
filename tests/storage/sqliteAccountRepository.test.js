'use strict'

const Database = require('better-sqlite3')
const { initSchema } = require('../../src/storage/schema')
const SqliteAccountRepository = require('../../src/storage/repositories/SqliteAccountRepository')

const PLATFORMS = [
  'claude',
  'claude-console',
  'gemini',
  'gemini-api',
  'openai',
  'openai-responses',
  'bedrock',
  'azure-openai',
  'ccr',
  'droid'
]

function makeDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  initSchema(db)
  return db
}

describe('SqliteAccountRepository', () => {
  let db
  let repo

  beforeEach(() => {
    db = makeDb()
    repo = new SqliteAccountRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  test.each(PLATFORMS)('roundtrip save/find for platform: %s', async (platform) => {
    await repo.save(platform, 'acc1', {
      name: `${platform}-acc-1`,
      status: 'active',
      refreshToken: 'encrypted-rt',
      proxy: '{"type":"http","host":"x"}'
    })
    const got = await repo.findById(platform, 'acc1')
    expect(got.id).toBe('acc1')
    expect(got.platform).toBe(platform)
    expect(got.name).toBe(`${platform}-acc-1`)
    expect(got.refreshToken).toBe('encrypted-rt')
    expect(got.proxy).toBe('{"type":"http","host":"x"}')
  })

  test('findById on missing returns {}', async () => {
    const got = await repo.findById('claude', 'none')
    expect(got).toEqual({})
  })

  test('save merges data JSON on update', async () => {
    await repo.save('claude', 'a', {
      name: 'n',
      refreshToken: 'rt1',
      proxy: '{"host":"p1"}'
    })
    await repo.save('claude', 'a', { refreshToken: 'rt2' })
    const got = await repo.findById('claude', 'a')
    expect(got.refreshToken).toBe('rt2')
    expect(got.proxy).toBe('{"host":"p1"}') // preserved
  })

  test('getAllByPlatform returns only that platform', async () => {
    await repo.save('claude', 'c1', { name: 'c' })
    await repo.save('gemini', 'g1', { name: 'g' })
    await repo.save('openai', 'o1', { name: 'o' })
    expect((await repo.getAllByPlatform('claude')).map((a) => a.id)).toEqual(['c1'])
    expect((await repo.getAllByPlatform('gemini')).map((a) => a.id)).toEqual(['g1'])
  })

  test('delete is a no-op when platform does not match the stored row', async () => {
    // id is globally unique by design (see proposal / design.md) — account ids are UUIDs
    await repo.save('claude', 'uuid-1', { name: 'n' })
    expect(await repo.delete('gemini', 'uuid-1')).toBe(0)
    expect((await repo.findById('claude', 'uuid-1')).name).toBe('n')
    expect(await repo.delete('claude', 'uuid-1')).toBe(1)
    expect(await repo.findById('claude', 'uuid-1')).toEqual({})
  })

  test('unsupported platform throws', async () => {
    await expect(repo.save('mars', 'a', {})).rejects.toThrow(/Unsupported/)
    await expect(repo.findById('mars', 'a')).rejects.toThrow(/Unsupported/)
    await expect(repo.delete('mars', 'a')).rejects.toThrow(/Unsupported/)
  })
})
