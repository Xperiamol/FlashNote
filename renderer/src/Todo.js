import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, List, Checkbox, Space, message, Popover, DatePicker, Select } from 'antd';
import { DeleteOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs'; // Import dayjs because antd v5 uses it


const STORAGE_KEY = 'todo_list';

const QUADRANTS = [
  { value: 1, label: '重要且紧急', color: '#f5222d' },
  { value: 2, label: '重要不紧急', color: '#faad14' },
  { value: 3, label: '不重要但紧急', color: '#1890ff' },
  { value: 4, label: '不重要不紧急', color: '#52c41a' },
];

function Todo() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const deleteBtnRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setTodos(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

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

  const addTodo = () => {
    if (!input.trim()) return message.warning('任务不能为空');
    if (input.length > 20) {
      message.warning('任务内容不能超过20个字符');
      return;
    }
    setTodos([{ text: input, id: Date.now(), done: false, ddl: null, quadrant: null }, ...todos]);
    setInput('');
  };

  const toggleDone = (id) => {
    setTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const handleDeleteClick = (id) => {
    if (pendingDeleteId === id) {
      setTodos(todos.filter(t => t.id !== id));
      setPendingDeleteId(null);
    } else {
      setPendingDeleteId(id);
    }
  };

    const handleDdlChange = (id, date) => {
    const dateString = date ? date.format('YYYY-MM-DD') : null;
    setTodos(todos.map(t => t.id === id ? { ...t, ddl: dateString } : t));
  };

  const handleQuadrantChange = (id, value) => {
    setTodos(todos.map(t => t.id === id ? { ...t, quadrant: value } : t));
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
        />
      </Space.Compact>
      <div className="content-scroll-area">
        <List
          className="todo-list"
          bordered
          dataSource={
            [...todos].sort((a, b) => {
              // 先按完成状态排序，未完成在前，已完成在后
              if (a.done !== b.done) return a.done ? 1 : -1;
              // 未完成任务内部按四象限排序
              if (!a.done && !b.done) {
                if (a.quadrant && b.quadrant) return a.quadrant - b.quadrant;
                if (a.quadrant) return -1;
                if (b.quadrant) return 1;
                return 0;
              }
              // 已完成任务内部不排序
              return 0;
            })
          }
          renderItem={item => (
            <List.Item
              actions={[
                <Button
                  type="text"
                  icon={<DeleteOutlined />}
                  danger={pendingDeleteId === item.id}
                  onClick={() => handleDeleteClick(item.id)}
                  key="delete"
                  ref={pendingDeleteId === item.id ? deleteBtnRef : undefined}
                />,
                <Popover
                  placement="left"
                  trigger="click"
                  content={
                    <div className="todo-popover-content">
                      <div className="todo-popover-item">
                        <span>截止日期：</span>
                        <DatePicker
                          value={item.ddl ? dayjs(item.ddl, 'YYYY-MM-DD') : null}
                          onChange={date => handleDdlChange(item.id, date)}
                          allowClear
                          className="todo-datepicker"
                        />
                      </div>
                      <div>
                        <span>四象限：</span>
                        <Select
                          value={item.quadrant}
                          onChange={value => handleQuadrantChange(item.id, value)}
                          options={QUADRANTS}
                          allowClear
                          className="todo-quadrant-select"
                          placeholder="选择分类"
                        />
                      </div>
                    </div>
                  }
                  key="more"
                >
                  <Button type="text" icon={<MoreOutlined />} />
                </Popover>
              ]}
            >
              <Checkbox checked={item.done} onChange={() => toggleDone(item.id)}>
                <span className={item.done ? 'todo-text-done' : ''}>{item.text}</span>
                {item.ddl && (
                  <span className="todo-ddl">
                    [DDL: {item.ddl}
                    {(() => {
                      if (!item.ddl) return '';
                      const now = new Date();
                      now.setHours(0, 0, 0, 0);
                      const ddl = new Date(item.ddl + 'T00:00:00');
                      const diffTime = ddl.getTime() - now.getTime();
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                      if (diffDays > 0) return `，剩${diffDays}天`;
                      if (diffDays === 0) return '，今天截止';
                      return '，已过期';
                    })()}]
                  </span>
                )}
                {item.quadrant && (
                  <span

                    className={`todo-quadrant-label todo-quadrant-label-${item.quadrant}`}
                  >
                    [{QUADRANTS.find(q => q.value === item.quadrant)?.label}]
                  </span>
                )}
              </Checkbox>
            </List.Item>
          )}
        />
      </div>
    </div>
  );
}

export default Todo;