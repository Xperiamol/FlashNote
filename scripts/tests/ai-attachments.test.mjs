import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const load = async path => import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL(path, import.meta.url), 'utf8')).toString('base64')}`)
const { readAIAttachment, buildAttachmentMessage } = await load('../../src/utils/aiAttachments.js')
const { imageUploadName } = await load('../../src/utils/editorImageSource.js')

test('图片按原格式编码，图片与文本可以一起发送', async () => {
  const image = await readAIAttachment(new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' }), { visionEnabled: true })
  const text = await readAIAttachment(new File(['截止日期 23 Oct 2026'], 'dates.md'))
  const content = buildAttachmentMessage('整理一下', [image, text])
  assert.equal(content[1].image_url.url, 'data:image/jpeg;base64,AQID')
  assert.match(content[0].text, /截止日期 23 Oct 2026/)
  assert.match(content[0].text, /dates.md/)
})
test('关闭图片理解、超限和不支持的文件都有明确反馈', async () => {
  await assert.rejects(readAIAttachment(new File(['a'], 'a.png')), /开启图片理解/)
  await assert.rejects(readAIAttachment({ name: 'a.png', size: 7 * 1024 * 1024 }, { visionEnabled: true }), /6 MB/)
  await assert.rejects(readAIAttachment(new File(['binary'], 'report.pdf')), /暂不支持/)
  await assert.rejects(readAIAttachment(new File(['\0data'], 'bad.txt')), /不是可读取的文本/)
  await assert.rejects(readAIAttachment(new File(['a'.repeat(30001)], 'long.md')), /30,000/)
})
test('仅附件也可形成有效消息，纯文本文件不伪装成图片', async () => {
  const text = await readAIAttachment(new File(['hello'], 'a.txt'))
  assert.equal(buildAttachmentMessage('', [text]), '附件「a.txt」内容：\nhello')
  assert.equal(buildAttachmentMessage('', [{ kind: 'image', dataUrl: 'data:image/png;base64,AA==' }])[0].text, '请查看这些图片。')
})
test('粘贴图片文件名与真实 MIME 一致，不强制命名为 PNG', () => {
  assert.match(imageUploadName({ type: 'image/jpeg' }), /\.jpg$/)
  assert.match(imageUploadName({ type: 'image/webp' }), /\.webp$/)
  assert.match(imageUploadName({ type: '', name: '照片.GIF' }), /\.gif$/)
  assert.throws(() => imageUploadName({ type: 'image/heic' }), /无法识别/)
})
let dataSource = await readFile(new URL('../../src/utils/dataUrlImage.js', import.meta.url), 'utf8')
dataSource = dataSource.replace("import { imageAPI } from '../api/imageAPI'", 'const imageAPI = {}')
const { dataUrlToBuffer } = await import(`data:text/javascript;base64,${Buffer.from(dataSource).toString('base64')}`)
test('非 base64 的中文 SVG 使用 UTF-8 编码，保存后不损坏文字', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>日期与挑战赛</text></svg>'
  const parsed = dataUrlToBuffer(`data:image/svg+xml,${encodeURIComponent(svg)}`)
  assert.equal(new TextDecoder().decode(parsed.buffer), svg)
})
