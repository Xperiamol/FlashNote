const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { writeFileAtomicSync } = require('../utils/atomicFile');
const { getUserDataPath } = require('../utils/userDataPath');

// 外部文件草稿只保存在本机应用目录，恢复时不改写原文件。
class ExternalFileDraftStore {
  constructor(directory) { this.directory = directory; }
  file(filePath) {
    return path.join(this.directory || path.join(getUserDataPath(), 'external-file-drafts'),
      createHash('sha256').update(filePath).digest('hex') + '.json');
  }
  read(filePath) {
    try {
      const draft = JSON.parse(fs.readFileSync(this.file(filePath), 'utf8'));
      if (draft.path !== filePath || typeof draft.token !== 'string') throw new Error('恢复草稿格式异常，已保留原始草稿');
      return draft;
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  // 损坏草稿改名保留，供手动恢复，不再挡住原文件打开。
  quarantine(filePath) {
    const kept = `${this.file(filePath)}.corrupt-${Date.now()}`
    fs.renameSync(this.file(filePath), kept)
    return kept
  }
  stage(filePath, draft) {
    if (!draft || typeof draft.token !== 'string' || !draft.token || typeof draft.baseRevision !== 'string') throw new Error('草稿数据无效');
    if (draft.format === 'whiteboard') {
      if (!Array.isArray(draft.scene?.elements) || !draft.scene?.files) throw new Error('白板草稿不完整');
    } else if (!['text', 'markdown'].includes(draft.format) || typeof draft.text !== 'string') throw new Error('文本草稿无效');
    const json = JSON.stringify({ ...draft, path: filePath, savedAt: Date.now() });
    if (Buffer.byteLength(json) > 80 * 1024 * 1024) throw new Error('草稿超过大小限制');
    writeFileAtomicSync(this.file(filePath), json, { mode: 0o600 });
    return { token: draft.token };
  }
  clear(filePath, token) {
    // 旧保存请求只能清理自己的草稿，不能清掉后续输入。
    if (this.read(filePath)?.token === token) fs.unlinkSync(this.file(filePath));
  }
}
module.exports = ExternalFileDraftStore;
