import React, { useState, useEffect } from 'react';
import { Tabs, Layout, Button, Menu, Dropdown, message, Modal, Slider } from 'antd';
import { CloseOutlined, SettingOutlined, GithubOutlined, MinusOutlined } from '@ant-design/icons';
import FlashNote from './FlashNote';
import Todo from './Todo';
import Settings from './Settings';
import FloatingBall from './FloatingBall';
import NoteWindow from './NoteWindow';
import './App.css';

const { Content } = Layout;

function handleMinimize() {
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('minimize-window');
  }
}

function handleClose() {
  if (window && window.close) {
    window.close();
  } else if (window.require) {
    // Electron 环境下
    const { remote } = window.require('electron');
    remote.getCurrentWindow().close();
  }
}

function App() {
  const [activeKey, setActiveKey] = useState('flash');
  const [currentTheme, setCurrentTheme] = useState('light');
  const [radiusModalOpen, setRadiusModalOpen] = useState(false);
  const [inputRadius, setInputRadius] = useState(25);
  const [blockRadius, setBlockRadius] = useState(6);
  // 添加关于页面的状态
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  // 获取当前路由
  const [currentRoute, setCurrentRoute] = useState('main');
  // 悬浮球显示状态
  const [floatingBallVisible, setFloatingBallVisible] = useState(false);

    // 颜色自定义状态
  const [customColors, setCustomColors] = useState({
    tabTextColor: '#000000',
    tabIndicatorColor: '#1890ff',
    inputBorderColor: '#1890ff',
    addButtonColor: '#1890ff',
    backgroundColor: '#f5f5f5',
    noteBackgroundColor: '#ffffff'
  });
  const [backgroundImage, setBackgroundImage] = useState('');
  const [backgroundBlur, setBackgroundBlur] = useState(0);
  const [backgroundBrightness, setBackgroundBrightness] = useState(100);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // 悬浮球设置状态
  const [floatingBallSettings, setFloatingBallSettings] = useState({
    size: 50,
    idleOpacity: 0.7,
    activeOpacity: 0.9,
    brightnessChange: 0.2,
    flashColor: '#1890ff',
    todoColor: '#52c41a',
    customIcon: '',
    useCustomIcon: false
  });

  // Todo设置状态
  const [todoSettings, setTodoSettings] = useState({
    autoSort: true,
    sortBy: 'priority'
  });

  // 从主进程加载设置
  useEffect(() => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.invoke('get-settings')
        .then((settings) => {
          console.log('从主进程获取设置:', settings);
          if (settings.customColors) {
            setCustomColors(settings.customColors);
          }
          if (settings.backgroundImage) {
            setBackgroundImage(settings.backgroundImage);
          }
          if (settings.backgroundBlur !== undefined) {
            setBackgroundBlur(settings.backgroundBlur);
          }
          if (settings.backgroundBrightness !== undefined) {
            setBackgroundBrightness(settings.backgroundBrightness);
          }
          if (settings.inputRadius !== undefined) {
            setInputRadius(settings.inputRadius);
          }
          if (settings.blockRadius !== undefined) {
            setBlockRadius(settings.blockRadius);
          }
          if (settings.floatingBallSettings) {
            setFloatingBallSettings(settings.floatingBallSettings);
          }
          if (settings.todoSettings) {
            setTodoSettings(settings.todoSettings);
          }
          setSettingsLoaded(true);
        })
        .catch(error => {
          console.error('获取设置失败:', error);
          setSettingsLoaded(true);
        });
    } else {
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--input-radius', inputRadius + 'px');
    document.documentElement.style.setProperty('--block-radius', blockRadius + 'px');
    
    // 只在设置加载完成后才保存到主进程
    if (settingsLoaded && window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('save-radius-settings', { inputRadius, blockRadius });
    }
  }, [inputRadius, blockRadius, settingsLoaded]);

  // 保存悬浮球设置到主进程
  useEffect(() => {
    if (settingsLoaded && window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('save-floating-ball-settings', floatingBallSettings);
    }
  }, [floatingBallSettings, settingsLoaded]);

  // 保存Todo设置到主进程
  useEffect(() => {
    if (settingsLoaded && window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('save-todo-settings', todoSettings);
    }
  }, [todoSettings, settingsLoaded]);

  // 应用自定义颜色和背景
  useEffect(() => {
    document.documentElement.style.setProperty('--tab-text-color', customColors.tabTextColor);
    document.documentElement.style.setProperty('--tab-indicator-color', customColors.tabIndicatorColor);
    document.documentElement.style.setProperty('--input-border-color', customColors.inputBorderColor);
    document.documentElement.style.setProperty('--add-button-color', customColors.addButtonColor);
    document.documentElement.style.setProperty('--note-background-color', customColors.noteBackgroundColor);
    
    // 背景处理：优先使用背景图片，其次使用背景颜色
    if (backgroundImage) {
      // 使用背景图片 - 通过CSS变量和伪元素实现模糊和亮度调整
      document.documentElement.style.setProperty('--background-image', `url("${backgroundImage}")`);
      document.documentElement.style.setProperty('--background-blur', `${backgroundBlur}px`);
      document.documentElement.style.setProperty('--background-brightness', `${backgroundBrightness}%`);
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundRepeat = '';
      document.body.style.backgroundAttachment = '';
      document.body.style.filter = 'none';
      document.body.style.backgroundColor = '';
      document.body.classList.add('has-background-image');
      document.documentElement.style.setProperty('--background-color', 'transparent');
    } else {
      // 使用背景颜色
      document.documentElement.style.removeProperty('--background-image');
      document.documentElement.style.removeProperty('--background-blur');
      document.documentElement.style.removeProperty('--background-brightness');
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundRepeat = '';
      document.body.style.backgroundAttachment = '';
      document.body.style.filter = 'none';
      document.body.style.backgroundColor = customColors.backgroundColor;
      document.body.classList.remove('has-background-image');
      document.documentElement.style.setProperty('--background-color', customColors.backgroundColor);
    }
    
    // 只在设置加载完成后才保存到主进程
    if (settingsLoaded && window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('save-custom-colors', customColors);
    }
  }, [customColors, backgroundImage, backgroundBlur, backgroundBrightness, settingsLoaded]);

  // 单独处理背景图片的保存
  useEffect(() => {
    if (settingsLoaded && window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('save-background-image', backgroundImage);
    }
  }, [backgroundImage, settingsLoaded]);

  // 单独处理背景模糊度的保存
  useEffect(() => {
    if (settingsLoaded && window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('save-background-blur', backgroundBlur);
    }
  }, [backgroundBlur, settingsLoaded]);

  // 单独处理背景亮度的保存
  useEffect(() => {
    if (settingsLoaded && window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('save-background-brightness', backgroundBrightness);
    }
  }, [backgroundBrightness, settingsLoaded]);

  // 检查URL哈希变化，进行路由处理
  useEffect(() => {
    const handleRouteChange = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('#note/')) {
        setCurrentRoute('note');
        document.documentElement.setAttribute('data-route', 'note');
      } else if (hash.includes('#floatingball')) {
        setCurrentRoute('floatingBall');
        document.documentElement.setAttribute('data-route', 'floatingBall');
      } else {
        setCurrentRoute('main');
        document.documentElement.setAttribute('data-route', 'main');
      }
    };

    // 初始检查
    handleRouteChange();

    // 监听哈希变化
    window.addEventListener('hashchange', handleRouteChange);
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
    };
  }, []);

  // 切换 body 的 class 实现亮暗模式
  const handleMenuClick = (e) => {
    switch (e.key) {
      case 'toggleTheme':
        setCurrentTheme(prevTheme => {
          const nextTheme = prevTheme === 'light' ? 'dark' : 'light';
          document.body.classList.toggle('dark-mode', nextTheme === 'dark');
          return nextTheme;
        });
        break;
      case 'about':
        // 打开关于页面
        setAboutModalOpen(true);
        break;
      case 'customizeRadius':
        setRadiusModalOpen(true);
        break;
      case 'settings':
        setSettingsModalOpen(true);
        break;
      case 'floatingBall':
        // 切换悬浮球（显示/隐藏）
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (floatingBallVisible) {
            // 如果悬浮球当前显示，则隐藏它
            ipcRenderer.send('hide-floating-ball');
            setFloatingBallVisible(false);
          } else {
            // 如果悬浮球当前隐藏，则显示它
            ipcRenderer.send('show-floating-ball');
            setFloatingBallVisible(true);
          }
        } else {
          message.warning('此功能仅在桌面应用中可用');
        }
        break;

      default:
        break;
    }
  };

  // 定义菜单项
  const menu = {
    items: [
      { label: `切换到${currentTheme === 'light' ? '暗色' : '亮色'}模式`, key: 'toggleTheme' },
      { label: floatingBallVisible ? '隐藏悬浮球' : '显示悬浮球', key: 'floatingBall' },
      { label: '更多设置', key: 'settings' },
      { label: '关于', key: 'about' },
      { label: '自定义圆角', key: 'customizeRadius' },
    ],
    onClick: handleMenuClick
  };

  useEffect(() => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');

      // 监听悬浮球状态变化事件
      ipcRenderer.on('floating-ball-status-changed', (event, { visible }) => {
        setFloatingBallVisible(visible);
      });

      // 清理事件监听器
      return () => {
        ipcRenderer.removeAllListeners('floating-ball-status-changed');
      };
    }
  }, []);

  // 根据路由渲染不同内容
  if (currentRoute === 'floatingBall') {
    return <FloatingBall />;
  }
  
  if (currentRoute === 'note') {
    return <NoteWindow />;
  }
  
  // 主界面
  return (
    <Layout className="app-layout">
      <div className="custom-title-bar">
        <span className="title">闪念速记</span>
        <div>
          <Button
            type="text"
            icon={<MinusOutlined />}
            onClick={handleMinimize}
            className="minimize-btn"
          />
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={handleClose}
            className="close-btn"
          />
        </div>
      </div>
      <Content className="main-content">
        <Tabs
          activeKey={activeKey}
          onChange={setActiveKey}
          items={[
            { key: 'flash', label: '闪记', children: <FlashNote /> },
            { key: 'todo', label: 'Todo', children: <Todo todoSettings={todoSettings} /> },
          ]}
          tabBarExtraContent={
            <Dropdown menu={menu} trigger={['click']}>
              <Button type="text" icon={<SettingOutlined />} />
            </Dropdown>
          }
        />
      </Content>
      <Modal
        title="自定义圆角"
        open={radiusModalOpen}
        onCancel={() => setRadiusModalOpen(false)}
        footer={null}
      >
        <div className="radius-slider-container">
          <div>输入框圆角：{inputRadius}px</div>
          <Slider min={0} max={40} value={inputRadius} onChange={setInputRadius} />
        </div>
        <div>
          <div>内容块圆角：{blockRadius}px</div>
          <Slider min={0} max={40} value={blockRadius} onChange={setBlockRadius} />
        </div>
      </Modal>
      
      {/* 关于页面的Modal */}
      <Modal
        title="关于闪念速记"
        open={aboutModalOpen}
        onCancel={() => setAboutModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setAboutModalOpen(false)}>
            关闭
          </Button>
        ]}
      >
        <div className="about-content">
          <h3>闪念速记 1.3.2-release</h3>
          <p>一个简单而实用的桌面笔记应用，帮助您随时记录想法和管理待办事项。</p>
          <p>技术栈：Electron+React+Ant Design</p>
          <p>主要功能：</p>
          <ul>
            <li>闪记：快速记录和保存笔记</li>
            <li>Todo：自动排序和管理您的待办事项</li>
            <li>独立窗口：将笔记固定在桌面上</li>
            <li>悬浮窗：快速记录想法和灵感</li>
            <li>亮暗主题：根据喜好切换显示模式</li>
          </ul>
          <p>© 2025 Xperia</p>
          <Button 
            type="link" 
            href="https://github.com/Xperiamol/FlashNote" 
            target="_blank"
            icon={<GithubOutlined />}
            className="github-link"
          >
            GitHub
          </Button>
        </div>
      </Modal>

      <Modal
        title="设置"
        open={settingsModalOpen}
        onCancel={() => setSettingsModalOpen(false)}
        footer={null}
      >
        <Settings 
          customColors={customColors} 
          setCustomColors={setCustomColors}
          backgroundImage={backgroundImage}
          setBackgroundImage={setBackgroundImage}
          backgroundBlur={backgroundBlur}
          setBackgroundBlur={setBackgroundBlur}
          backgroundBrightness={backgroundBrightness}
          setBackgroundBrightness={setBackgroundBrightness}
          floatingBallSettings={floatingBallSettings}
          setFloatingBallSettings={setFloatingBallSettings}
          todoSettings={todoSettings}
          setTodoSettings={setTodoSettings}
        />
      </Modal>

    </Layout>
  );
}

export default App;