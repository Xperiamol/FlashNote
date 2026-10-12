// 组件能力扩展：联网（域名白名单、内网拦截、授权）、通知与定时提醒、文件对话框、剪贴板、跨组件只读
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { WidgetNet, isPrivateAddress, hostAllowed } = require('../../electron/services/widgets/WidgetNet')
const { WidgetScheduler, nextOccurrence } = require('../../electron/services/widgets/WidgetScheduler')
const WidgetService = require('../../electron/services/widgets/WidgetService')

const manifestCode = (manifest) => `<!doctype html><html><head><script type="application/flota-widget">${JSON.stringify(manifest)}</script></head><body></body></html>`
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }]
const jsonResponse = (data, init = {}) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' }, ...init })

test('联网：只允许清单里的 https 域名，拒绝内网、IP 与非默认端口', async () => {
  const calls = []
  const netter = new WidgetNet({ lookup: publicLookup, fetchImpl: async (url, init) => { calls.push({ url, init }); return jsonResponse({ ok: 1 }) } })
  const policy = { owner: 'w1', hosts: ['api.example.com', '*.open-meteo.com'] }
  const result = await netter.fetch({ url: 'https://api.example.com/v1?q=1', headers: { Authorization: 'Bearer x', Cookie: 'a=b', Origin: 'evil' } }, policy)
  assert.deepEqual(result.data, { ok: 1 })
  assert.equal(result.ok, true)
  assert.equal(calls[0].init.headers.Authorization, 'Bearer x')
  assert.equal(calls[0].init.headers.Cookie, undefined)
  assert.equal(calls[0].init.headers.Origin, undefined)
  assert.equal(calls[0].init.credentials, 'omit')
  await netter.fetch({ url: 'https://geocoding-api.open-meteo.com/x' }, policy)
  await netter.fetch({ url: 'https://open-meteo.com/x' }, policy)

  await assert.rejects(netter.fetch({ url: 'https://other.com/' }, policy), { code: 'NET_HOST_NOT_ALLOWED' })
  await assert.rejects(netter.fetch({ url: 'http://api.example.com/' }, policy), { code: 'NET_INSECURE' })
  await assert.rejects(netter.fetch({ url: 'https://api.example.com:8443/' }, policy), { code: 'NET_HOST_NOT_ALLOWED' })
  const internal = new WidgetNet({ lookup: async () => [{ address: '192.168.1.5' }], fetchImpl: async () => jsonResponse({}) })
  await assert.rejects(internal.fetch({ url: 'https://api.example.com/' }, policy), { code: 'NET_PRIVATE_ADDRESS' })
  for (const address of ['127.0.0.1', '10.0.0.2', '172.20.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:192.168.0.1']) assert.equal(isPrivateAddress(address), true, address)
  for (const address of ['8.8.8.8', '2606:4700::1111']) assert.equal(isPrivateAddress(address), false, address)
  assert.equal(hostAllowed('evilopen-meteo.com', ['*.open-meteo.com']), false)
})

test('联网：重定向到未声明的域名被拦截，303 改为 GET；超大响应与频率受限', async () => {
  let hop = 0
  const netter = new WidgetNet({ lookup: publicLookup, fetchImpl: async (url, init) => {
    hop++
    if (url.includes('/start')) return new Response(null, { status: 303, headers: { location: '/next' } })
    if (url.includes('/next')) { assert.equal(init.method, 'GET'); return new Response(null, { status: 302, headers: { location: 'https://evil.com/' } }) }
    return jsonResponse({})
  } })
  await assert.rejects(netter.fetch({ url: 'https://api.example.com/start', method: 'POST', body: { a: 1 } }, { owner: 'w', hosts: ['api.example.com'] }), { code: 'NET_HOST_NOT_ALLOWED' })
  assert.equal(hop, 2)

  const big = new WidgetNet({ lookup: publicLookup, fetchImpl: async () => new Response('x', { headers: { 'content-length': String(6 * 1024 * 1024) } }) })
  await assert.rejects(big.fetch({ url: 'https://api.example.com/' }, { owner: 'w', hosts: ['api.example.com'] }), { code: 'NET_RESPONSE_TOO_LARGE' })

  let now = 0
  const limited = new WidgetNet({ lookup: publicLookup, now: () => now, fetchImpl: async () => new Response('ok') })
  for (let i = 0; i < 120; i++) await limited.fetch({ url: 'https://api.example.com/' }, { owner: 'w', hosts: ['api.example.com'] })
  await assert.rejects(limited.fetch({ url: 'https://api.example.com/' }, { owner: 'w', hosts: ['api.example.com'] }), { code: 'NET_RATE_LIMITED' })
  now = 61000
  assert.equal((await limited.fetch({ url: 'https://api.example.com/' }, { owner: 'w', hosts: ['api.example.com'] })).data, 'ok')
})

