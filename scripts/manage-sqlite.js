/**
 * better-sqlite3 智能编译管理脚本
 * 
 * 问题：better-sqlite3 需要针对不同运行时编译：
 * - Node.js (MCP Server) 需要 NODE_MODULE_VERSION 115
 * - Electron 需要 NODE_MODULE_VERSION 136
 * 
 * 解决方案：
 * - 自动检测当前编译版本
 * - 仅在需要时重新编译（避免重复编译）
 * - 提供清晰的状态输出
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 检查当前 better-sqlite3 编译版本
 */
function getCurrentModuleVersion() {
  const modulePath = path.join(__dirname, '../node_modules/better-sqlite3/build/Release/better_sqlite3.node');
  
  if (!fs.existsSync(modulePath)) {
    return null;
  }

  try {
    // 尝试在当前 Node.js 环境中加载
    require('better-sqlite3');
    return 'node'; // 成功加载说明是 Node 版本
  } catch (e) {
    if (e.code === 'ERR_DLOPEN_FAILED' && e.message.includes('NODE_MODULE_VERSION 136')) {
      return 'electron'; // 错误信息显示是 Electron 版本
    }
    return 'unknown';
  }
}

/**
 * 编译 better-sqlite3
 */
function rebuild(target) {
  log(`\n🔨 正在为 ${target} 编译 better-sqlite3...`, 'blue');
  
  try {
    if (target === 'electron') {
      execSync('npx electron-rebuild -f -w better-sqlite3', { stdio: 'inherit' });
    } else {
      execSync('npm rebuild better-sqlite3', { stdio: 'inherit' });
    }
    log(`✅ ${target} 编译完成`, 'green');
    return true;
  } catch (e) {
    log(`❌ ${target} 编译失败: ${e.message}`, 'red');
    return false;
  }
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  const target = args[0]; // 'electron' 或 'node'

  if (!target || !['electron', 'node'].includes(target)) {
    log('❌ 用法: node manage-sqlite.js <electron|node>', 'red');
    process.exit(1);
  }

  log(`\n📦 better-sqlite3 编译管理`, 'blue');
  log('━'.repeat(50), 'blue');

  // 检查当前版本
  const currentVersion = getCurrentModuleVersion();
  
  if (currentVersion === null) {
    log('⚠️  better-sqlite3 未编译，需要初始化', 'yellow');
    rebuild(target);
  } else if (currentVersion === target) {
    log(`✅ 当前已是 ${target} 版本，跳过编译`, 'green');
  } else {
    log(`🔄 当前是 ${currentVersion} 版本，需要切换到 ${target}`, 'yellow');
    rebuild(target);
  }

  log('\n━'.repeat(50), 'blue');
  log('✨ 完成\n', 'green');
}

main();
