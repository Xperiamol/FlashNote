// AI 局部修改笔记：按 find/replace 只改指定片段；确认前用户的其他编辑保留，被替换的原文变了则拒绝
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { applyNoteEdits, previewRewrite, contentHash } = require('../../electron/services/aichat/noteEdits')
const { edit_note, resolveNoteContentEdit } = require('../../electron/services/aichat/tools/handlers/notes')
const AIChatService = require('../../electron/services/aichat')

const note = '# 周报\n\n本周完成了登录页改版。\n\n下周计划：\n- 接入支付\n- 修复同步问题\n'

test('局部修改：按顺序替换、容忍空白差异、$ 原样保留、删除与追加', () => {
  const { content, changes } = applyNoteEdits(note, {
    edits: [
      { find: '本周完成了登录页改版。', replace: '本周完成了登录页和注册页改版，费用 $5。' },
      { find: '- 接入支付\n  - 修复同步问题', replace: '- 接入支付宝\n- 修复同步问题' },
      { find: '# 周报', replace: '' },
    ],
    append: '备注：周五发布。',
  })
  assert.equal(content, '\n\n本周完成了登录页和注册页改版，费用 $5。\n\n下周计划：\n- 接入支付宝\n- 修复同步问题\n\n备注：周五发布。')
  assert.equal(changes.length, 4)
  assert.equal(changes[0].before, '本周完成了登录页改版。')
  assert.equal(changes[3].before, '')
})

test('局部修改：原文不唯一或找不到时给出可以照着修正的错误', () => {
  assert.throws(() => applyNoteEdits('- a\n- a\n', { edits: [{ find: '- a', replace: '- b' }] }), /出现了 2 次/)
  assert.throws(() => applyNoteEdits(note, { edits: [{ find: '不存在的句子', replace: 'x' }] }), /找不到.*search_in_current_note/)
  assert.throws(() => applyNoteEdits(note, { edits: [] }), /没有要应用的修改/)
  assert.deepEqual(resolveNoteContentEdit({ content: note }, { content: 'x', edits: [{ find: '周报', replace: '月报' }] }).error, 'content（整篇改写）不能和 edits / append 同时使用')
  assert.match(resolveNoteContentEdit({ content: '{}', note_type: 'whiteboard' }, { edits: [{ find: '{}', replace: '[]' }] }).error, /画布/)
})

test('整篇改写预览：只显示中间真正变化的行', () => {
  const preview = previewRewrite(note, note.replace('- 接入支付', '- 接入支付和退款'))
  assert.equal(preview.changes[0].before, '- 接入支付')
  assert.equal(preview.changes[0].after, '- 接入支付和退款')
  assert.equal(preview.changes[0].contextBefore, '下周计划：')
  assert.equal(preview.changedLines, 2)
})

const createNotes = (initial) => {
  const notes = new Map([[1, { id: 1, title: '周报', content: initial, note_type: 'markdown' }]])
  return {
    notes,
    noteDAO: {
      findById: (id) => notes.get(Number(id)) || null,
      update: (id, patch) => notes.set(Number(id), { ...notes.get(Number(id)), ...patch }),
    },
  }
}

test('完整流程：提出时校验并生成预览；确认前用户改了别处会保留，改了被替换的原文则拒绝', async () => {
  const { notes, noteDAO } = createNotes(note)
  const prepare = (args) => AIChatService.prototype._prepareNoteEdit.call({ noteDAO }, args)

  assert.match(prepare({ id: 1, edits: [{ find: '不存在', replace: 'x' }] }).error, /找不到/)
  const prepared = prepare({ id: 1, edits: [{ find: '- 接入支付', replace: '- 接入支付宝' }] })
  assert.equal(prepared.preview.mode, 'partial')
  assert.equal(prepared.preview.changes[0].after, '- 接入支付宝')
  assert.equal(prepared.args._base_hash, contentHash(note))

  // 用户在确认前补了一句（另一处）
  notes.set(1, { ...notes.get(1), content: note.replace('本周完成了登录页改版。', '本周完成了登录页改版。还写了测试。') })
  const applied = JSON.parse(await edit_note(prepared.args, {}, { noteDAO }))
  assert.equal(applied.success, true)
  assert.match(notes.get(1).content, /还写了测试。/)
  assert.match(notes.get(1).content, /- 接入支付宝/)

  // 用户在原文末尾补了几个字：原文仍能唯一定位，照样应用并保留用户补的内容
  const second = prepare({ id: 1, edits: [{ find: '- 修复同步问题', replace: '- 修复同步和备份问题' }] })
  notes.set(1, { ...notes.get(1), content: notes.get(1).content.replace('- 修复同步问题', '- 修复同步问题（已完成）') })
  assert.equal(JSON.parse(await edit_note(second.args, {}, { noteDAO })).success, true)
  assert.match(notes.get(1).content, /- 修复同步和备份问题（已完成）/)

  // 用户把要替换的那句改写了：原文已不存在，拒绝且笔记保持用户的版本
  const third = prepare({ id: 1, edits: [{ find: '- 接入支付宝', replace: '- 接入支付宝和微信' }] })
  notes.set(1, { ...notes.get(1), content: notes.get(1).content.replace('- 接入支付宝', '- 支付改用 Stripe') })
  const userVersion = notes.get(1).content
  const rejected = JSON.parse(await edit_note(third.args, {}, { noteDAO }))
  assert.equal(rejected.success, false)
  assert.match(rejected.error, /找不到/)
  assert.equal(notes.get(1).content, userVersion)
})

test('整篇改写：确认前笔记被改过就拒绝，避免覆盖用户刚写的内容', async () => {
  const { notes, noteDAO } = createNotes(note)
  const prepared = AIChatService.prototype._prepareNoteEdit.call({ noteDAO }, { id: 1, content: '# 周报（新）' })
  assert.equal(prepared.preview.mode, 'rewrite')
  notes.set(1, { ...notes.get(1), content: `${note}用户新加的一行\n` })
  const result = JSON.parse(await edit_note(prepared.args, {}, { noteDAO }))
  assert.equal(result.success, false)
  assert.match(result.error, /确认前已被修改/)
  assert.match(notes.get(1).content, /用户新加的一行/)

  const fresh = AIChatService.prototype._prepareNoteEdit.call({ noteDAO }, { id: 1, content: '# 周报（新）' })
  assert.equal(JSON.parse(await edit_note(fresh.args, {}, { noteDAO })).success, true)
  assert.equal(notes.get(1).content, '# 周报（新）')
})
