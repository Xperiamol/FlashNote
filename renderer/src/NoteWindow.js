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
    
    // 检查是否在Electron环境中
    const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
    
    // 从localStorage或文件中加载笔记数据
    const loadNote = () => {
      try {
        // 尝试从localStorage加载
        const savedNotes = JSON.parse(localStorage.getItem('flash_notes') || '[]');
        const foundNote = savedNotes.find(n => n.id.toString() === noteId);
        if (foundNote) {
          setNote(foundNote);
          setEditValue(foundNote.text || '');
          return;
        }
      } catch (e) {
        console.error('Error loading note:', e);
      }
    };
    
    loadNote();
    
    // 检测暗色模式
    setIsDark(document.body.classList.contains('dark-mode'));
    
    // 设置窗口置顶状态
    if (ipcRenderer) {
      ipcRenderer.send('set-always-on-top', { id: noteId, value: alwaysOnTop });
    }
  }, [alwaysOnTop]);
  
  const handleClose = () => {
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
      className="note-window"
      style={{
        background: isDark ? '#232323' : (note.color || '#fff'),
        padding: '8px',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '8px',
        overflow: 'hidden'
      }}
    >
      <div className="custom-title-bar" style={{ padding: '4px 8px', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <Button
            type={isEditing ? 'primary' : 'text'}
            icon={<EditOutlined />}
            onClick={handleEditClick}
            size="small"
            title={isEditing ? "保存" : "编辑"}
            style={{ marginRight: '4px', WebkitAppRegion: 'no-drag' }}
          />
          <Button
            type="text"
            icon={<PushpinOutlined style={{ color: alwaysOnTop ? '#1890ff' : undefined }} />}
            onClick={toggleAlwaysOnTop}
            size="small"
            title={alwaysOnTop ? "取消置顶" : "窗口置顶"}
            style={{ WebkitAppRegion: 'no-drag' }}
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
      <div 
        className="note-content"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '8px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}
      >
        {isEditing ? (
          <Input.TextArea
            autoSize={{ minRows: 4 }}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); saveEdit(); } }}
            style={{ background: 'inherit', border: '1px solid #eee', borderRadius: 4 }}
          />
        ) : (
          note.text
        )}
      </div>
    </div>
  );
}

export default NoteWindow;