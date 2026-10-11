const path = require('path')
const { Worker } = require('worker_threads')
const { convertDocument, DOCUMENT_EXTENSIONS } = require('./DocumentConverter')

const TIMEOUT_MS = 90 * 1000
const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024

/**
 * 在工作线程里转换文档；超时则终止线程。线程无法启动时（极少数打包环境）退回当前进程转换。
 * @param {{ buffer: Buffer|Uint8Array, name: string, baseDir?: string }} input
 */
const convertDocumentIsolated = (input, { timeoutMs = TIMEOUT_MS } = {}) => {
  if (input.buffer?.length > MAX_DOCUMENT_BYTES) {
    return Promise.reject(new Error(`文件过大，最多支持 ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`))
  }
  return new Promise((resolve, reject) => {
    let settled = false
    let started = false
    let worker
    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker?.terminate().catch(() => {})
      callback()
    }
    const fallback = (error) => finish(() => {
      if (started) return reject(error)
      convertDocument(input).then(resolve, reject)
    })
    const timer = setTimeout(() => finish(() => reject(new Error('文件解析超时，文件可能过大或已损坏'))), timeoutMs)
    try {
      worker = new Worker(path.join(__dirname, 'convertWorker.js'), {
        workerData: input,
        resourceLimits: { maxOldGenerationSizeMb: 2048 },
      })
    } catch (error) {
      return fallback(error)
    }
    worker.once('online', () => { started = true })
    worker.once('message', (message) => finish(() => (message.error ? reject(new Error(message.error)) : resolve(message.result))))
    worker.once('error', (error) => fallback(error))
    worker.once('exit', (code) => finish(() => reject(new Error(code === 0 ? '文件解析失败' : '文件解析失败，文件可能过大或已损坏'))))
  })
}

module.exports = { convertDocumentIsolated, convertDocument, DOCUMENT_EXTENSIONS, MAX_DOCUMENT_BYTES }
