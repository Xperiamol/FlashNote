一个简单而实用的桌面笔记应用，UI美观，帮助您随时记录想法和管理待办事项。

技术栈：Electron+React+Ant Design

主要功能：

闪记：快速记录和保存笔记

Todo：自动排序和管理您的待办事项

独立窗口：将笔记固定在桌面上

亮暗主题：根据喜好切换显示模式

![image](https://github.com/user-attachments/assets/051b9899-7c46-4485-84db-c19e3c5ae27b)
![image](https://github.com/user-attachments/assets/dbf6ecd1-2920-47bb-a168-b1f15117bd74)


开发环境运行

```bash
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; $env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm install
cd renderer && npm install
cd ..
npm start
