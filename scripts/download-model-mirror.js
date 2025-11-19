/**
 * 使用国内镜像下载模型（HuggingFace 镜像站）
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// 模型文件列表（all-MiniLM-L6-v2）
const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.txt',
  'special_tokens_map.json',
  'onnx/model.onnx',
  'onnx/model_quantized.onnx'
];

const MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2';
const BASE_URL = 'https://hf-mirror.com'; // 国内镜像

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    // 确保目标目录存在
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const file = fs.createWriteStream(dest);
    
    console.log(`  下载: ${path.basename(dest)}...`);
    
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      // 处理重定向
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        const redirectProtocol = redirectUrl.startsWith('https') ? https : http;
        
        redirectProtocol.get(redirectUrl, (redirectResponse) => {
          const totalBytes = parseInt(redirectResponse.headers['content-length'], 10);
          let downloadedBytes = 0;
          
          redirectResponse.pipe(file);
          
          redirectResponse.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (totalBytes) {
              const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
              process.stdout.write(`\r  进度: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(2)} MB)`);
            }
          });
          
          file.on('finish', () => {
            file.close();
            console.log('\r  ✓ 完成                                    ');
            resolve();
          });
          
          redirectResponse.on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
          });
        }).on('error', (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
      } else if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('  ✓ 完成');
          resolve();
        });
      } else {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });

    file.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function downloadModel() {
  console.log('='.repeat(60));
  console.log('从国内镜像下载 Mem0 向量化模型');
  console.log('镜像站: hf-mirror.com');
  console.log('='.repeat(60));

  try {
    // 设置缓存目录
    const appDataPath = path.join(process.env.APPDATA || process.env.HOME, 'FlashNote');
    const modelsPath = path.join(appDataPath, 'models', 'Xenova', 'all-MiniLM-L6-v2');
    
    console.log(`\n目标目录: ${modelsPath}\n`);

    // 创建目录
    if (!fs.existsSync(path.join(modelsPath, 'onnx'))) {
      fs.mkdirSync(path.join(modelsPath, 'onnx'), { recursive: true });
    }

    // 下载所有文件
    for (const file of MODEL_FILES) {
      const url = `${BASE_URL}/${MODEL_NAME}/resolve/main/${file}`;
      const dest = path.join(modelsPath, file);

      try {
        await downloadFile(url, dest);
      } catch (err) {
        console.error(`\n✗ 下载失败: ${file}`);
        console.error(`  错误: ${err.message}`);
        console.log('\n继续下载其他文件...\n');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✓ 模型下载完成！');
    console.log('✓ 位置:', modelsPath);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n✗ 下载失败:', error.message);
    process.exit(1);
  }
}

downloadModel();
