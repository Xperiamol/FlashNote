import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const source = fs.readFileSync('electron/services/ExternalFileService.js', 'utf8')
const atomicSource = fs.readFileSync('electron/utils/atomicFile.js', 'utf8')
function serviceWith(fsOverrides = {}) {
  const fakeFs = { ...fs, ...fsOverrides }
  const atomic = { module: { exports: {} }, console, require: name => name === 'fs' ? fakeFs : require(name) }
  vm.runInNewContext(atomicSource, atomic)
  const context = { module: { exports: {} }, Buffer, TextDecoder, URL, process, require: name => {
    if (name === './ExternalFileDraftStore') return require('../../electron/services/ExternalFileDraftStore')
    if (name === './documents') return require('../../electron/services/documents')
    if (name === 'fs') return fakeFs
    if (name === '../utils/atomicFile') return atomic.module.exports
    return require(name)
  } }
  vm.runInNewContext(source, context)
  return new context.module.exports.ExternalFileService()
}
function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flota-external-'))
  try { fn(dir) } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}
test('外部文件半写入或 rename 失败保留原文，清理临时文件', () => fixture(dir => {
  const file = path.join(dir, 'note.md'); fs.writeFileSync(file, 'original')
  for (const overrides of [
    { writeFileSync(fd) { fs.writeFileSync(fd, 'partial'); throw new Error('disk full') } },
    { renameSync() { throw new Error('rename failed') } },
  ]) {
    const service = serviceWith(overrides); service.allow(file)
    assert.throws(() => service.write(file, 'new'), /disk full|rename failed/)
    assert.equal(fs.readFileSync(file, 'utf8'), 'original')
    assert.deepEqual(fs.readdirSync(dir), ['note.md'])
  }
}))
test('外部文件保存保留 UTF16、CRLF、权限以及符号链接', () => fixture(dir => {
  const target = path.join(dir, 'target.txt'), link = path.join(dir, 'link.txt')
  fs.writeFileSync(target, Buffer.concat([Buffer.from([255, 254]), Buffer.from('旧\r\n文', 'utf16le')]), { mode: 0o640 })
  fs.symlinkSync(target, link)
  const service = serviceWith(); service.allow(link)
  const before = service.read(link)
  const result = service.write(link, '新\n文', { expectedRevision: before.revision })
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true)
  assert.equal(fs.statSync(target).mode & 0o777, 0o640)
  assert.deepEqual(fs.readFileSync(target), Buffer.concat([Buffer.from([255, 254]), Buffer.from('新\r\n文', 'utf16le')]))
  assert.equal(service.read(link).revision, result.revision)
}))
test('外部修改即使保持相同 mtime 仍触发冲突，强制覆盖须显式指定', () => fixture(dir => {
  const file = path.join(dir, 'note.md'); fs.writeFileSync(file, 'old')
  const service = serviceWith(); service.allow(file)
  const before = service.read(file)
  fs.writeFileSync(file, 'external'); fs.utimesSync(file, new Date(), new Date(before.modifiedAt))
  const options = { expectedMtime: before.modifiedAt, expectedRevision: before.revision }
  assert.equal(service.write(file, 'mine', options).conflict, true)
  assert.equal(fs.readFileSync(file, 'utf8'), 'external')
  service.write(file, 'mine', { ...options, force: true })
  assert.equal(fs.readFileSync(file, 'utf8'), 'mine')
}))
test('临时文件写入期间的外部更新不能被覆盖', () => fixture(dir => {
  const file = path.join(dir, 'note.md'); fs.writeFileSync(file, 'old')
  const service = serviceWith({ fsyncSync(fd) { fs.fsyncSync(fd); fs.writeFileSync(file, 'external') } })
  service.allow(file)
  assert.throws(() => service.write(file, 'mine', { force: true }), /保存期间/)
  assert.equal(fs.readFileSync(file, 'utf8'), 'external')
  assert.deepEqual(fs.readdirSync(dir), ['note.md'])
}))
test('损坏白板或不完整保存载荷不会被默认为空白画布', () => fixture(dir => {
  const file = path.join(dir, 'scene.excalidraw'); fs.writeFileSync(file, '{broken')
  const service = serviceWith(); service.allow(file)
  assert.throws(() => service.writeWhiteboard(file, { elements: [], files: {} }), /JSON/)
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken')
  const original = JSON.stringify({ elements: [{ id: 'keep' }], files: {}, appState: { gridSize: 20 }, custom: 'keep' })
  fs.writeFileSync(file, original)
  assert.throws(() => service.writeWhiteboard(file, {}), /不完整/)
  assert.equal(fs.readFileSync(file, 'utf8'), original)
  service.writeWhiteboard(file, { elements: [], files: {}, appState: { viewBackgroundColor: '#aaa' } })
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(saved.custom, 'keep'); assert.equal(saved.appState.gridSize, 20)
}))
test('硬链接文件拒绝悄悄分叉成不同内容', () => fixture(dir => {
  const file = path.join(dir, 'note.md'); fs.writeFileSync(file, 'old')
  fs.linkSync(file, path.join(dir, 'linked.md'))
  const service = serviceWith(); service.allow(file)
  assert.throws(() => service.write(file, 'mine'), /硬链接/)
  assert.equal(fs.readFileSync(file, 'utf8'), 'old')
}))

test('外部文件草稿跨服务重启恢复，旧保存不能清掉新草稿', () => fixture(dir => {
  const { ExternalFileService } = require('../../electron/services/ExternalFileService')
  const file = path.join(dir, 'note.md'); fs.writeFileSync(file, 'disk-original')
  const options = { draftDirectory: path.join(dir, 'drafts') }
  const first = new ExternalFileService(options); first.allow(file)
  const baseRevision = first.read(file).revision
  first.stageDraft(file, { token: 'first', format: 'markdown', text: 'unsaved', baseRevision })
  const restarted = new ExternalFileService(options); restarted.allow(file)
  assert.equal(restarted.read(file).draft.text, 'unsaved')
  assert.equal(fs.readFileSync(file, 'utf8'), 'disk-original')
  restarted.stageDraft(file, { token: 'second', format: 'markdown', text: 'newer', baseRevision })
  restarted.clearDraft(file, 'first')
  assert.equal(restarted.read(file).draft.text, 'newer')
  restarted.clearDraft(file, 'second')
  assert.equal(restarted.read(file).draft, null)
}))

test('外部文件恢复草稿损坏时仍能打开原文件，损坏草稿另存保留', () => fixture(dir => {
  const { ExternalFileService } = require('../../electron/services/ExternalFileService')
  const file = path.join(dir, 'note.md'); fs.writeFileSync(file, 'disk-original')
  const draftDirectory = path.join(dir, 'drafts')
  const service = new ExternalFileService({ draftDirectory }); service.allow(file)
  service.stageDraft(file, { token: 'a', format: 'markdown', text: 'x', baseRevision: service.read(file).revision })
  const [name] = fs.readdirSync(draftDirectory)
  fs.writeFileSync(path.join(draftDirectory, name), '{broken')
  const data = service.read(file)
  assert.equal(data.raw, 'disk-original')
  assert.equal(data.draft, null)
  assert.match(data.draftError, /损坏/)
  assert.ok(fs.readdirSync(draftDirectory).some(entry => entry.includes('.corrupt-')))
  assert.equal(service.read(file).draftError, undefined)
}))
