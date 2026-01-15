#!/usr/bin/env node

/**
 * 检查 MCP Server 所需的依赖是否都在 asarUnpack 中
 */

const fs = require('fs');
const path = require('path');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('检查 MCP Server 依赖');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 读取 package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const asarUnpack = packageJson.build.asarUnpack || [];

console.log('当前 asarUnpack 模块:');
const nodeModulesUnpacks = asarUnpack.filter(p => p.startsWith('node_modules/'));
nodeModulesUnpacks.forEach(p => {
  const moduleName = p.replace('node_modules/', '').replace('/**/*', '');
  console.log(`  - ${moduleName}`);
});

console.log('\n检查 MCP Server 导入的模块...\n');

// 需要检查的文件
const filesToCheck = [
  'electron/mcp-server.js',
  'electron/services/MCPServer.js',
  'electron/services/NoteService.js',
  'electron/services/TodoService.js',
  'electron/services/TagService.js',
  'electron/services/AIService.js',
  'electron/services/Mem0Service.js',
  'electron/dao/DatabaseManager.js',
  'electron/dao/NoteDAO.js',
  'electron/dao/TodoDAO.js',
  'electron/dao/TagDAO.js',
  'electron/dao/SettingDAO.js',
  'electron/utils/repeatUtils.js',
  'electron/utils/timeZoneUtils.js'
];

const requiredModules = new Set();

filesToCheck.forEach(file => {
  if (!fs.existsSync(file)) return;
  
  const content = fs.readFileSync(file, 'utf8');
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
  
  let match;
  while ((match = requireRegex.exec(content)) !== null) {
    const moduleName = match[1];
    // 只关注 node_modules 中的模块（不以 . 或 / 开头）
    if (!moduleName.startsWith('.') && !moduleName.startsWith('/') && !moduleName.startsWith('node:')) {
      // 提取顶层模块名
      const topLevelModule = moduleName.startsWith('@') 
        ? moduleName.split('/').slice(0, 2).join('/')
        : moduleName.split('/')[0];
      
      requiredModules.add(topLevelModule);
    }
  }
});

console.log('MCP Server 需要的第三方模块:');
const sortedModules = Array.from(requiredModules).sort();
sortedModules.forEach(mod => {
  const isUnpacked = asarUnpack.some(p => p.includes(mod));
  const status = isUnpacked ? '✅' : '❌';
  console.log(`  ${status} ${mod}`);
});

// 检查缺失的模块
const missingModules = sortedModules.filter(mod => 
  !asarUnpack.some(p => p.includes(mod))
);

if (missingModules.length > 0) {
  console.log('\n⚠️  需要添加到 asarUnpack 的模块:');
  missingModules.forEach(mod => {
    console.log(`      "node_modules/${mod}/**/*",`);
  });
} else {
  console.log('\n✅ 所有必需模块都已在 asarUnpack 中');
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
