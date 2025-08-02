import React, { useState, useEffect } from 'react';
import { Button, Input } from 'antd';
import { CloseOutlined, PushpinOutlined, EditOutlined } from '@ant-design/icons';
import './App.css';

function NoteWindow() {
  const [note, setNote] = useState(null);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  
  useEffect(() => {
    // 从URL hash中获取笔记ID
    const noteId = window.location.hash.replace('#note/', '');

    // 从主进程或localStorage中加载笔记数据
    const loadNote = async () => {
      try {
        // 首先尝试从主进程获取数据
        const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
        if (ipcRenderer) {
          try {
            console.log('从主进程获取笔记数据, ID:', noteId);
            const foundNote = await ipcRenderer.invoke('get-note-by-id', noteId);
            if (foundNote) {
              console.log('从主进程加载笔记成功:', foundNote);
              setNote(foundNote);
              setEditValue(foundNote.text || '');
              // 设置置顶状态
              ipcRenderer.send('set-always-on-top', { id: noteId, value: foundNote.alwaysOnTop !== false });
              setAlwaysOnTop(foundNote.alwaysOnTop !== false);
              return;
            }
          } catch (error) {
            console.error('从主进程获取笔记失败:', error);
          }
        }
        
        // 备用方案：从localStorage加载
        console.log('尝试从 localStorage 加载笔记');
        const savedNotes = JSON.parse(localStorage.getItem('flash_notes') || '[]');
        const foundNote = savedNotes.find(n => n.id.toString() === noteId);
        if (foundNote) {
          console.log('从 localStorage 加载笔记成功:', foundNote);
          setNote(foundNote);
          setEditValue(foundNote.text || '');
          // 初始化时设置一次置顶
          if (ipcRenderer) {
            ipcRenderer.send('set-always-on-top', { id: noteId, value: foundNote.alwaysOnTop !== false });
            setAlwaysOnTop(foundNote.alwaysOnTop !== false);
          }
          return;
        }
        
        console.error('未找到笔记，ID:', noteId);
      } catch (e) {
        console.error('Error loading note:', e);
      }
    };

    loadNote();

    // 检测暗色模式
    setIsDark(document.body.classList.contains('dark-mode'));
  }, []);
  
  const handleClose = async () => {
    if (isEditing) {
      await saveEdit();
    }
    if (window && window.close) {
      window.close();
    }
  };
  
  const toggleAlwaysOnTop = () => {
    const newValue = !alwaysOnTop;
    setAlwaysOnTop(newValue);
    
    const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
    if (ipcRenderer && note) {
      ipcRenderer.send('set-always-on-top', { id: note.id, value: newValue });
    }
  };
  
  const handleEditClick = async () => {
    if (isEditing) {
      // 保存编辑
      await saveEdit();
    } else {
      // 进入编辑模式
      setIsEditing(true);
    }
  };
  
  const saveEdit = async () => {
    if (!note) return;
    
    // 更新本地状态
    const updatedNote = {...note, text: editValue};
    setNote(updatedNote);
    setIsEditing(false);
    
    try {
      // 优先通过IPC通知主进程更新
      const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
      if (ipcRenderer) {
        try {
          const success = await ipcRenderer.invoke('update-note', {
            id: note.id.toString(),
            text: editValue,
            color: note.color || ''
          });
          console.log('通过IPC更新笔记:', success ? '成功' : '失败');
        } catch (error) {
          console.error('通过IPC更新笔记失败:', error);
        }
      }
      
      // 同时更新localStorage（作为备用）
      const savedNotes = JSON.parse(localStorage.getItem('flash_notes') || '[]');
      const updatedNotes = savedNotes.map(n => 
        n.id.toString() === note.id.toString() ? {...n, text: editValue} : n
      );
      localStorage.setItem('flash_notes', JSON.stringify(updatedNotes));
      console.log('更新localStorage成功');
      
    } catch (e) {
      console.error('Error saving note:', e);
    }
  };
  
  if (!note) return <div className="loading">加载中...若无反应请在任务栏关闭窗口再打开QAQ</div>;
  
  return (
    <div 
      className={`note-window ${isDark ? 'dark-mode' : ''}`}
      style={{ background: !isDark ? (note.color || '#fff') : undefined }}
    >
      <div className="note-window-title-bar">
        <div>
          <Button
            type={isEditing ? 'primary' : 'text'}
            icon={<EditOutlined />}
            onClick={handleEditClick}
            size="small"
            title={isEditing ? "保存" : "编辑"}
            className="edit-button"
          />
          <Button
            type="text"
            icon={<PushpinOutlined className={alwaysOnTop ? 'pinned' : ''} />}
            onClick={toggleAlwaysOnTop}
            size="small"
            title={alwaysOnTop ? "取消置顶" : "窗口置顶"}
            className="pin-button"
          />
        </div>
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={handleClose}
          className="close-btn"
          size="small"
          title="关闭窗口"
        />
      </div>
      <div className="note-content-window">
        {isEditing ? (
          <Input.TextArea
            autoSize={{ minRows: 4 }}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onPressEnter={async (e) => { if (!e.shiftKey) { e.preventDefault(); await saveEdit(); } }}
            className="edit-textarea"
          />
        ) : (
          note.text
        )}
      </div>
    </div>
  );
}

export default NoteWindow;