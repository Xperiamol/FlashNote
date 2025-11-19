/**
 * 预下载 Mem0 所需的向量化模型
 * 这样首次启动应用时不需要等待下载
 */

const path = require('path');
const fs = require('fs');

async function downloadModel() {
  console.log('='.repeat(60));
  console.log('开始下载 Mem0 向量化模型');
  console.log('='.repeat(60));

  try {
    // 1. 动态导入 transformers（ES Module）
    console.log('\n[1/4] 加载 @xenova/transformers...');
    const transformers = await import('@xenova/transformers');
    const { pipeline, env } = transformers;

    // 2. 设置缓存目录（与应用相同）
    const appDataPath = path.join(process.env.APPDATA || process.env.HOME, 'FlashNote');
    const modelsPath = path.join(appDataPath, 'models');
    
    // 确保目录存在
    if (!fs.existsSync(modelsPath)) {
      fs.mkdirSync(modelsPath, { recursive: true });
    }

    env.cacheDir = modelsPath;
    env.localModelPath = modelsPath;
    env.allowRemoteModels = true; // 允许下载远程模型
    env.allowLocalModels = true;  // 允许使用本地模型

    console.log(`✓ 缓存目录: ${modelsPath}`);

    // 3. 下载模型
    console.log('\n[2/4] 下载模型 Xenova/all-MiniLM-L6-v2...');
    console.log('      模型大小: ~22MB');
    console.log('      向量维度: 384');
    console.log('      下载可能需要几分钟，请耐心等待...\n');

    const embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );

    console.log('✓ 模型下载完成！');

    // 4. 测试模型
    console.log('\n[3/4] 测试模型...');
    const testText = '这是一个测试文本';
    const output = await embedder(testText, {
      pooling: 'mean',
      normalize: true
    });

    const vector = Array.from(output.data);
    console.log(`✓ 测试成功！向量维度: ${vector.length}`);

    // 5. 显示模型文件位置
    console.log('\n[4/4] 模型文件信息:');
    console.log(`✓ 缓存位置: ${modelsPath}`);
    
    // 列出模型文件
    if (fs.existsSync(modelsPath)) {
      const files = fs.readdirSync(modelsPath, { recursive: true });
      console.log(`✓ 文件数量: ${files.length}`);
      
      let totalSize = 0;
      files.forEach(file => {
        const filePath = path.join(modelsPath, file);
        if (fs.statSync(filePath).isFile()) {
          totalSize += fs.statSync(filePath).size;
        }
      });
      
      console.log(`✓ 总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✓ 模型下载和配置完成！');
    console.log('✓ 下次启动应用时将直接使用本地模型，无需下载');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n✗ 下载失败:', error.message);
    console.error('\n可能的原因:');
    console.error('1. 网络连接问题（需要访问 HuggingFace）');
    console.error('2. 依赖未安装（运行: npm install @xenova/transformers）');
    console.error('3. 磁盘空间不足\n');
    process.exit(1);
  }
}

// 运行下载
downloadModel().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