test('定时提醒：校验参数、到点触发、重复提醒推进、一次性提醒触发后删除、过期太久不补发', () => {
  const store = new Map()
  let now = Date.parse('2026-10-12T08:00:00Z')
  const fired = []
  const scheduler = new WidgetScheduler({
    now: () => now,
    onFire: (event) => fired.push(event.item.id),
    store: {
      load: () => [...store.entries()].map(([key, items]) => ({ widgetId: 'w', instanceId: key, items })),
      read: (_w, instanceId) => store.get(instanceId) || [],
      write: (_w, instanceId, items) => (items.length ? store.set(instanceId, items) : store.delete(instanceId)),
    },
  })
  assert.throws(() => scheduler.set('w', 'i1', { id: 'bad id!', at: now + 1000, title: 'x' }), /id/)
  assert.throws(() => scheduler.set('w', 'i1', { id: 'past', at: now - 1000, title: 'x' }), /晚于现在/)
  assert.throws(() => scheduler.set('w', 'i1', { id: 'r', at: now, repeat: 'yearly', title: 'x' }), /repeat/)
  scheduler.set('w', 'i1', { id: 'once', at: now + 60000, title: '喝水' })
  const daily = scheduler.set('w', 'i1', { id: 'daily', at: '2026-10-01T09:00:00Z', repeat: 'daily', title: '复习' })
  assert.equal(new Date(daily.at).toISOString(), '2026-10-12T09:00:00.000Z')
  assert.deepEqual(scheduler.list('w', 'i1').map((item) => item.id), ['once', 'daily'])

  now += 61000
  scheduler.tick()
  assert.deepEqual(fired, ['once'])
  assert.deepEqual(scheduler.list('w', 'i1').map((item) => item.id), ['daily'])

  now = Date.parse('2026-10-12T09:00:30Z')
  scheduler.tick()
  assert.deepEqual(fired, ['once', 'daily'])
  assert.equal(new Date(scheduler.list('w', 'i1')[0].at).toISOString(), '2026-10-13T09:00:00.000Z')

  // 应用关了好几天：过期超过 12 小时的不补发，直接排到下一次
  now = Date.parse('2026-10-16T20:00:00Z')
  scheduler.tick()
  assert.deepEqual(fired, ['once', 'daily'])
  assert.equal(new Date(scheduler.list('w', 'i1')[0].at).toISOString(), '2026-10-17T09:00:00.000Z')
  assert.equal(scheduler.remove('w', 'i1', 'daily'), true)
  assert.equal(new Date(nextOccurrence(Date.parse('2026-01-31T00:00:00Z'), 'monthly', Date.parse('2026-02-01T00:00:00Z'))).getUTCMonth(), 2)
})

