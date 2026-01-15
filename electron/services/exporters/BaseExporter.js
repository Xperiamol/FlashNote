const BaseProcessor = require('../importers/BaseProcessor');

class BaseExporter extends BaseProcessor {
  async export(options) {
    throw new Error('子类必须实现 export 方法');
  }

  formatNote(note) {
    throw new Error('子类必须实现 formatNote 方法');
  }

  async getNotes(filters = {}) {
    // 默认不包含已删除的笔记
    const options = { isDeleted: 0, ...filters };
    const result = await this.noteService.getNotes(options);
    if (!result.success) throw new Error(result.error || '获取笔记失败');
    return result.data.notes || [];
  }

  async createExportDirectory(basePath) {
    await this.ensureDir(basePath);
    return basePath;
  }

  getName() { return 'Base Exporter'; }
  getDescription() { return '通用导出器基类'; }
  getSupportedFormat() { return 'unknown'; }
}

module.exports = BaseExporter;
