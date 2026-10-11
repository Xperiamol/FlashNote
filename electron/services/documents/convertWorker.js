// 在工作线程里解析文档，大文件或异常文件不会卡住主进程
const { parentPort, workerData } = require('worker_threads')
const { convertDocument } = require('./DocumentConverter')

convertDocument(workerData)
  .then((result) => parentPort.postMessage({ result }))
  .catch((error) => parentPort.postMessage({ error: error?.message || String(error) }))
