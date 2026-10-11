import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

let source = await readFile(new URL('../../src/utils/aiExcalidrawGenerator.js', import.meta.url), 'utf8')
source = source.replace(/^import .*$/gm, '')
source = `
const logger = { log() {}, warn() {} }
const computeOffset = () => ({ offsetX: 100, offsetY: 100 })
const DIAGRAM_THEME = { canvas: '#ffffff' }
const renderMermaidNative = async code => globalThis.__renderMermaid(code)
const renderComposer = tree => globalThis.__renderComposer(tree)
const createSvgAsset = text => globalThis.__createSvgAsset(text)
` + source
const { aiGenerateExcalidrawElements: generate } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const setup = replies => {
  const calls = []
  globalThis.window = { electronAPI: { ai: { chat: async messages => { calls.push(messages); return replies.shift() } } } }
  globalThis.__renderMermaid = () => ({ elements: [{ id: 'mermaid' }] })
  globalThis.__renderComposer = () => ({ elements: [{ id: 'composer' }] })
  globalThis.__createSvgAsset = text => {
    if (!text.endsWith('</svg>')) throw new Error('SVG 标签未闭合')
    return { elements: [{ id: 'svg' }], files: { svg: {} } }
  }
  return calls
}
const ok = content => ({ success: true, data: { content } })
test('状态流转及带流程字样的时序图不会误走 flowchart', async () => {
  for (const [prompt, type] of [['画订单状态流转图', 'stateDiagram'], ['以时序图呈现登录流程', 'sequenceDiagram'], ['以类图呈现审批步骤', 'classDiagram']]) {
    const calls = setup([ok('valid')])
    await generate(prompt)
    assert.match(calls[0][0].content, new RegExp(type))
  }
})
test('SVG 校验失败仅修复一次，修复失败包含两次错误', async () => {
  const calls = setup([ok('<svg>'), ok('<svg>still broken')])
  await assert.rejects(generate('用 SVG 画 NTU 海报'), /首次校验失败.*自动修复后仍失败/)
  assert.equal(calls.length, 2)
  assert.match(calls[1].at(-1).content, /标签未闭合/)
})
test('SVG 修复成功返回完整图片资产', async () => {
  const calls = setup([ok('<svg>'), ok('<svg></svg>')])
  const result = await generate('用 SVG 画 NTU 海报')
  assert.equal(result.elements[0].id, 'svg')
  assert.ok(result.files.svg)
  assert.equal(calls.length, 2)
})
test('网关和网络失败不触发反思请求；Mermaid 保留上游错误', async () => {
  for (const prompt of ['SVG 海报', '流程图']) {
    const calls = setup([{ success: false, error: '请求失败 (503)' }])
    await assert.rejects(generate(prompt), /服务暂时不可用/)
    assert.equal(calls.length, 1)
  }
})
test('局部 SVG 降级保留节点 ID 和连线引用，且向上报告警告', async () => {
  const tree = { children: [{ type: 'svg', props: { id: 'visual', prompt: 'NTU 插画' } }, { type: 'card', props: { id: 'date', title: '23 Oct 2026' } }], connectors: [{ from: 'visual', to: 'date' }] }
  setup([ok(JSON.stringify(tree)), { success: false, error: '模型返回空正文' }])
  let rendered
  globalThis.__renderComposer = value => { rendered = value; return { elements: [{ id: 'card' }] } }
  const result = await generate('画 NTU 挑战赛全景图')
  assert.equal(rendered.children[0].type, 'card')
  assert.equal(rendered.children[0].props.id, 'visual')
  assert.equal(rendered.connectors[0].from, 'visual')
  assert.match(result.warnings[0], /模型返回空正文/)
})

test('取消贯穿 SVG、Mermaid、Composer 请求，不触发自动修复或降级', async () => {
  for (const prompt of ['SVG 海报', '流程图', '全景图']) {
    let calls = 0
    setup([])
    const task = { chat: async () => { calls++; throw Object.assign(new Error('已停止生成'), { name: 'AbortError' }) } }
    await assert.rejects(generate(prompt, [], task), { name: 'AbortError' })
    assert.equal(calls, 1)
  }
})
