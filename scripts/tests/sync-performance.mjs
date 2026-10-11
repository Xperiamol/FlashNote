// Reproducible local cost probe. Network is an on-disk substitute: these are not WebDAV latency measurements.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flota-sync-perf-'))
try {
  for (const count of [100, 1000, 5000]) {
    const home = path.join(temp, String(count), 'home')
    const remote = path.join(temp, String(count), 'remote')
    fs.mkdirSync(home, { recursive: true })
    fs.mkdirSync(remote, { recursive: true })
    const ops = [
      { op: 'categories', value: ['notes', 'todos', 'settings', 'widgets'] },
      { op: 'seedNotes', count, bodyBytes: 8192 },
      { op: 'sync' }, // bootstrap / warm up
      { op: 'measureSync' }, { op: 'measureSync' }, { op: 'measureSync' },
      { op: 'measureSave' },
    ]
    const child = spawnSync(path.join(root, 'node_modules/.bin/electron'), [path.join(root, 'scripts/tests/sync-device.cjs'), remote, JSON.stringify(ops)], {
      cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, HOME: home, USERPROFILE: home, APPDATA: home, ELECTRON_RUN_AS_NODE: '1' },
    })
    const line = child.stdout?.split('\n').find(line => line.startsWith('RESULT '))
    if (child.status !== 0 || !line) throw new Error(child.error?.message || child.stdout + child.stderr)
    const results = JSON.parse(line.slice(7)).filter(value => value.op !== 'sync')
    if (results.some(value => value.errors)) throw new Error(JSON.stringify(results))
    console.log(JSON.stringify({ notes: count, approximateBodyMiB: count * 8192 / 1024 ** 2, results }))
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}
