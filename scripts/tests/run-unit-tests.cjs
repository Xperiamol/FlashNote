// 默认测试只运行无外部服务的回归；同步、备份和浏览器保留独立命令。
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const integrationTests = new Set(['sync-e2e.test.mjs', 'webdav-concurrency.test.mjs']);
const files = readdirSync(__dirname)
  .filter(name => name.endsWith('.test.mjs') && !integrationTests.has(name))
  .sort()
  .map(name => join(__dirname, name));
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
