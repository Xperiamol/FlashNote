/**
 * 快速验证所有修复
 */

console.log('验证 V3 同步系统修复...\n');

let errors = [];

// 1. 验证 ConcurrencyLimiter
try {
  const ConcurrencyLimiter = require('./electron/services/sync/utils/ConcurrencyLimiter');
  const limiter = new ConcurrencyLimiter(3);
  console.log('✓ ConcurrencyLimiter');
} catch (e) {
  errors.push('ConcurrencyLimiter: ' + e.message);
  console.log('✗ ConcurrencyLimiter:', e.message);
}

// 2. 验证 Hash 工具
try {
  const hashUtils = require('./electron/services/sync/utils/hash');
  const hash = hashUtils.calculateHash('test');
  if (hash && hash.length === 32) {
    console.log('✓ Hash 工具');
  } else {
    throw new Error('Hash 生成错误');
  }
} catch (e) {
  errors.push('Hash 工具: ' + e.message);
  console.log('✗ Hash 工具:', e.message);
}

// 3. 验证 WebDAV 客户端
try {
  const WebDAVClient = require('./electron/services/sync/webdavClient');
  const client = new WebDAVClient({
    username: 'test',
    password: 'test'
  });
  console.log('✓ WebDAV 客户端');
} catch (e) {
  errors.push('WebDAV 客户端: ' + e.message);
  console.log('✗ WebDAV 客户端:', e.message);
}

// 4. 验证 SyncIPCHandler 方法调用
try {
  const fs = require('fs');
  const ipcCode = fs.readFileSync('./electron/ipc/SyncIPCHandler.js', 'utf8');

  // 检查是否还有错误的方法调用
  if (ipcCode.includes('.disableSync(')) {
    throw new Error('仍有 disableSync() 调用');
  }
  if (ipcCode.includes('.forceStop(')) {
    throw new Error('仍有 forceStop() 调用');
  }

  // 检查是否有正确的方法调用
  if (!ipcCode.includes('.disableCurrentService(')) {
    throw new Error('缺少 disableCurrentService() 调用');
  }
  if (!ipcCode.includes('.forceStopSync(')) {
    throw new Error('缺少 forceStopSync() 调用');
  }

  console.log('✓ SyncIPCHandler 方法调用');
} catch (e) {
  errors.push('SyncIPCHandler: ' + e.message);
  console.log('✗ SyncIPCHandler:', e.message);
}

// 5. 验证 StorageAdapter 数据库使用
try {
  const fs = require('fs');
  const adapterCode = fs.readFileSync('./electron/services/sync/StorageAdapter.js', 'utf8');

  // 检查是否正确使用 DatabaseManager
  if (!adapterCode.includes('this.dbManager = DatabaseManager.getInstance()')) {
    throw new Error('未使用 dbManager');
  }
  if (!adapterCode.includes('this.db = this.dbManager.getDatabase()')) {
    throw new Error('未调用 getDatabase()');
  }
  if (!adapterCode.includes('new NoteDAO(this.dbManager)')) {
    throw new Error('NoteDAO 初始化错误');
  }
  if (!adapterCode.includes('new TodoDAO(this.dbManager)')) {
    throw new Error('TodoDAO 初始化错误');
  }

  console.log('✓ StorageAdapter 数据库使用');
} catch (e) {
  errors.push('StorageAdapter: ' + e.message);
  console.log('✗ StorageAdapter:', e.message);
}

// 6. 验证 SyncEngine DeviceIdManager 导入
try {
  const fs = require('fs');
  const engineCode = fs.readFileSync('./electron/services/sync/SyncEngine.js', 'utf8');

  if (!engineCode.includes("const { getInstance: getDeviceIdManager } = require('../../utils/DeviceIdManager')")) {
    throw new Error('DeviceIdManager 导入方式错误');
  }
  if (!engineCode.includes('getDeviceIdManager().getDeviceId()')) {
    throw new Error('DeviceIdManager 调用方式错误');
  }

  console.log('✓ SyncEngine DeviceIdManager 导入');
} catch (e) {
  errors.push('SyncEngine: ' + e.message);
  console.log('✗ SyncEngine:', e.message);
}

console.log('\n================================');
if (errors.length === 0) {
  console.log('✅ 所有修复验证通过！');
  console.log('V3 同步系统已就绪，可以正常使用。');
} else {
  console.log('❌ 发现 ' + errors.length + ' 个问题:');
  errors.forEach(err => console.log('  - ' + err));
  process.exit(1);
}
