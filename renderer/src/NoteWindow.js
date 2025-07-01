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

    // 从localStorage或文件中加载笔记数据
    const loadNote = () => {
      try {
        // 尝试从localStorage加载
        const savedNotes = JSON.parse(localStorage.getItem('flash_notes') || '[]');
        const foundNote = savedNotes.find(n => n.id.toString() === noteId);
        if (foundNote) {
          setNote(foundNote);
          setEditValue(foundNote.text || '');
          // 初始化时设置一次置顶
          const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
          if (ipcRenderer) {
            ipcRenderer.send('set-always-on-top', { id: noteId, value: foundNote.alwaysOnTop !== false });
            setAlwaysOnTop(foundNote.alwaysOnTop !== false);
          }
          return;
        }
      } catch (e) {
        console.error('Error loading note:', e);
      }
    };

    loadNote();

    // 检测暗色模式
    setIsDark(document.body.classList.contains('dark-mode'));
  }, []);
  
  const handleClose = () => {
    if (isEditing) {
      saveEdit();
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
  
  const handleEditClick = () => {
    if (isEditing) {
      // 保存编辑
      saveEdit();
    } else {
      // 进入编辑模式
      setIsEditing(true);
    }
  };
  
  const saveEdit = () => {
    if (!note) return;
    
    // 更新本地状态
    setNote({...note, text: editValue});
    setIsEditing(false);
    
    try {
      // 更新localStorage
      const savedNotes = JSON.parse(localStorage.getItem('flash_notes') || '[]');
      const updatedNotes = savedNotes.map(n => 
        n.id.toString() === note.id.toString() ? {...n, text: editValue} : n
      );
      localStorage.setItem('flash_notes', JSON.stringify(updatedNotes));
      
      // 通过IPC通知主进程更新
      const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
      if (ipcRenderer) {
        ipcRenderer.send('update-note', {
          id: note.id.toString(),
          text: editValue,
          color: note.color || ''
        });
      }
    } catch (e) {
      console.error('Error saving note:', e);
    }
  };
  
  if (!note) return <div className="loading">加载中...</div>;
  
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
        />
      </div>
      <div className="note-content-window">
        {isEditing ? (
          <Input.TextArea
            autoSize={{ minRows: 4 }}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); saveEdit(); } }}
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