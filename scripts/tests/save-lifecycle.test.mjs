import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const { saveWindow, saveAllWindows } = require('../../electron/utils/saveWindows')
const windowWith = executeJavaScript => ({ isDestroyed: () => false, webContents: { executeJavaScript } })

test('保存屏障等待所有窗口，拒绝超时、throw 和 success:false', async () => {
  let finished = false
  const slow = windowWith(async () => { await new Promise(resolve => setTimeout(resolve, 20)); finished = true })
  await assert.rejects(saveAllWindows([slow, windowWith(async () => { throw new Error('disk full') })]), /disk full/)
  assert.equal(finished, true)
  await assert.rejects(saveWindow(windowWith(async () => ({ success: false, error: 'write failed' }))), /write failed/)
  await assert.rejects(saveWindow(windowWith(() => new Promise(() => {})), 5), /窗口已保留/)
})

test('离线队列失败保留、成功仅清本轮，重启后仍保留同步期间新增请求', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flota-offline-'))
  try {
    const context = { module: { exports: {} }, console, setInterval,
      require(name) {
        if (name === 'electron') return { app: { getPath: () => dir } }
        if (name === './NetworkService') return { getInstance: () => ({ isOnline: true }) }
        if (name === '../utils/atomicFile') return require('../../electron/utils/atomicFile')
        return require(name)
      },
    }
    vm.runInNewContext(fs.readFileSync('electron/services/OfflineSyncQueue.js', 'utf8'), context)
    const Queue = context.module.exports.OfflineSyncQueue
    const q = new Queue()
    q.enqueue({ type: 'manual-sync' })
    q.setSyncFunction(async () => ({ success: false }))
    await q.flush()
    assert.equal(new Queue().length, 1)
    q.setSyncFunction(async () => { q.enqueue({ type: 'new-edit' }); return { success: true } })
    await q.flush()
    assert.equal(q.length, 1)
    assert.equal(new Queue()._queue[0].type, 'new-edit')
    q.setSyncFunction(async () => { throw new Error('offline') })
    await q.flush()
    assert.equal(q.length, 1)
    q.setSyncFunction(async () => ({ success: true }))
    await q.flush()
    assert.equal(new Queue().length, 0)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('保存屏障把关闭和同步原因传到渲染层', async () => {
  const reasons = []
  const win = windowWith(code => vm.runInNewContext(code, { window: { __flushEditorSaves: options => { reasons.push(options.reason) } } }))
  await saveWindow(win)
  await saveAllWindows([win], { reason: 'sync' })
  assert.deepEqual(reasons, ['close', 'sync'])
})