const createService = ({ manifest, otherManifest } = {}) => {
  const widgets = new Map([
    ['w1', { id: 'w1', name: '天气', code: manifestCode(manifest), updatedAt: 1 }],
    ['w2', { id: 'w2', name: '读书', code: manifestCode(otherManifest || { name: '读书' }), updatedAt: 1 }],
  ])
  const instances = new Map([['i1', { id: 'i1', widgetId: 'w1', name: '默认' }], ['i2', { id: 'i2', widgetId: 'w2', name: '2026' }]])
  const records = new Map([['i2:books', [{ _id: 'b1', title: '三体' }]]])
  const dao = {
    getWidget: (id) => widgets.get(id) || null,
    getInstance: (id) => instances.get(id) || null,
    listInstances: (widgetId) => [...instances.values()].filter((item) => item.widgetId === widgetId),
    listRecords: (instanceId, collection) => records.get(`${instanceId}:${collection}`) || [],
    latestVersion: () => 1,
    cloneRecords: () => {},
    dropRecords: () => {},
  }
  const notifications = []
  const broadcasts = []
  const fetched = []
  const saved = []
  const clipboard = []
  const service = new WidgetService({
    noteService: { noteDAO: {} },
    dao,
    broadcast: (channel, data) => broadcasts.push({ channel, data }),
    showNotification: (n) => notifications.push(n),
    clipboard: { writeText: (text) => clipboard.push(text) },
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [service.__pickPath] }),
      showSaveDialog: async () => ({ canceled: false, filePath: service.__savePath }),
    },
    net: new WidgetNet({ lookup: publicLookup, fetchImpl: async (url) => { fetched.push(url); return jsonResponse({ temp: 21 }) } }),
  })
  const storage = new Map()
  service.getStorage = (owner, key, fallback = null) => (storage.has(`${owner}|${key}`) ? storage.get(`${owner}|${key}`) : fallback)
  service.setStorage = (owner, key, value) => (value === null || value === undefined ? storage.delete(`${owner}|${key}`) : storage.set(`${owner}|${key}`, JSON.parse(JSON.stringify(value))))
  service.emitChanged = () => {}
  return { service, notifications, broadcasts, fetched, saved, clipboard, storage }
}

test('组件服务：联网先授权后可用，未声明权限或在预览中一律拒绝', async () => {
  const { service, fetched } = createService({ manifest: { name: '天气', permissions: ['net:fetch', 'notes:read'], network: ['api.open-meteo.com'] } })
  assert.deepEqual(service.getWidget('w1').network, { hosts: ['api.open-meteo.com'], pending: ['api.open-meteo.com'], declined: false })
  await assert.rejects(service.handleRpc('i1', 'net.fetch', { url: 'https://api.open-meteo.com/v1' }), { code: 'NETWORK_APPROVAL_REQUIRED' })
  assert.equal(fetched.length, 0)

  service.declineNetwork('w1')
  assert.equal(service.getWidget('w1').network.declined, true)
  service.approveNetwork('w1')
  assert.deepEqual(service.getWidget('w1').network.pending, [])
  assert.deepEqual((await service.handleRpc('i1', 'net.fetch', { url: 'https://api.open-meteo.com/v1' })).data, { temp: 21 })

  const draft = service.createDraft(manifestCode({ name: '草稿', permissions: ['net:fetch', 'notify', 'files', 'clipboard:write'], network: ['api.open-meteo.com'] }), { widgetId: 'w1' })
  for (const method of ['net.fetch', 'notify', 'schedule.set', 'files.pick', 'files.save', 'clipboard.write']) {
    await assert.rejects(service.handleRpc(draft, method, { url: 'https://api.open-meteo.com/', title: 'x' }), { code: 'PREVIEW_ONLY' }, method)
  }
  assert.deepEqual(await service.handleRpc(draft, 'schedule.list'), [])

  const { service: plain } = createService({ manifest: { name: '无权限' } })
  await assert.rejects(plain.handleRpc('i1', 'net.fetch', { url: 'https://api.open-meteo.com/' }), { code: 'PERMISSION_DENIED' })
  await assert.rejects(plain.handleRpc('i1', 'notify', { title: 'x' }), { code: 'PERMISSION_DENIED' })
  await assert.rejects(plain.handleRpc('i1', 'files.pick', {}), { code: 'PERMISSION_DENIED' })
})

