# FlashNote 2.0

一个现代化的桌面笔记应用，专为高效记录和管理笔记而设计。

## 🌟 主要特性

### 📝 智能笔记编辑
- **富文本编辑器**：支持Markdown语法，实时预览
- **代码高亮**：内置多种编程语言语法高亮
- **快速格式化**：一键应用粗体、斜体、下划线等格式
- **自动保存**：实时保存，永不丢失内容

### 🎯 高效操作
- **全局快捷键**：随时随地快速创建笔记
- **悬浮球功能**：桌面悬浮球，一键访问常用功能
- **系统托盘**：最小化到托盘，后台运行不占用任务栏
- **快速搜索**：全文搜索，快速定位所需内容

### 🎨 个性化定制
- **主题切换**：支持亮色/暗色主题
- **字体设置**：自定义字体大小和样式
- **快捷键配置**：个性化快捷键设置
- **界面布局**：灵活的窗口布局选项

### 📊 数据管理
- **本地存储**：数据安全存储在本地
- **分类管理**：支持标签和分类整理
- **导入导出**：支持多种格式的数据迁移
- **备份恢复**：自动备份，一键恢复

## 🚀 快速开始

### 系统要求
- Windows 10 或更高版本
- 至少 100MB 可用磁盘空间

### 安装方式

#### 方式一：下载安装包（推荐）
1. 前往 [Releases](https://github.com/Xperiamol/FlashNote/releases) 页面
2. 下载最新版本的 `FlashNote 2.0 Setup 2.0.0.exe`
3. 运行安装程序，按照提示完成安装
4. 安装完成后，应用会自动启动

#### 方式二：便携版
1. 下载 `win-unpacked` 文件夹
2. 解压到任意目录
3. 运行 `FlashNote 2.0.exe` 即可使用

### 首次使用
1. **启动应用**：双击桌面图标或从开始菜单启动
2. **创建笔记**：使用快捷键 `Ctrl+Shift+N` 或点击"新建笔记"
3. **快速输入**：使用快捷键 `Ctrl+Shift+Q` 打开快速输入窗口
4. **系统托盘**：应用会最小化到系统托盘，右键查看更多选项

## ⌨️ 快捷键

### 全局快捷键
- `Ctrl+Shift+N`：新建笔记
- `Ctrl+Shift+Q`：快速输入
- `Ctrl+Q`：退出应用
- `Ctrl+T`：新建待办事项

### 编辑器快捷键
- `Ctrl+S`：保存笔记
- `Ctrl+B`：粗体
- `Ctrl+I`：斜体
- `Ctrl+U`：下划线
- `Ctrl+K`：插入链接
- `Ctrl+Shift+C`：插入代码块

## 🛠️ 开发者指南

### 技术栈
- **前端框架**：React 18 + Vite
- **桌面框架**：Electron
- **数据库**：SQLite (better-sqlite3)
- **UI组件**：自定义组件库
- **状态管理**：React Context

### 本地开发

```bash
# 克隆项目
git clone https://github.com/Xperiamol/FlashNote.git
cd FlashNote

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 启动Electron开发模式
npm run electron-dev
```

### 构建打包

```bash
# 构建前端
npm run build

# 打包Electron应用
npm run electron-build
```

### 项目结构

```
FlashNote/
├── src/                    # 前端源码
│   ├── components/         # React组件
│   ├── utils/             # 工具函数
│   ├── styles/            # 样式文件
│   └── main.jsx           # 入口文件
├── electron/              # Electron主进程
│   └── main.js            # 主进程入口
├── public/                # 静态资源
└── dist-electron/         # 构建输出
```

## 🤝 贡献指南

我们欢迎所有形式的贡献！

### 如何贡献
1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 问题反馈
- 发现Bug？请创建 [Issue](https://github.com/Xperiamol/FlashNote/issues)
- 有新想法？欢迎在 [Discussions](https://github.com/Xperiamol/FlashNote/discussions) 中讨论

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者和用户！

---

**FlashNote 2.0** - 让笔记记录变得更加高效和愉悦！

如果这个项目对你有帮助，请给我们一个 ⭐️！