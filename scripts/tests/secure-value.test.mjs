// 本机机密存储：macOS 改用本机密钥（不再触发钥匙串弹窗），旧钥匙串密文一次性迁移
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const secureValue = require('../../electron/utils/secureValue')
const { migrateLegacySettingSecrets } = require('../../electron/services/SecretMigration')

const withKeyDir = (fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flota-secret-'))
  try { return fn(path.join(dir, 'secret.key')) } finally {
    secureValue.configure({ platform: process.platform, keyPath: null })
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('macOS：用本机密钥加密，密钥文件仅本人可读、重启后仍能解开，篡改的密文被拒绝', () => withKeyDir((keyPath) => {
  secureValue.configure({ platform: 'darwin', keyPath })
  assert.equal(secureValue.canEncrypt(), true)
  const first = secureValue.encryptValue('sk-test-123')
  const second = secureValue.encryptValue('sk-test-123')
  assert.match(first, /^enc:v2:/)
  assert.notEqual(first, second)
  assert.equal(secureValue.isEncryptedValue(first), true)
  assert.equal(fs.statSync(keyPath).mode & 0o777, 0o600)

  secureValue.configure({ platform: 'darwin', keyPath }) // 模拟重启：重新读取密钥文件
  assert.equal(secureValue.decryptValue(first), 'sk-test-123')
  const tampered = `${first.slice(0, -4)}AAAA`
  assert.equal(secureValue.decryptValue(tampered), '')
  assert.equal(secureValue.decryptValue('明文'), '明文')
}))

test('macOS：密钥文件损坏时报不可用，不会悄悄生成新密钥覆盖它', () => withKeyDir((keyPath) => {
  fs.writeFileSync(keyPath, 'short')
  secureValue.configure({ platform: 'darwin', keyPath })
  assert.equal(secureValue.canEncrypt(), false)
  assert.equal(fs.readFileSync(keyPath, 'utf8'), 'short')
  assert.equal(secureValue.encryptValue('x'), 'x')
}))

test('迁移：只处理旧钥匙串密文，解不开的清空，已是新格式或其他平台不动', () => withKeyDir((keyPath) => {
  secureValue.configure({ platform: 'darwin', keyPath })
  const current = secureValue.encryptValue('new-key')
  const rows = new Map([
    ['ai_api_key', 'enc:v1:legacy-from-keychain'],
    ['caldav_password', 'enc:v1:other-device'],
    ['web_search_api_key', current],
    ['theme', 'dark'],
  ])
  const db = {
    prepare: (sql) => ({
      all: () => [...rows].filter(([, value]) => value.startsWith('enc:v1:')).map(([key, value]) => ({ key, value })),
      run: (value, key) => { assert.match(sql, /^UPDATE settings/); rows.set(key, value) },
    }),
  }
  // 模拟钥匙串：只有第一条能解开
  const originalDecrypt = secureValue.decryptValue
  secureValue.decryptValue = (value) => (value === 'enc:v1:legacy-from-keychain' ? 'sk-legacy' : value.startsWith('enc:v1:') ? '' : originalDecrypt(value))
  try {
    assert.deepEqual(migrateLegacySettingSecrets(db), { migrated: 1, cleared: 1 })
  } finally { secureValue.decryptValue = originalDecrypt }
  assert.match(rows.get('ai_api_key'), /^enc:v2:/)
  assert.equal(secureValue.decryptValue(rows.get('ai_api_key')), 'sk-legacy')
  assert.equal(rows.get('caldav_password'), '')
  assert.equal(rows.get('web_search_api_key'), current)
  assert.equal(rows.get('theme'), 'dark')

  secureValue.configure({ platform: 'win32', keyPath })
  assert.deepEqual(migrateLegacySettingSecrets({ prepare: () => { throw new Error('不应访问数据库') } }), { migrated: 0, cleared: 0 })
  assert.equal(secureValue.needsMigration('enc:v1:x'), false)
}))
