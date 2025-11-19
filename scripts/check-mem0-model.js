/**
 * 检查 Mem0 模型是否已下载
 */

const path = require('path');
const fs = require('fs');

const appDataPath = path.join(process.env.APPDATA || process.env.HOME, 'FlashNote');
const modelsPath = path.join(appDataPath, 'models', 'Xenova', 'all-MiniLM-L6-v2');

console.log('检查 Mem0 模型...\n');
console.log(`模型目录: ${modelsPath}\n`);

if (!fs.existsSync(modelsPath)) {
  console.log('❌ 模型未下载');
  console.log('请运行: npm run download-mem0-model\n');
  process.exit(1);
}

const requiredFiles = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx'
];

let allExists = true;
let totalSize = 0;

console.log('文件检查:');
requiredFiles.forEach(file => {
  const filePath = path.join(modelsPath, file);
  const exists = fs.existsSync(filePath);
  
  if (exists) {
    const stats = fs.statSync(filePath);
    totalSize += stats.size;
    console.log(`✓ ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  } else {
    console.log(`✗ ${file} - 缺失`);
    allExists = false;
  }
});

console.log(`\n总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

if (allExists) {
  console.log('\n✓ 模型已完整下载，可以使用！\n');
  process.exit(0);
} else {
  console.log('\n❌ 模型文件不完整，请重新下载\n');
  process.exit(1);
}
