const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * 基础处理器类 - 统一导入器和导出器的公共逻辑
 */
class BaseProcessor extends EventEmitter {
  constructor(noteService, imageStorageService) {
    super();
    this.noteService = noteService;
    this.imageStorageService = imageStorageService;
    this.resetStats();
  }

  resetStats() {
    this.stats = {
      totalFiles: 0,
      totalNotes: 0,
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      errors: [],
      warnings: []
    };
  }

  addError(context, message) {
    this.stats.errors.push({ context, message, timestamp: new Date() });
    this.emit('error', { context, message });
  }

  addWarning(context, message) {
    this.stats.warnings.push({ context, message, timestamp: new Date() });
    this.emit('warning', { context, message });
  }

  getStats() {
    return { ...this.stats };
  }

  sanitizeFileName(fileName) {
    return fileName
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async writeFile(filePath, content) {
    await this.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf8');
  }

  async copyFile(sourcePath, destPath) {
    await this.ensureDir(path.dirname(destPath));
    await fs.copyFile(sourcePath, destPath);
  }

  async readFile(filePath) {
    return fs.readFile(filePath, 'utf8');
  }
}

module.exports = BaseProcessor;
