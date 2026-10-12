// 组件生成：修改时按 SEARCH/REPLACE 只改需要的部分；输出被截断时续写拼接，复杂组件不再因长度失败
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const WidgetGenerator = require('../../electron/services/widgets/WidgetGenerator')

const base = [
  '<!doctype html><html><head>',
  '<script type="application/flota-widget">{"name":"计数器","sizes":["medium"]}</script>',
  '</head><body>',
  '  <button id="add">加一</button>',
  '  <script>',
  "    const price = '$1'",
  '    let count = 0',
  "    document.getElementById('add').onclick = () => { count += 1 }",
  '  </script>',
  '</body></html>',
].join('\n')

const patch = (search, replace) => `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`

test('SEARCH/REPLACE：按顺序应用，容忍缩进差异，$ 原样保留，找不到或不唯一时报错', () => {
  const { applyPatches, parsePatches } = WidgetGenerator
  const text = `改成加二，并显示计数。\n${patch('    let count = 0', '    let count = 0 // 计数')}\n${patch("document.getElementById('add').onclick = () => { count += 1 }", "    document.getElementById('add').onclick = () => { count += 2; render('$&') }")}`
  const patches = parsePatches(text)
  assert.equal(patches.length, 2)
  const result = applyPatches(base, patches)
  assert.match(result, /let count = 0 \/\/ 计数/)
  assert.match(result, /count \+= 2; render\('\$&'\)/)
  assert.match(result, /const price = '\$1'/)
  assert.match(result, /<button id="add">加一<\/button>/)

  assert.throws(() => applyPatches(base, [{ search: 'let missing = 1', replace: 'x' }]), /第 1 个修改块.*找不到/)
  assert.throws(() => applyPatches(`${base}\n${base}`, [{ search: '<button id="add">加一</button>', replace: 'x' }]), /出现了 2 次/)
})

const fakeWidgetService = () => ({
  listWidgets: () => [],
  dao: { listInstances: () => [], listCollections: () => [] },
})

const createGenerator = (responses, seen = []) => new WidgetGenerator({
  widgetService: fakeWidgetService(),
  getChatService: () => ({
    _generatePlainText: async (messages) => {
      seen.push(messages)
      const next = responses.shift()
      if (!next) throw new Error('没有更多模拟响应')
      return typeof next === 'string' ? { content: next, truncated: false } : next
    },
  }),
})

test('输出被截断：自动续写并拼接，去掉续写开头重复的代码块标记', async () => {
  const full = `\`\`\`html\n${base}\n\`\`\``
  const cut = full.indexOf('let count')
  const seen = []
  const generator = createGenerator([
    { content: full.slice(0, cut), truncated: true },
    { content: `\`\`\`html\n${full.slice(cut)}`, truncated: false },
  ], seen)
  const result = await generator.generate({ instruction: '做一个计数器', requestId: 'r1' })
  assert.equal(result.code, base)
  assert.equal(seen.length, 2)
  assert.match(seen[1].at(-1).content, /截断/)
  assert.equal(seen[1].at(-2).role, 'assistant')

  const always = createGenerator(Array.from({ length: 4 }, () => ({ content: 'x', truncated: true })))
  await assert.rejects(always.generate({ instruction: '超长', requestId: 'r2' }), { code: 'TRUNCATED' })
})

test('修改已有组件：只输出改动片段即可；片段对不上时提示后可改为输出完整 HTML', async () => {
  const generator = createGenerator([`把按钮改名。\n${patch('<button id="add">加一</button>', '<button id="add">加一个</button>')}`])
  const edited = await generator.generate({ instruction: '按钮改成“加一个”', baseCode: base, requestId: 'r3' })
  assert.equal(edited.code, base.replace('加一</button>', '加一个</button>'))
  assert.equal(edited.explanation, '把按钮改名。')

  const rewritten = base.replace('加一', '加 1')
  const seen = []
  const retry = createGenerator([
    patch('<button>不存在</button>', 'x'),
    `\`\`\`html\n${rewritten}\n\`\`\``,
  ], seen)
  const result = await retry.generate({ instruction: '改文字', baseCode: base, requestId: 'r4' })
  assert.equal(result.code, rewritten)
  assert.match(seen[1].at(-1).content, /逐字一致/)
  // 修改时的请求里说明了 SEARCH/REPLACE 输出方式
  assert.ok(seen[0].some((message) => message.role === 'user' && /<<<<<<< SEARCH/.test(message.content)))
})
