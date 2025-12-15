/**
 * 打包前设置环境变量的脚本
 * 从 .env 文件读取环境变量并设置到 process.env
 */

const fs = require('fs');
const path = require('path');

// 读取 .env 文件
const envPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  
  lines.forEach(line => {
    line = line.trim();
    // 跳过空行和注释
    if (!line || line.startsWith('#')) return;
    
    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=').trim();
    
    if (key && value) {
      process.env[key.trim()] = value;
      console.log(`[Build] 已设置环境变量: ${key.trim()}`);
    }
  });
  
  console.log('[Build] 环境变量加载完成');
} else {
  console.warn('[Build] 警告: 未找到 .env 文件');
  console.warn('[Build] 请创建 .env 文件并设置 GOOGLE_CLIENT_ID 和 GOOGLE_CLIENT_SECRET');
}
