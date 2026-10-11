// 真实 SQLite + 子进程：回收中崩溃、多个回收者竞争、旧 .recover 遗留。
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { fork } = require('node:child_process')
const Database = require('better-sqlite3')
const repo = path.resolve(__dirname, '../..')
function load(relative, overrides = {}) {
  const context = { module: { exports: {} }, console, process, Buffer, setTimeout, setImmediate,
    require(name) { return overrides[name] || (name.startsWith('.') ? {} : require(name)) } }
  vm.runInNewContext(fs.readFileSync(path.join(repo, relative), 'utf8'), context)
  return context.module.exports
}
if (process.argv[2] === '--child') {
  const dir = process.argv[3], mode = process.argv[4]
  const db = new Database(path.join(dir, 'locks.sqlite'))
  const Storage = load('electron/services/sync/StorageAdapter.js')
  const storage = Object.assign(Object.create(Storage.prototype), { db })
  const lockFilePath = path.join(dir, 'sync.lock')
  const Engine = load('electron/services/sync/SyncEngine.js', { fs: { ...fs, unlinkSync(file) {
    fs.unlinkSync(file)
    if (mode === 'crash' && file === lockFilePath) process.exit(73)
  } } })
  const engine = Object.assign(Object.create(Engine.prototype), { storage, lockFilePath, logError() {} })
  try {
    engine.acquireSyncLock()
    if (mode === 'orphan') process.exit(0)
    process.send({ acquired: true })
    process.once('message', () => { engine.releaseSyncLock(); db.close(); process.exit(0) })
  } catch (error) {
    process.send({ acquired: false, error: error.message })
    db.close(); process.exit(0)
  }
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flota-sync-lock-'))
  const children = []
  const spawn = mode => {
    const child = fork(__filename, ['--child', dir, mode], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    children.push(child)
    let stderr = ''; child.stderr.on('data', data => { stderr += data })
    const done = new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve({ code, signal, stderr }))
    })
    return { child, done }
  }
  ;(async () => {
    const db = new Database(path.join(dir, 'locks.sqlite')); db.pragma('journal_mode = WAL'); db.close()
    assert.equal((await spawn('orphan').done).code, 0)
    fs.writeFileSync(path.join(dir, 'sync.lock.recover'), '')
    assert.equal((await spawn('crash').done).code, 73)
    const competitors = Array.from({ length: 6 }, () => spawn('hold'))
    const results = await Promise.all(competitors.map(({ child, done }) => Promise.race([
      new Promise(resolve => child.once('message', resolve)),
      done.then(result => ({ acquired: false, unexpectedExit: result })),
    ])))
    assert.equal(results.filter(result => result.acquired).length, 1, JSON.stringify(results))
    for (const result of results.filter(result => !result.acquired)) assert.match(result.error, /进行中/)
    competitors[results.findIndex(result => result.acquired)].child.send('release')
    await Promise.all(competitors.map(item => item.done))
    assert.equal(fs.existsSync(path.join(dir, 'sync.lock')), false)
    console.log('RESULT ok: crash recovery, orphan marker, six-process mutual exclusion')
  })().catch(error => { console.error('ERROR', error.stack); process.exitCode = 1 }).finally(() => {
    for (const child of children) if (child.exitCode === null) child.kill()
    fs.rmSync(dir, { recursive: true, force: true })
  })
}
