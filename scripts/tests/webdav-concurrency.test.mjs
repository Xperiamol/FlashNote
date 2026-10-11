import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ctx = { module: { exports: {} }, console, setTimeout, Buffer,
  require(name) {
    if (name === 'electron') return { app: { getPath() { throw new Error('isolated') } } }
    if (name.startsWith('.')) return require('../../electron/services/sync/' + name)
    return require(name)
  },
}
vm.runInNewContext(fs.readFileSync('electron/services/sync/webdavClient.js', 'utf8'), ctx)
const Client = ctx.module.exports

test('真实 HTTP 条件写入：两个读取者只能一个提交，首次创建不能互相覆盖', async () => {
  const entries = new Map([['/manifest.json', { body: 'base', version: 1 }]])
  let noPutETag = false, weakGET = false
  const server = http.createServer(async (req, res) => {
    const entry = entries.get(req.url)
    const etag = entry && `"v${entry.version}"`
    if (req.method === 'GET') {
      if (!entry) { res.writeHead(404); res.end(); return }
      res.setHeader('ETag', weakGET ? `W/${etag}` : etag)
      res.end(entry.body); return
    }
    if ((req.headers['if-match'] && req.headers['if-match'] !== etag) ||
        (req.headers['if-none-match'] === '*' && entry)) {
      res.writeHead(412); res.end(); return
    }
    let body = ''; for await (const chunk of req) body += chunk
    const next = { body, version: (entry?.version || 0) + 1 }
    entries.set(req.url, next)
    if (!noPutETag) res.setHeader('ETag', `"v${next.version}"`)
    res.writeHead(201); res.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const create = () => { const c = new Client({ baseUrl: `http://127.0.0.1:${server.address().port}`, retryAttempts: 1 }); c.beginSync(); return c }
  try {
    const a = create(), b = create()
    await Promise.all([a.downloadText('/manifest.json'), b.downloadText('/manifest.json')])
    await a.uploadText('/manifest.json', 'A')
    await assert.rejects(b.uploadText('/manifest.json', 'B'), error => error.code === 'SYNC_CONCURRENT_WRITE')
    assert.equal(entries.get('/manifest.json').body, 'A')
    await a.uploadText('/new.md', 'created A')
    await assert.rejects(b.uploadText('/new.md', 'created B'), error => error.code === 'SYNC_CONCURRENT_WRITE')
    const retry = create()
    await retry.uploadText('/new.md', 'created A') // 已提交但响应丢失的重试可确认成功。
    noPutETag = true
    await a.uploadText('/manifest.json', 'A2')
    await a.uploadText('/manifest.json', 'A3') // PUT 不返回 ETag 时，GET 校验自己的版本后再提交。
    const c = create()
    await c.downloadText('/manifest.json')
    await c.uploadText('/manifest.json', 'C')
    await assert.rejects(a.uploadText('/manifest.json', 'A4'), /发生变化|其他设备修改/)

    // 真实引擎 + HTTP：正文提交后进程退出、manifest 仍旧时，可以恢复；
    // 恢复校验之后另一设备写入，则仍由 ETag 拒绝覆盖。
    const engineContext = { module: { exports: {} }, console, Buffer, process, setTimeout,
      require: name => name.startsWith('.') ? {} : require(name) }
    vm.runInNewContext(fs.readFileSync('electron/services/sync/SyncEngine.js', 'utf8'), engineContext)
    const engine = Object.assign(Object.create(engineContext.module.exports.prototype), {
      log() {}, config: { syncCategories: [] }, client: create(),
      storage: { calculateNoteHash: () => 'b'.repeat(32) },
      _lastRemoteManifest: { files: { note: { ext: '.md', h: 'a'.repeat(32) } } },
    })
    entries.set('/note.md', { body: 'interrupted upload', version: 1 })
    const task = { fileId: 'note', remotePath: '/note.md', data: { content: 'interrupted upload' } }
    await engine.executeUpload(task)
    assert.equal(entries.get('/note.md').body, task.data.content)
    engine.client = create()
    const upload = engine.client.uploadText.bind(engine.client)
    engine.client.uploadText = async (...args) => {
      const other = create(); await other.downloadText('/note.md'); await other.uploadText('/note.md', 'another device')
      return upload(...args)
    }
    await assert.rejects(engine.executeUpload(task), error => error.code === 'SYNC_CONCURRENT_WRITE')
    assert.equal(entries.get('/note.md').body, 'another device')

    weakGET = true
    const d = create(); await d.downloadText('/manifest.json')
    await assert.rejects(d.uploadText('/manifest.json', 'D'), /强 ETag/)
    assert.equal(entries.get('/manifest.json').body, 'C')
  } finally { await new Promise(resolve => server.close(resolve)) }
})
