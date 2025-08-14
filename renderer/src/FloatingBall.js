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
  const [expandLeft, setExpandLeft] = useState(false); // 控制输入框展开方向
  const [menuVisible, setMenuVisible] = useState(false); // 控制右键菜单的显示状态
  const ballRef = useRef(null);
  const inputRef = useRef(null); // 添加输入框引用
  const [ipcRenderer, setIpcRenderer] = useState(null);
  const leaveTimer = useRef(null); // 用于处理鼠标离开的计时器
  const clickTimeoutRef = useRef(null); // 用于处理单击延迟的计时器
  const hoverStateTimer = useRef(null); // 用于处理悬停状态计时器
  
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

  // 悬浮球状态：idle（闲置）、active（激活）
  const [ballState, setBallState] = useState('idle');

  // 辅助函数：调整颜色亮度
  const adjustColorBrightness = (color, amount) => {
    // 将十六进制颜色转换为RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // 调整亮度 (amount: -1 到 1, 负数变暗，正数变亮)
    const adjust = (component) => {
      if (amount > 0) {
        // 变亮：向255靠近
        return Math.round(component + (255 - component) * amount);
      } else {
        // 变暗：向0靠近
        return Math.round(component * (1 + amount));
      }
    };
    
    const newR = Math.max(0, Math.min(255, adjust(r)));
    const newG = Math.max(0, Math.min(255, adjust(g)));
    const newB = Math.max(0, Math.min(255, adjust(b)));
    
    // 转换回十六进制
    const toHex = (component) => component.toString(16).padStart(2, '0');
    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
  };
  
  // 初始化 ipcRenderer
  useEffect(() => {
    try {
      if (window.require) {
        const electron = window.require('electron');
        const ipc = electron.ipcRenderer;
        setIpcRenderer(ipc);
        
        // 测试 IPC 是否工作正常
        console.log('ipcRenderer 初始化成功:', ipc ? '是' : '否');
        
        // 加载悬浮球设置
        ipc.invoke('get-settings')
          .then((settings) => {
            console.log('从主进程获取设置:', settings);
            if (settings.floatingBallSettings) {
              setFloatingBallSettings(settings.floatingBallSettings);
              console.log('悬浮球设置已加载:', settings.floatingBallSettings);
            }
          })
          .catch(error => {
            console.error('获取悬浮球设置失败:', error);
          });
        
        // 监听设置更新
        ipc.on('floating-ball-settings-updated', (event, newSettings) => {
          console.log('收到悬浮球设置更新:', newSettings);
          setFloatingBallSettings(newSettings);
        });
      } else {
        console.warn('window.require 不可用，可能不在 Electron 环境中');
      }
    } catch (e) {
      console.error('无法初始化 ipcRenderer:', e);
    }
  }, []);

  // 根据悬浮球位置决定输入框展开方向
  useEffect(() => {
    const screenWidth = window.innerWidth;
    // 当悬浮球进入屏幕右侧五分之一区域时，向左展开
    if (position.x > screenWidth * 4 / 5) {
      setExpandLeft(true);
    } else {
      setExpandLeft(false);
    }
  }, [position]);

  // 当输入框显示时自动聚焦
  useEffect(() => {
    if (visible && inputRef.current) {
      // 使用 requestAnimationFrame 确保 DOM 渲染完成后再聚焦
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      });
    }
  }, [visible]);

  // 当输入框隐藏时重新启用点击穿透
  useEffect(() => {
    if (!visible && ipcRenderer) {
      // 延迟一点点时间确保所有事件处理完成
      setTimeout(() => {
        ipcRenderer.send('set-ignore-mouse-events', true);
      }, 50);
    }
  }, [visible, ipcRenderer]);

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

  // 统一处理鼠标进入交互区域（悬浮球、输入框、菜单）
  const handleMouseEnter = () => {
    clearTimeout(leaveTimer.current);
    clearTimeout(hoverStateTimer.current);
    setBallState('active');
    if (ipcRenderer) {
      ipcRenderer.send('set-ignore-mouse-events', false);
    }
  };

  // 统一处理鼠标离开交互区域
  const handleMouseLeave = () => {
    leaveTimer.current = setTimeout(() => {
      if (ipcRenderer) {
        ipcRenderer.send('set-ignore-mouse-events', true);
      }
    }, 100);

    // 设置2秒后变为闲置状态
    hoverStateTimer.current = setTimeout(() => {
      setBallState('idle');
    }, 2000);
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
      if (hoverStateTimer.current) {
        clearTimeout(hoverStateTimer.current);
      }
    };
  }, []);

  // 处理左键点击，显示/隐藏输入框
  const handleClick = (event) => {
    if (menuVisible) {
      setMenuVisible(false);
      return;
    }
    createRipple(event);
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      return;
    }
    clickTimeoutRef.current = setTimeout(() => {
      setVisible(!visible);
      clickTimeoutRef.current = null;
    }, 250);
  };

  // 处理双击，切换输入类型
  const handleDoubleClick = (event) => {
    if (menuVisible) {
      setMenuVisible(false);
      return;
    }
    createRipple(event);
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    setInputType(prev => prev === 'flash' ? 'todo' : 'flash');
    console.log('双击切换输入类型:', inputType === 'flash' ? 'todo' : 'flash');
  };

  // 处理保存按钮点击
  const handleSave = async () => {
    if (!input.trim()) return;
    try {
      console.log('悬浮球保存内容:', inputType, input);
      if (ipcRenderer) {
        if (inputType === 'flash') {
          const noteData = {
            text: input.trim(),
            id: Date.now().toString(),
            color: '',
            alwaysOnTop: false,
            createdAt: new Date().toISOString()
          };
          console.log('发送闪记到主进程:', noteData);
          try {
            const savedNote = await ipcRenderer.invoke('add-note', noteData);
            console.log('闪记添加成功:', savedNote);
          } catch (error) {
            console.error('通过IPC添加闪记失败:', error);
            ipcRenderer.send('add-note', noteData);
          }
        } else if (inputType === 'todo') {
          const todoData = {
            text: input.trim(),
            id: Date.now(),
            done: false,
            ddl: null,
            quadrant: null,
            createdAt: new Date().toISOString()
          };
          console.log('发送待办到主进程:', todoData);
          ipcRenderer.send('add-todo', todoData);
        }
      } else {
        console.warn('ipcRenderer未初始化，使用localStorage备用方案');
        if (inputType === 'flash') {
          const savedNotes = JSON.parse(localStorage.getItem('flash_notes') || '[]');
          const newNotes = [
            { text: input.trim(), id: Date.now().toString(), color: '', alwaysOnTop: false },
            ...savedNotes
          ];
          localStorage.setItem('flash_notes', JSON.stringify(newNotes));
        } else if (inputType === 'todo') {
          const savedTodos = JSON.parse(localStorage.getItem('todo_list') || '[]');
          const newTodos = [
            { text: input.trim(), id: Date.now(), done: false, ddl: null, quadrant: null, createdAt: new Date().toISOString() },
            ...savedTodos
          ];
          localStorage.setItem('todo_list', JSON.stringify(newTodos));
        }
      }
    } catch (error) {
      console.error('保存内容时出错:', error);
    }
    setInput('');
    setVisible(false);
    
    // 重新启用点击穿透
    if (ipcRenderer) {
      ipcRenderer.send('set-ignore-mouse-events', true);
    }
  };

  // 处理取消按钮点击
  const handleCancel = () => {
    setInput('');
    setVisible(false);
    
    // 重新启用点击穿透
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
    // 菜单项点击后关闭菜单
    setMenuVisible(false);
  };

  // 处理菜单显示状态变化
  const handleMenuVisibleChange = (visible) => {
    setMenuVisible(visible);
    if (visible) {
      setTimeout(() => {
        const dropdown = document.querySelector('.ant-dropdown');
        if (dropdown) {
          dropdown.onmouseenter = handleMouseEnter;
          dropdown.onmouseleave = handleMouseLeave;
        }
      }, 50);
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
      <Dropdown 
        open={menuVisible}
        onOpenChange={handleMenuVisibleChange}
        menu={{
          items: menuItems,
          onClick: handleMenuClick
        }}
        trigger={['contextMenu']}
        getPopupContainer={() => document.body}
      >
        <div
          ref={ballRef}
          className="floating-ball"
          style={{ 
            left: `${position.x}px`, 
            top: `${position.y}px`,
            width: `${floatingBallSettings.size}px`,
            height: `${floatingBallSettings.size}px`,
            backgroundColor: (() => {
              // 根据模式选择基础颜色
              const baseColor = inputType === 'flash' 
                ? floatingBallSettings.flashColor 
                : floatingBallSettings.todoColor;
              
              // 根据状态调整亮度
              return ballState === 'active' 
                ? adjustColorBrightness(baseColor, floatingBallSettings.brightnessChange)
                : baseColor;
            })(),
            opacity: ballState === 'active' 
              ? floatingBallSettings.activeOpacity 
              : floatingBallSettings.idleOpacity
          }}
          onMouseDown={handleMouseDown}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => {
            e.stopPropagation();
            // 如果菜单已经打开，则关闭它
            if (menuVisible) {
              setMenuVisible(false);
            }
          }}
          title={`${inputType === 'flash' ? '闪记模式' : 'Todo模式'} - 左键点击输入，双击切换模式，右键点击显示菜单`}
        >
          {floatingBallSettings.useCustomIcon && floatingBallSettings.customIcon ? (
            <img 
              src={floatingBallSettings.customIcon} 
              alt="自定义图标" 
              style={{ 
                width: '70%', 
                height: '70%', 
                objectFit: 'cover',
                borderRadius: '50%'
              }}
            />
          ) : (
            <EditOutlined className="floating-ball-icon" />
          )}
        </div>
      </Dropdown>
      
      {/* 输入框 */}
      {visible && (
        <div 
          className={`floating-input-container ${expandLeft ? 'expand-left' : ''}`}
          style={{ 
            top: `${position.y}px`,
            left: expandLeft ? `${position.x - 300 - 10}px` : `${position.x + floatingBallSettings.size + 10}px`
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <Input.TextArea
            ref={inputRef}
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
              title="保存"
            />
            <Button
              icon={<CloseOutlined />}
              onClick={handleCancel}
              className="cancel-button"
              title="取消"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default FloatingBall;
