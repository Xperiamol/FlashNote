const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');

// 临时文件与目标同目录，rename 前目标始终是旧的完整版本。
// 进程中断最多留下未引用的临时文件，不把半文件暴露为已保存资源。
async function writeFileAtomic(filePath, data) {
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let handle;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    handle = await fs.open(temporary, 'wx');
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, filePath);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporary).catch(error => {
      if (error.code !== 'ENOENT') console.warn('清理未完成资源临时文件失败:', error.message);
    });
  }
}

// 小型配置/队列的同步提交；保留现有同步调用方的错误语义。
function writeFileAtomicSync(filePath, data, { mode, beforeCommit } = {}) {
  const syncFs = require('fs');
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let fd;
  try {
    syncFs.mkdirSync(path.dirname(filePath), { recursive: true });
    fd = syncFs.openSync(temporary, 'wx');
    if (mode !== undefined) syncFs.fchmodSync(fd, mode);
    syncFs.writeFileSync(fd, data);
    syncFs.fsyncSync(fd);
    syncFs.closeSync(fd);
    fd = undefined;
    beforeCommit?.();
    syncFs.renameSync(temporary, filePath);
  } finally {
    if (fd !== undefined) syncFs.closeSync(fd);
    try { syncFs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') console.warn(error.message); }
  }
}
module.exports = { writeFileAtomic, writeFileAtomicSync };
