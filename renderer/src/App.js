import React, { useState, useEffect } from 'react';
import { Tabs, Layout, Button, Menu, Dropdown, message, Modal, Slider } from 'antd';
import { CloseOutlined, SettingOutlined } from '@ant-design/icons';
import FlashNote from './FlashNote';
import Todo from './Todo';
import './App.css';

const { Content } = Layout;

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
  const [inputRadius, setInputRadius] = useState(() => Number(localStorage.getItem('inputRadius')) || 25);
  const [blockRadius, setBlockRadius] = useState(() => Number(localStorage.getItem('blockRadius')) || 6);
  // 添加关于页面的状态
  const [aboutModalOpen, setAboutModalOpen] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--input-radius', inputRadius + 'px');
    document.documentElement.style.setProperty('--block-radius', blockRadius + 'px');
    localStorage.setItem('inputRadius', inputRadius);
    localStorage.setItem('blockRadius', blockRadius);
  }, [inputRadius, blockRadius]);

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
      default:
        break;
    }
  };

  const menu = (
    <Menu
      onClick={handleMenuClick}
      items={[
        { label: `切换到${currentTheme === 'light' ? '暗色' : '亮色'}模式`, key: 'toggleTheme' },
        { label: '关于', key: 'about' },
        { label: '自定义圆角', key: 'customizeRadius' },
      ]}
    />
  );

  return (
    <Layout style={{ height: '100vh', background: 'inherit', borderRadius: 0, overflow: 'hidden' }}>
      <div className="custom-title-bar">
        <span className="title">闪念速记</span>
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={handleClose}
          className="close-btn"
        />
      </div>
      <Content className="main-content">
        <Tabs
          activeKey={activeKey}
          onChange={setActiveKey}
          items={[
            { key: 'flash', label: '闪记', children: <FlashNote /> },
            { key: 'todo', label: 'Todo', children: <Todo /> },
          ]}
          tabBarExtraContent={
            <Dropdown overlay={menu} trigger={['click']}>
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
        <div style={{ marginBottom: 24 }}>
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
        <div style={{ padding: '10px 0' }}>
          <h3>闪念速记 v1.0.0</h3>
          <p>一个简单而实用的桌面笔记应用，帮助您随时记录想法和管理待办事项。</p>
          <p>技术栈：Electron+React+Ant Design</p>
          <p>主要功能：</p>
          <ul>
            <li>闪记：快速记录和保存笔记</li>
            <li>Todo：自动排序和管理您的待办事项</li>
            <li>独立窗口：将笔记固定在桌面上</li>
            <li>亮暗主题：根据喜好切换显示模式</li>
          </ul>
          <p>© 2025 Xperia</p>
        </div>
      </Modal>
    </Layout>
  );
}

export default App;