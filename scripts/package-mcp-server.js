#!/usr/bin/env node

/**
 * 打包 MCP Server 为可分发的 ZIP 文件
 * 用于上传到 GitHub Releases 或 CDN
 */

const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');

const ROOT = path.join(__dirname, '..');
const MCP_BUILD = path.join(ROOT, 'mcp-build');
const DIST = path.join(ROOT, 'dist-electron');
const OUTPUT_ZIP = path.join(DIST, 'mcp-server.zip');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('打包 MCP Server for 按需下载');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function getDirectorySize(dirPath) {
  let totalSize = 0;
  const files = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const file of files) {
    const filePath = path.join(dirPath, file.name);
    if (file.isDirectory()) {
      totalSize += await getDirectorySize(filePath);
    } else {
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
    }
  }
  
  return totalSize;
}

async function packageMCP() {
  // 检查 mcp-build 是否存在
  if (!fs.existsSync(MCP_BUILD)) {
    console.error('❌ mcp-build 目录不存在，请先运行: npm run prepare-mcp');
    process.exit(1);
  }

  // 确保 dist 目录存在
  await fs.ensureDir(DIST);

  // 删除旧的 ZIP 文件
  if (fs.existsSync(OUTPUT_ZIP)) {
    console.log('删除旧的 ZIP 文件...');
    await fs.remove(OUTPUT_ZIP);
  }

  console.log('正在计算原始大小...');
  const originalSize = await getDirectorySize(MCP_BUILD);
  console.log(`原始大小: ${(originalSize / 1024 / 1024).toFixed(2)} MB\n`);

  console.log('正在压缩 mcp-build 目录...');
  const zip = new AdmZip();
  
  // 添加整个目录
  zip.addLocalFolder(MCP_BUILD);
  
  console.log('正在写入 ZIP 文件...');
  zip.writeZip(OUTPUT_ZIP);

  const stats = await fs.stat(OUTPUT_ZIP);
  const zipSizeMB = (stats.size / 1024 / 1024).toFixed(2);
  const compressionRatio = ((1 - stats.size / originalSize) * 100).toFixed(1);

  console.log('\n✅ MCP Server 打包完成！');
  console.log(`   文件: ${OUTPUT_ZIP}`);
  console.log(`   大小: ${zipSizeMB} MB`);
  console.log(`   压缩率: ${compressionRatio}%`);
  console.log('\n下一步:');
  console.log('   1. 上传到 GitHub Releases: gh release upload v2.3.1 dist-electron/mcp-server.zip');
  console.log('   2. 或上传到 CDN');
}

packageMCP().catch((error) => {
  console.error('\n❌ 打包失败:', error);
  process.exit(1);
});
