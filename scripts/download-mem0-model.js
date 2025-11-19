/**
 * 使用 @xenova/transformers 正确下载模型
 */

async function downloadModel() {
  console.log('='.repeat(60));
  console.log('使用 @xenova/transformers 下载 Mem0 模型');
  console.log('='.repeat(60));

  try {
    const path = require('path');
    const fs = require('fs');

    // 1. 导入 transformers
    console.log('\n[1/3] 加载 @xenova/transformers...');
    const { pipeline, env } = await import('@xenova/transformers');

    // 2. 设置缓存目录
    const appDataPath = path.join(process.env.APPDATA || process.env.HOME, 'FlashNote');
    const modelsPath = path.join(appDataPath, 'models');
    
    if (!fs.existsSync(modelsPath)) {
      fs.mkdirSync(modelsPath, { recursive: true });
    }

    env.cacheDir = modelsPath;
    env.allowRemoteModels = true;
    env.allowLocalModels = true;

    console.log(`✓ 缓存目录: ${modelsPath}`);

    // 3. 下载模型
    console.log('\n[2/3] 下载模型 Xenova/all-MiniLM-L6-v2...');
    console.log('      使用量化版本（约 23MB）');
    console.log('      从 HuggingFace CDN 下载，请稍候...\n');

    const embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      {
        quantized: true,  // 使用量化模型
        progress_callback: (progress) => {
          if (progress.status === 'progress') {
            const percent = ((progress.loaded / progress.total) * 100).toFixed(1);
            const loaded = (progress.loaded / 1024 / 1024).toFixed(2);
            const total = (progress.total / 1024 / 1024).toFixed(2);
            process.stdout.write(`\r      进度: ${percent}% (${loaded}/${total} MB)`);
          } else if (progress.status === 'done') {
            console.log(`\r      ✓ ${progress.file} 下载完成                    `);
          }
        }
      }
    );

    console.log('\n✓ 模型下载完成！');

    // 4. 测试模型
    console.log('\n[3/3] 测试模型...');
    const testText = '这是一个测试文本';
    const output = await embedder(testText, {
      pooling: 'mean',
      normalize: true
    });

    const vector = Array.from(output.data);
    console.log(`✓ 测试成功！向量维度: ${vector.length}`);

    // 5. 显示文件信息
    const modelPath = path.join(modelsPath, 'Xenova', 'all-MiniLM-L6-v2');
    if (fs.existsSync(modelPath)) {
      console.log('\n模型文件:');
      const files = fs.readdirSync(modelPath, { recursive: true, withFileTypes: true });
      let totalSize = 0;
      
      files.forEach(file => {
        if (file.isFile()) {
          const filePath = path.join(file.path, file.name);
          const stats = fs.statSync(filePath);
          totalSize += stats.size;
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          const relativePath = path.relative(modelPath, filePath);
          console.log(`  ${relativePath.padEnd(30)} ${sizeMB.padStart(8)} MB`);
        }
      });
      
      console.log(`  ${'总计'.padEnd(30)} ${(totalSize / 1024 / 1024).toFixed(2).padStart(8)} MB`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✓ 完成！模型已可用');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n✗ 下载失败:', error.message);
    console.error('\n可能的原因:');
    console.error('1. 网络连接问题');
    console.error('2. HuggingFace 无法访问（可能需要代理）');
    console.error('3. 磁盘空间不足\n');
    process.exit(1);
  }
}

downloadModel();
