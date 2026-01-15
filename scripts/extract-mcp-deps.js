/**
 * MCP Server 依赖提取脚本
 * 只复制 MCP Server 需要的依赖，大幅减小体积
 */

const fs = require('fs');
const path = require('path');

// MCP Server 需要的依赖列表
const requiredDeps = [
  'dotenv',
  '@modelcontextprotocol/sdk',
  'better-sqlite3',
  '@xenova/transformers',
  'onnxruntime-node',
  'compute-cosine-similarity',
  'sharp'
];

const nodeModulesDir = path.join(__dirname, '..', 'node_modules');
const mcpModulesDir = path.join(__dirname, '..', 'electron', 'mcp_modules');

console.log('📦 提取 MCP Server 依赖');
console.log('━'.repeat(60));

// 删除旧目录
if (fs.existsSync(mcpModulesDir)) {
  console.log('清理旧依赖目录...');
  fs.rmSync(mcpModulesDir, { recursive: true, force: true });
}

fs.mkdirSync(mcpModulesDir, { recursive: true });

let totalSize = 0;
let copiedCount = 0;

// 复制依赖及其子依赖
function copyDependency(depName, isRoot = false) {
  const srcPath = path.join(nodeModulesDir, depName);
  const destPath = path.join(mcpModulesDir, depName);
  
  if (!fs.existsSync(srcPath)) {
    console.log(`⚠️  未找到: ${depName}`);
    return;
  }
  
  if (fs.existsSync(destPath)) {
    return; // 已复制
  }
  
  // 复制目录
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.cpSync(srcPath, destPath, { recursive: true });
  
  const size = getDirectorySize(destPath);
  totalSize += size;
  copiedCount++;
  
  if (isRoot) {
    console.log(`✓ ${depName} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  }
  
  // 读取子依赖
  const packageJsonPath = path.join(srcPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const deps = Object.keys(pkg.dependencies || {});
    deps.forEach(dep => copyDependency(dep, false));
  }
}

function getDirectorySize(dir) {
  let size = 0;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      size += getDirectorySize(fullPath);
    } else {
      size += fs.statSync(fullPath).size;
    }
  }
  
  return size;
}

// 复制所有依赖
requiredDeps.forEach(dep => copyDependency(dep, true));

console.log('━'.repeat(60));
console.log(`✅ 完成！复制了 ${copiedCount} 个包，总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`目标目录: ${mcpModulesDir}`);