test('组件服务：通知限额、定时提醒到点发通知并推送事件、实例删除后丢弃', async () => {
  const { service, notifications, broadcasts } = createService({ manifest: { name: '喝水', permissions: ['notify'] } })
  assert.equal(await service.handleRpc('i1', 'notify', { title: '喝水', body: '一杯' }), true)
  assert.deepEqual(notifications[0], { title: '喝水', body: '一杯', widgetId: 'w1', instanceId: 'i1' })
  for (let i = 1; i < 30; i++) await service.handleRpc('i1', 'notify', { title: `第 ${i} 次` })
  await assert.rejects(service.handleRpc('i1', 'notify', { title: '超出' }), { code: 'QUOTA_EXCEEDED' })

  const item = await service.handleRpc('i1', 'schedule.set', { id: 'water', at: Date.now() + 3600000, repeat: 'hourly', title: '该喝水了', data: { cups: 1 } })
  assert.equal(item.id, 'water')
  assert.deepEqual((await service.handleRpc('i1', 'schedule.list')).map((entry) => entry.id), ['water'])
  service.fireSchedule('w1', 'i1', item)
  assert.equal(notifications.at(-1).title, '该喝水了')
  assert.deepEqual(broadcasts.at(-1).data.payload.data, { cups: 1 })
  assert.equal(broadcasts.at(-1).channel, 'widget:event')
  const before = notifications.length
  service.fireSchedule('w1', 'missing-instance', item)
  assert.equal(notifications.length, before)
  assert.equal(await service.handleRpc('i1', 'schedule.remove', { id: 'water' }), true)
})

test('组件服务：文件选择读取文本与二进制，保存写入用户选的位置，剪贴板写入', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flota-widget-files-'))
  try {
    const { service, clipboard } = createService({ manifest: { name: '记账导入', permissions: ['files', 'clipboard:write'] } })
    service.__pickPath = path.join(dir, '账单.csv')
    fs.writeFileSync(service.__pickPath, '﻿日期,金额\n2026-10-01,32')
    const [file] = await service.handleRpc('i1', 'files.pick', { accept: ['.csv'] })
    assert.equal(file.name, '账单.csv')
    assert.equal(file.text, '日期,金额\n2026-10-01,32')
    assert.equal(file.type, 'text/csv')
    fs.writeFileSync(service.__pickPath, Buffer.from([1, 2, 3]))
    const [binary] = await service.handleRpc('i1', 'files.pick', { as: 'base64' })
    assert.equal(binary.base64, 'AQID')

    service.__savePath = path.join(dir, '导出.json')
    assert.deepEqual(await service.handleRpc('i1', 'files.save', { name: '../导出.json', content: '{"a":1}' }), { saved: true, name: '导出.json' })
    assert.equal(fs.readFileSync(service.__savePath, 'utf8'), '{"a":1}')
    assert.equal(await service.handleRpc('i1', 'clipboard.write', { text: '复制' }), true)
    assert.deepEqual(clipboard, ['复制'])
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('组件服务：只能列出并只读 imports 中声明的其他组件', async () => {
  const { service } = createService({ manifest: { name: '汇总', imports: ['w2.books'] } })
  assert.deepEqual(await service.handleRpc('i1', 'widgets.instances', { widgetId: 'w2' }), [{ id: 'i2', name: '2026', widgetName: '读书' }])
  assert.deepEqual(await service.handleRpc('i1', 'data.query', { instance: 'i2', collection: 'books' }), [{ _id: 'b1', title: '三体' }])
  await assert.rejects(service.handleRpc('i1', 'data.insert', { instance: 'i2', collection: 'books', items: [{}] }), { code: 'PERMISSION_DENIED' })
  await assert.rejects(service.handleRpc('i1', 'data.query', { instance: 'i2', collection: 'secret' }), { code: 'PERMISSION_DENIED' })
  await assert.rejects(service.handleRpc('i1', 'widgets.instances', { widgetId: 'w9' }), { code: 'PERMISSION_DENIED' })
})
