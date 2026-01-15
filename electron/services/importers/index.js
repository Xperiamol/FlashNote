/**
 * 导入器索引
 * 导出所有可用的导入器
 */

const BaseImporter = require('./BaseImporter');
const ObsidianImporter = require('./ObsidianImporter');

module.exports = {
  BaseImporter,
  ObsidianImporter,
  
  // 在这里添加新的导入器
  // NotionImporter,
  // EvernoteImporter,
};
