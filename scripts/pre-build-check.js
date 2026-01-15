/**
 * 打包前最终检查脚本
 * 确保所有配置正确才允许打包
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔍 打包前最终检查');
console.log('━'.repeat(70));

let hasErrors = false;
const errors = [];
const warnings = [];

// 检查 1: package.json asarUnpack 配置
console.log('\n1️⃣ 检查 package.json 配置...');
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const asarUnpack = pkg.build?.asarUnpack || [];
  
  const requiredUnpack = [
    'electron/mcp-server.js',
    'electron/mcp-server-launcher.js',
    'electron/dao/**/*',
    'electron/services/**/*',
    'node_modules/**/*'
  ];
  
  const missing = requiredUnpack.filter(item => !asarUnpack.includes(item));
  
  if (missing.length > 0) {
    errors.push(`asarUnpack 缺少: ${missing.join(', ')}`);
    hasErrors = true;
    console.log('   ❌ 配置不完整');
  } else {
    console.log('   ✅ asarUnpack 配置完整');
  }
} catch (e) {
  errors.push(`无法读取 package.json: ${e.message}`);
  hasErrors = true;
  console.log('   ❌ 读取失败');
}

// 检查 2: mcp-server.js .env 路径
console.log('\n2️⃣ 检查 mcp-server.js .env 路径...');
try {
  const content = fs.readFileSync('electron/mcp-server.js', 'utf8');
  
  if (!content.includes('existsSync') || !content.includes('.env')) {
    warnings.push('mcp-server.js 可能缺少 .env 路径回退逻辑');
    console.log('   ⚠️  .env 路径可能有问题');
  } else if (!content.includes("path.join(__dirname, '..', '..', '.env')")) {
    warnings.push('mcp-server.js 缺少打包环境的 .env 路径');
    console.log('   ⚠️  打包路径可能缺失');
  } else {
    console.log('   ✅ .env 路径回退逻辑正确');
  }
} catch (e) {
  errors.push(`无法读取 mcp-server.js: ${e.message}`);
  hasErrors = true;
  console.log('   ❌ 读取失败');
}

// 检查 3: mcp-server-launcher.js NODE_PATH
console.log('\n3️⃣ 检查 mcp-server-launcher.js NODE_PATH...');
try {
  const content = fs.readFileSync('electron/mcp-server-launcher.js', 'utf8');
  
  if (!content.includes('NODE_PATH')) {
    errors.push('mcp-server-launcher.js 未设置 NODE_PATH');
    hasErrors = true;
    console.log('   ❌ NODE_PATH 未设置');
  } else if (!content.includes('Module._initPaths()')) {
    warnings.push('mcp-server-launcher.js 未调用 Module._initPaths()');
    console.log('   ⚠️  Module._initPaths() 缺失');
  } else {
    console.log('   ✅ NODE_PATH 设置正确');
  }
} catch (e) {
  errors.push(`无法读取 mcp-server-launcher.js: ${e.message}`);
  hasErrors = true;
  console.log('   ❌ 读取失败');
}

// 检查 4: Mem0Service.js 模型路径
console.log('\n4️⃣ 检查 Mem0Service.js 模型路径...');
try {
  const content = fs.readFileSync('electron/services/Mem0Service.js', 'utf8');
  
  if (!content.includes("__dirname.includes('app.asar')")) {
    warnings.push('Mem0Service.js 可能缺少打包环境检测');
    console.log('   ⚠️  打包环境检测可能缺失');
  } else if (!content.includes("'..', '..', '..', 'models'")) {
    warnings.push('Mem0Service.js 独立环境模型路径可能不正确');
    console.log('   ⚠️  独立环境路径可能有问题');
  } else {
    console.log('   ✅ 模型路径配置正确');
  }
} catch (e) {
  errors.push(`无法读取 Mem0Service.js: ${e.message}`);
  hasErrors = true;
  console.log('   ❌ 读取失败');
}

// 检查 5: 必要文件存在
console.log('\n5️⃣ 检查必要文件...');
const requiredFiles = [
  'electron/mcp-server.js',
  'electron/mcp-server-launcher.js',
  'electron/dao/DatabaseManager.js',
  'electron/services/Mem0Service.js',
  'electron/services/MCPServer.js',
  '.env'
];

requiredFiles.forEach(file => {
  if (!fs.existsSync(file)) {
    errors.push(`缺少必要文件: ${file}`);
    hasErrors = true;
  }
});

if (errors.length === 0) {
  console.log('   ✅ 所有必要文件存在');
} else {
  console.log('   ❌ 有文件缺失');
}

// 输出结果
console.log('\n' + '━'.repeat(70));

if (errors.length > 0) {
  console.log('\n❌ 发现错误:');
  errors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
}

if (warnings.length > 0) {
  console.log('\n⚠️  警告:');
  warnings.forEach((warn, i) => console.log(`   ${i + 1}. ${warn}`));
}

if (hasErrors) {
  console.log('\n❌ 检查失败！请修复错误后再打包');
  console.log('🐱 猫咪处于危险中！');
  process.exit(1);
} else if (warnings.length > 0) {
  console.log('\n⚠️  有警告，但可以继续打包');
  console.log('🐱 猫咪基本安全');
} else {
  console.log('\n✅ 所有检查通过！可以安全打包');
  console.log('🐱 猫咪 100% 安全！');
  console.log('\n下一步: npm run electron-build');
}

console.log('━'.repeat(70) + '\n');
