const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// 模拟electron app路径获取
const userDataPath = app ? app.getPath('userData') : path.join(__dirname, 'userData');
const settingsFile = path.join(userDataPath, 'settings.json');

console.log('用户数据目录:', userDataPath);
console.log('设置文件路径:', settingsFile);

// 检查设置文件是否存在
if (fs.existsSync(settingsFile)) {
  console.log('设置文件存在');
  try {
    const data = fs.readFileSync(settingsFile, 'utf-8');
    const settings = JSON.parse(data);
    console.log('当前设置内容:', JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('读取设置文件失败:', error);
  }
} else {
  console.log('设置文件不存在');
}

// 尝试写入测试设置
const testSettings = {
  alwaysOnTop: true,
  openAtLogin: false,
  restoreWindows: false,
  customColors: {
    tabTextColor: '#ff0000',
    tabIndicatorColor: '#00ff00',
    inputBorderColor: '#0000ff',
    addButtonColor: '#ffff00',
    backgroundColor: '#ff00ff',
    noteBackgroundColor: '#00ffff'
  },
  inputRadius: 30,
  blockRadius: 10
};

try {
  // 确保目录存在
  const settingsDir = path.dirname(settingsFile);
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
    console.log('创建设置目录:', settingsDir);
  }
  
  fs.writeFileSync(settingsFile, JSON.stringify(testSettings, null, 2), 'utf-8');
  console.log('测试设置写入成功');
  
  // 验证写入
  const verification = fs.readFileSync(settingsFile, 'utf-8');
  console.log('验证写入结果:', JSON.stringify(JSON.parse(verification), null, 2));
} catch (error) {
  console.error('写入测试设置失败:', error);
}
