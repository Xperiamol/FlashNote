import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { writeFileAtomic } = require('../../electron/utils/atomicFile')
const { ImageStorageService } = require('../../electron/services/ImageStorageService')

test('原子写入中途失败保留旧文件，并清理半截临时文件', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flota-atomic-'))
  try {
    const file = path.join(dir, 'image.png')
    fs.writeFileSync(file, 'original')
    const context = { module: { exports: {} }, console, require(name) {
      if (name !== 'fs') return require(name)
      return { promises: { ...fs.promises, open: async (...args) => {
        const handle = await fs.promises.open(...args)
        return {
          writeFile: async () => { await handle.writeFile('partial'); throw new Error('disk full') },
          sync: () => handle.sync(), close: () => handle.close(),
        }
      } } }
    } }
    vm.runInNewContext(fs.readFileSync('electron/utils/atomicFile.js', 'utf8'), context)
    await assert.rejects(context.module.exports.writeFileAtomic(file, 'new'), /disk full/)
    assert.equal(fs.readFileSync(file, 'utf8'), 'original')
    assert.deepEqual(fs.readdirSync(dir), ['image.png'])
    await writeFileAtomic(file, Buffer.from('complete'))
    assert.equal(fs.readFileSync(file, 'utf8'), 'complete')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('并发写同一目标只有完整版本，不共享临时文件', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flota-atomic-'))
  try {
    const file = path.join(dir, 'asset')
    const versions = ['a'.repeat(65536), 'b'.repeat(65536)]
    await Promise.all(versions.map(value => writeFileAtomic(file, value)))
    assert.ok(versions.includes(fs.readFileSync(file, 'utf8')))
    assert.deepEqual(fs.readdirSync(dir), ['asset'])
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('内容寻址画布图片不能复用旧版半文件', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flota-atomic-'))
  try {
    const service = Object.create(ImageStorageService.prototype)
    service.whiteboardDir = dir
    service.initialize = async () => {}
    const data = 'data:image/png;base64,' + Buffer.from('complete-image-bytes').toString('base64')
    const name = service.generateFileName(data)
    fs.writeFileSync(path.join(dir, name), 'partial')
    assert.equal(await service.saveWhiteboardImage('id', data), name)
    assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), 'complete-image-bytes')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
