import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, List, Checkbox, Space, message, Popover, DatePicker, Select } from 'antd';
import { DeleteOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs'; // Import dayjs because antd v5 uses it

const QUADRANTS = [
  { value: 1, label: '重要且紧急', color: '#f5222d' },
  { value: 2, label: '重要不紧急', color: '#faad14' },
  { value: 3, label: '不重要但紧急', color: '#1890ff' },
  { value: 4, label: '不重要不紧急', color: '#52c41a' },
];

function Todo({ todoSettings }) {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const deleteBtnRef = useRef(null);

  // 排序函数
  const sortTodos = (todoList) => {
    if (!todoSettings?.autoSort) {
      return todoList;
    }

    return [...todoList].sort((a, b) => {
      // 已完成的任务始终排在最后
      if (a.done !== b.done) {
        return a.done ? 1 : -1;
      }
      
      // 如果都是未完成或都是已完成，按照设置的排序方式排序
      switch (todoSettings.sortBy) {
        case 'priority':
          // 优先级排序：象限1 > 象限2 > 象限3 > 象限4 > 无象限
          const getPriorityWeight = (quadrant) => {
            if (!quadrant) return 5;
            return quadrant;
          };
          const priorityDiff = getPriorityWeight(a.quadrant) - getPriorityWeight(b.quadrant);
          if (priorityDiff !== 0) return priorityDiff;
          
          // 同优先级的按截止日期排序
          if (a.ddl && b.ddl) {
            return new Date(a.ddl) - new Date(b.ddl);
          }
          if (a.ddl && !b.ddl) return -1;
          if (!a.ddl && b.ddl) return 1;
          
          // 最后按创建时间排序（新的在前）
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
          
        case 'deadline':
          // 截止日期排序：有日期的在前，按日期从近到远
          if (a.ddl && b.ddl) {
            return new Date(a.ddl) - new Date(b.ddl);
          }
          if (a.ddl && !b.ddl) return -1;
          if (!a.ddl && b.ddl) return 1;
          
          // 都没有截止日期的按创建时间排序（新的在前）
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
          
        case 'created':
          // 创建时间排序：新的在前
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
          
        default:
          return 0;
      }
    });
  };

  // 获取IPC渲染器
  const getIpcRenderer = () => {
    try {
      return window.require && window.require('electron').ipcRenderer;
    } catch (e) {
      console.error('无法获取IPC渲染器:', e);
      return null;
    }
  };

  // 从文件系统加载待办数据
  const loadTodos = async () => {
    console.log("开始加载待办数据");
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      try {
        const savedTodos = await ipcRenderer.invoke('get-todos');
        console.log('从文件系统加载待办:', savedTodos.length, '条');
        const sortedTodos = sortTodos(savedTodos || []);
        setTodos(sortedTodos);
      } catch (error) {
        console.error('加载待办失败:', error);
        message.error('加载待办失败');
      }
    } else {
      console.warn('IPC不可用，无法加载待办');
    }
  };

  // 添加新待办
  const addTodoToFile = async (todoData) => {
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      try {
        const savedTodo = await ipcRenderer.invoke('add-todo', todoData);
        console.log('待办已添加到文件系统:', savedTodo);
        return savedTodo;
      } catch (error) {
        console.error('添加待办失败:', error);
        message.error('添加待办失败');
        return null;
      }
    }
    return null;
  };

  // 更新待办
  const updateTodoInFile = async (todoData) => {
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      try {
        const success = await ipcRenderer.invoke('update-todo', todoData);
        if (success) {
          console.log('待办已更新到文件系统:', todoData);
        }
        return success;
      } catch (error) {
        console.error('更新待办失败:', error);
        message.error('更新待办失败');
        return false;
      }
    }
    return false;
  };

  // 删除待办
  const deleteTodoFromFile = async (todoId) => {
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      try {
        const success = await ipcRenderer.invoke('delete-todo', todoId);
        if (success) {
          console.log('待办已从文件系统删除:', todoId);
        }
        return success;
      } catch (error) {
        console.error('删除待办失败:', error);
        message.error('删除待办失败');
        return false;
      }
    }
    return false;
  };
  
  useEffect(() => {
    // 初始加载待办
    loadTodos();
    
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      // 监听来自主进程的刷新事件
      const handleRefreshTodos = () => {
        console.log('收到刷新待办事件');
        loadTodos();
      };
      
      // 监听添加待办事件（来自悬浮球）
      const handleAddTodo = async (event, todoData) => {
        console.log('收到悬浮球添加待办事件:', todoData);
        
        // 直接更新本地状态，因为待办已经通过IPC添加到文件了
        setTodos(prevTodos => {
          // 检查是否已存在相同ID的待办
          if (prevTodos.some(todo => todo.id && todo.id.toString() === todoData.id.toString())) {
            console.log('待办已存在，不重复添加');
            return prevTodos;
          }
          
          const newTodos = [todoData, ...prevTodos];
          return sortTodos(newTodos);
        });
      };
      
      ipcRenderer.on('refresh-todos', handleRefreshTodos);
      ipcRenderer.on('add-todo', handleAddTodo);
      
      // 组件卸载时移除事件监听
      return () => {
        try {
          ipcRenderer.removeListener('refresh-todos', handleRefreshTodos);
          ipcRenderer.removeListener('add-todo', handleAddTodo);
        } catch (e) {
          console.error('移除IPC监听器失败:', e);
        }
      };
    }
  }, []);

  // 监听todoSettings变化，重新排序
  useEffect(() => {
    if (todoSettings) {
      setTodos(prevTodos => sortTodos(prevTodos));
    }
  }, [todoSettings]);

  useEffect(() => {
    if (pendingDeleteId == null) return;
    // 5秒自动取消
    const timer = setTimeout(() => setPendingDeleteId(null), 5000);
    // 点击其它地方取消
    const handleClick = (e) => {
      if (deleteBtnRef.current && !deleteBtnRef.current.contains(e.target)) {
        setPendingDeleteId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [pendingDeleteId]);

  const addTodo = async () => {
    if (!input.trim()) return message.warning('任务不能为空');
    if (input.length > 20) {
      message.warning('任务内容不能超过20个字符');
      return;
    }
    
    const newTodo = { 
      text: input.trim(), 
      id: Date.now(), 
      done: false, 
      ddl: null, 
      quadrant: null,
      createdAt: new Date().toISOString()
    };
    
    const savedTodo = await addTodoToFile(newTodo);
    if (savedTodo) {
      setTodos(prevTodos => {
        const newTodos = [savedTodo, ...prevTodos];
        return sortTodos(newTodos);
      });
      setInput('');
    }
  };

  const toggleDone = async (id) => {
    const todoToUpdate = todos.find(t => t.id === id);
    if (todoToUpdate) {
      const updatedTodo = { ...todoToUpdate, done: !todoToUpdate.done };
      const success = await updateTodoInFile(updatedTodo);
      if (success) {
        setTodos(prevTodos => {
          const newTodos = prevTodos.map(t => t.id === id ? updatedTodo : t);
          return sortTodos(newTodos);
        });
      }
    }
  };

  const handleDeleteClick = async (id) => {
    if (pendingDeleteId === id) {
      const success = await deleteTodoFromFile(id);
      if (success) {
        setTodos(todos.filter(t => t.id !== id));
        setPendingDeleteId(null);
      }
    } else {
      setPendingDeleteId(id);
    }
  };

  const handleDdlChange = async (id, date) => {
    const todoToUpdate = todos.find(t => t.id === id);
    if (todoToUpdate) {
      const dateString = date ? date.format('YYYY-MM-DD') : null;
      const updatedTodo = { ...todoToUpdate, ddl: dateString };
      const success = await updateTodoInFile(updatedTodo);
      if (success) {
        setTodos(prevTodos => {
          const newTodos = prevTodos.map(t => t.id === id ? updatedTodo : t);
          return sortTodos(newTodos);
        });
      }
    }
  };

  const handleQuadrantChange = async (id, value) => {
    const todoToUpdate = todos.find(t => t.id === id);
    if (todoToUpdate) {
      const updatedTodo = { ...todoToUpdate, quadrant: value };
      const success = await updateTodoInFile(updatedTodo);
      if (success) {
        setTodos(prevTodos => {
          const newTodos = prevTodos.map(t => t.id === id ? updatedTodo : t);
          return sortTodos(newTodos);
        });
      }
    }
  };

  return (
    <div>
      <Space.Compact className="add-todo-form">
        <Input
          placeholder="添加任务..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onPressEnter={addTodo}
          className="todo-input"
        />
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={addTodo}
          className="add-button"
          title="添加待办事项"
        >
        </Button>
      </Space.Compact>

      <List
        className="todo-list"
        dataSource={todos}
        renderItem={item => (
          <List.Item
            actions={[
              <Popover
                key="more"
                content={
                  <div className="todo-popover-content">
                    <div className="todo-popover-item">
                      <DatePicker
                        placeholder="选择截止日期"
                        value={item.ddl ? dayjs(item.ddl) : null}
                        onChange={(date) => handleDdlChange(item.id, date)}
                        className="todo-datepicker"
                      />
                    </div>
                    <div className="todo-popover-item">
                      <Select
                        placeholder="选择象限"
                        value={item.quadrant}
                        onChange={(value) => handleQuadrantChange(item.id, value)}
                        className="todo-quadrant-select"
                        allowClear
                      >
                        {QUADRANTS.map(q => (
                          <Select.Option key={q.value} value={q.value}>
                            <span style={{ color: q.color }}>{q.label}</span>
                          </Select.Option>
                        ))}
                      </Select>
                    </div>
                  </div>
                }
                title="更多设置"
                trigger="click"
              >
                <Button type="text" icon={<MoreOutlined />} size="small" title="更多设置" />
              </Popover>,
              <Button
                key="delete"
                type="text"
                icon={<DeleteOutlined />}
                size="small"
                danger={pendingDeleteId === item.id}
                onClick={() => handleDeleteClick(item.id)}
                ref={pendingDeleteId === item.id ? deleteBtnRef : null}
                title={pendingDeleteId === item.id ? "确认删除" : "删除"}
              />
            ]}
          >
            <List.Item.Meta
              avatar={
                <Checkbox
                  checked={item.done}
                  onChange={() => toggleDone(item.id)}
                  title={item.done ? "标记为未完成" : "标记为已完成"}
                />
              }
              title={
                <span className={item.done ? 'todo-text-done' : ''}>
                  {item.text}
                  {item.ddl && (
                    <span className="todo-ddl">
                      {dayjs(item.ddl).format('MM-DD')}
                    </span>
                  )}
                  {item.quadrant && (
                    <span className={`todo-quadrant-label todo-quadrant-label-${item.quadrant}`}>
                      {QUADRANTS.find(q => q.value === item.quadrant)?.label}
                    </span>
                  )}
                </span>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
}

export default Todo;