import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, Menu, Dropdown } from 'antd';
import { CloseOutlined, CheckOutlined, EditOutlined } from '@ant-design/icons';
import './FloatingBall.css';

function FloatingBall() {
  const [visible, setVisible] = useState(false); // 控制输入框的显示隐藏
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight - 80 }); // 悬浮球位置 - 设置在屏幕右下角
  const [isDragging, setIsDragging] = useState(false); // 是否正在拖拽
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); // 拖拽起始位置
  const [input, setInput] = useState(''); // 输入内容
  const [inputType, setInputType] = useState('flash'); // 输入类型：flash 或 todo
  const ballRef = useRef(null);
  const [ipcRenderer, setIpcRenderer] = useState(null);
  const leaveTimer = useRef(null); // 用于处理鼠标离开的计时器
  const clickTimeoutRef = useRef(null); // 用于处理单击延迟的计时器
  
  // 初始化 ipcRenderer
  useEffect(() => {
    try {
      if (window.require) {
        const electron = window.require('electron');
        const ipc = electron.ipcRenderer;
        setIpcRenderer(ipc);
        
        // 测试 IPC 是否工作正常
        console.log('ipcRenderer 初始化成功:', ipc ? '是' : '否');
      } else {
        console.warn('window.require 不可用，可能不在 Electron 环境中');
      }
    } catch (e) {
      console.error('无法初始化 ipcRenderer:', e);
    }
  }, []);

  // 监听窗口大小变化，确保悬浮球位置在合理范围内
  useEffect(() => {
    const handleResize = () => {
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const ballSize = 50;
      
      setPosition(prevPosition => ({
        x: Math.max(0, Math.min(prevPosition.x, screenWidth - ballSize)),
        y: Math.max(0, Math.min(prevPosition.y, screenHeight - ballSize))
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 恢复保存的位置
  useEffect(() => {
    if (ipcRenderer) {
      // 从主进程获取保存的位置
      ipcRenderer.invoke('get-floating-ball-position')
        .then(savedPosition => {
          if (savedPosition) {
            console.log('从主进程恢复悬浮球位置:', savedPosition);
            // 确保恢复的位置在当前屏幕范围内
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            const ballSize = 50;
            
            setPosition({
              x: Math.max(0, Math.min(savedPosition.x, screenWidth - ballSize)),
              y: Math.max(0, Math.min(savedPosition.y, screenHeight - ballSize))
            });
          }
        })
        .catch(error => {
          console.error('获取悬浮球位置失败:', error);
        });
    } else {
      // 备用方案：使用 localStorage（开发环境或非 Electron 环境）
      const savedPosition = localStorage.getItem('floatingBallPosition');
      if (savedPosition) {
        try {
          const parsed = JSON.parse(savedPosition);
          console.log('从 localStorage 恢复悬浮球位置:', parsed);
          // 确保恢复的位置在当前屏幕范围内
          const screenWidth = window.innerWidth;
          const screenHeight = window.innerHeight;
          const ballSize = 50;
          
          setPosition({
            x: Math.max(0, Math.min(parsed.x, screenWidth - ballSize)),
            y: Math.max(0, Math.min(parsed.y, screenHeight - ballSize))
          });
        } catch (e) {
          console.error('解析 localStorage 位置失败:', e);
        }
      }
    }
  }, [ipcRenderer]);

  // 保存位置到设置
  useEffect(() => {
    if (!isDragging) {
      console.log('保存悬浮球位置:', position);
      
      if (ipcRenderer) {
        // 保存到主进程的设置文件
        ipcRenderer.send('save-floating-ball-position', position);
      } else {
        // 备用方案：保存到 localStorage（开发环境或非 Electron 环境）
        localStorage.setItem('floatingBallPosition', JSON.stringify(position));
      }
    }
  }, [position, isDragging, ipcRenderer]);

  // 统一处理鼠标进入交互区域（悬浮球或输入框）
  const handleMouseEnter = () => {
    // 清除任何待处理的启用点击穿透的计时器
    clearTimeout(leaveTimer.current);
    // 禁用点击穿透，使窗口可交互
    if (ipcRenderer) {
      ipcRenderer.send('set-ignore-mouse-events', false);
    }
  };

  // 统一处理鼠标离开交互区域
  const handleMouseLeave = () => {
    // 设置一个短暂的延迟后启用点击穿透
    // 这可以防止在悬浮球和输入框之间移动时意外触发
    leaveTimer.current = setTimeout(() => {
      if (ipcRenderer) {
        ipcRenderer.send('set-ignore-mouse-events', true);
      }
    }, 100);
  };

  // 处理鼠标按下事件，开始拖拽
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ 
      x: e.clientX - position.x, 
      y: e.clientY - position.y 
    });
  };

  // 处理鼠标移动事件
  const handleMouseMove = (e) => {
    if (isDragging) {
      // 计算新位置
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // 获取屏幕尺寸进行边界检测
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const ballSize = 50; // 悬浮球大小
      
      // 确保悬浮球不超出屏幕边界
      const constrainedX = Math.max(0, Math.min(newX, screenWidth - ballSize));
      const constrainedY = Math.max(0, Math.min(newY, screenHeight - ballSize));
      
      setPosition({
        x: constrainedX,
        y: constrainedY
      });
    }
  };

  // 处理鼠标松开事件，结束拖拽
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 创建水波纹动效
  const createRipple = (event) => {
    const ball = ballRef.current;
    if (!ball) return;

    const rect = ball.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';

    ball.appendChild(ripple);

    // 动画完成后移除元素
    setTimeout(() => {
      if (ripple.parentNode) {
        ripple.parentNode.removeChild(ripple);
      }
    }, 600);
  };

  // 监听鼠标移动和松开事件
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // 清理计时器
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      if (leaveTimer.current) {
        clearTimeout(leaveTimer.current);
      }
    };
  }, []);

  // 处理左键点击，显示/隐藏输入框
  const handleClick = (event) => {
    // 创建水波纹动效
    createRipple(event);
    
    // 清除之前的单击延迟计时器
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      return; // 如果是双击的第二次点击，直接返回
    }
    
    // 设置单击延迟，如果在延迟时间内没有第二次点击，则执行单击操作
    clickTimeoutRef.current = setTimeout(() => {
      // 立即禁用点击穿透，确保输入框可以正常工作
      if (ipcRenderer) {
        ipcRenderer.send('set-ignore-mouse-events', false);
      }
      
      setVisible(!visible);
      if (!visible) {
        setTimeout(() => {
          // 对于 Antd 的 TextArea，需要选择内部的 textarea 元素
          const inputElement = document.querySelector('.floating-input textarea');
          if (inputElement) {
            inputElement.focus();
          }
        }, 100);
      }
      clickTimeoutRef.current = null;
    }, 250); // 250ms 内没有第二次点击则认为是单击
  };

  // 处理双击，切换输入类型
  const handleDoubleClick = (event) => {
    // 创建水波纹动效
    createRipple(event);
    
    // 清除单击延迟计时器
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    
    // 切换输入类型
    setInputType(prev => prev === 'flash' ? 'todo' : 'flash');
    console.log('双击切换输入类型:', inputType === 'flash' ? 'todo' : 'flash');
  };

  // 处理保存按钮点击
  const handleSave = () => {
    if (!input.trim()) return;
    
    try {
      console.log('悬浮球保存内容:', inputType, input);
      
      if (ipcRenderer) {
        // 保存闪记
        if (inputType === 'flash') {
          const noteData = {
            text: input,
            id: Date.now().toString(),
            color: '#ffffff'
          };
          console.log('发送闪记到主进程:', noteData);
          ipcRenderer.send('add-note', noteData);
        } 
        // 保存 Todo
        else if (inputType === 'todo') {
          const todoData = {
            text: input,
            id: Date.now(),
            done: false,
            ddl: null,
            quadrant: null
          };
          console.log('发送待办到主进程:', todoData);
          ipcRenderer.send('add-todo', todoData);
        }
      } else {
        console.warn('ipcRenderer未初始化，使用localStorage备用方案');
        
        // 在非 Electron 环境中的备用处理
        if (inputType === 'flash') {
          const savedNotes = JSON.parse(localStorage.getItem('flash_notes') || '[]');
          const newNotes = [
            { text: input, id: Date.now() },
            ...savedNotes
          ];
          localStorage.setItem('flash_notes', JSON.stringify(newNotes));
        } else if (inputType === 'todo') {
          const savedTodos = JSON.parse(localStorage.getItem('todo_list') || '[]');
          const newTodos = [
            { text: input, id: Date.now(), done: false, ddl: null, quadrant: null },
            ...savedTodos
          ];
          localStorage.setItem('todo_list', JSON.stringify(newTodos));
        }
      }
    } catch (error) {
      console.error('保存内容时出错:', error);
    }

    // 清空输入并隐藏输入框
    setInput('');
    setVisible(false);
    // 保存后立即启用点击穿透
    if (ipcRenderer) {
      ipcRenderer.send('set-ignore-mouse-events', true);
    }
  };

  // 处理取消按钮点击
  const handleCancel = () => {
    setInput('');
    setVisible(false);
    // 取消后立即启用点击穿透
    if (ipcRenderer) {
      ipcRenderer.send('set-ignore-mouse-events', true);
    }
  };

  // 定义菜单项和处理函数
  const handleMenuClick = ({ key }) => {
    switch (key) {
      case 'flash':
        setInputType('flash');
        break;
      case 'todo':
        setInputType('todo');
        break;
      case 'showMain':
        if (ipcRenderer) {
          console.log('发送显示主窗口消息');
          ipcRenderer.send('show-main-window');
        } else {
          console.error('ipcRenderer未初始化，无法显示主窗口');
        }
        break;
      case 'exit':
        if (ipcRenderer) {
          console.log('发送隐藏悬浮球消息');
          try {
            ipcRenderer.send('hide-floating-ball');
            console.log('隐藏悬浮球消息已发送');
          } catch (e) {
            console.error('发送隐藏悬浮球消息时出错:', e);
          }
        } else {
          console.error('ipcRenderer未初始化，无法隐藏悬浮球');
        }
        break;
      default:
        break;
    }
  };

  // 菜单配置
  const menuItems = [
    {
      key: 'flash',
      label: '闪记',
      className: inputType === 'flash' ? 'menu-item-selected' : ''
    },
    {
      key: 'todo',
      label: 'Todo',
      className: inputType === 'todo' ? 'menu-item-selected' : ''
    },
    {
      type: 'divider'
    },
    {
      key: 'showMain',
      label: '显示主程序'
    },
    {
      key: 'exit',
      label: '退出悬浮球'
    }
  ];

  return (
    <div className="floating-ball-container">
      {/* 悬浮球 */}
      <div
        ref={ballRef}
        className="floating-ball"
        style={{ 
          left: `${position.x}px`, 
          top: `${position.y}px`,
          backgroundColor: inputType === 'flash' ? 'rgba(24, 144, 255, 0.7)' : 'rgba(82, 196, 26, 0.7)'
        }}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          e.stopPropagation();
        }}
        title={`${inputType === 'flash' ? '闪记模式' : 'Todo模式'} - 左键点击输入，双击切换模式，右键点击显示菜单`}
      >
        <Dropdown 
          menu={{
            items: menuItems,
            onClick: handleMenuClick
          }}
          trigger={['contextMenu']}
          getPopupContainer={() => document.body}
        >
          <EditOutlined className="floating-ball-icon" />
        </Dropdown>
      </div>
      
      {/* 输入框 */}
      {visible && (
        <div 
          className="floating-input-container"
          style={{ 
            left: `${position.x + 40}px`, 
            top: `${position.y}px` 
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <Input.TextArea
            className="floating-input"
            autoSize={{ minRows: 1, maxRows: 5 }}
            placeholder={inputType === 'flash' ? "输入闪记..." : "输入 Todo..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSave();
              }
            }}
          />
          <div className="floating-input-buttons">
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={handleSave}
              className="save-button"
            />
            <Button
              icon={<CloseOutlined />}
              onClick={handleCancel}
              className="cancel-button"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default FloatingBall;
