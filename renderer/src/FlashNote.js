import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, List, Row, Col, message, Popover } from 'antd';
import { DeleteOutlined, DownOutlined, UpOutlined, EditOutlined, BgColorsOutlined, PlusOutlined, PushpinOutlined } from '@ant-design/icons';

const COLLAPSED_MAX_HEIGHT = 72; // 2行内容高度+padding

const COLOR_PALETTE = [
  '#fffbe6', '#e6fffb', '#f6ffed', '#f9f0ff', '#fff0f6', '#f0f5ff', '#ffffff'
];

function isSingleLine(text) {
  return !text.includes('\n') && text.length <= 40; // 你可根据实际宽度微调
}

function getCollapsedText(text, maxLen = 80, reserve = 6) {
  if (text.length > maxLen - reserve) {
    return text.slice(0, maxLen - reserve) + '...';
  }
  return text;
}

// 颜色加深并提升饱和度，支持 #rrggbb 格式
function darkenAndSaturate(hex, darkenAmount = 0.25, saturateAmount = 0.2) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  let num = parseInt(c, 16);
  let r = ((num >> 16) & 0xff) / 255;
  let g = ((num >> 8) & 0xff) / 255;
  let b = (num & 0xff) / 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  l = Math.max(0, l - darkenAmount * l);
  s = Math.min(1, s + saturateAmount);
  return `hsl(${Math.round(h * 360)},${Math.round(s * 100)}%,${Math.round(l * 100)}%)`;
}

function NoteItem({ item, expanded, onToggleExpand, onDelete, onEdit, editingId, setEditingId, onSaveEdit, onChangeColor, pendingDeleteId, deleteBtnRef }) {
  const contentRef = useRef(null);
  const [editValue, setEditValue] = useState(item.text);
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [needCollapse, setNeedCollapse] = useState(false);
  const singleLine = isSingleLine(item.text);
  const isEditing = editingId === item.id;
  const isDark = typeof document !== 'undefined' && document.body.classList.contains('dark-mode');

  useEffect(() => {
    if (isEditing) setEditValue(item.text);
  }, [isEditing, item.text]);

  // 判断内容是否需要折叠（高度超过COLLAPSED_MAX_HEIGHT才显示展开按钮）
  useEffect(() => {
    if (!contentRef.current) return;
    setTimeout(() => {
      if (contentRef.current.scrollHeight > COLLAPSED_MAX_HEIGHT + 2) {
        setNeedCollapse(true);
      } else {
        setNeedCollapse(false);
      }
    }, 0);
  }, [item.text]);

  const handleEditClick = () => {
    if (isEditing) {
      onSaveEdit(item.id, editValue);
      setEditingId(null);
    } else {
      setEditingId(item.id);
    }
  };

  const handleExpandClick = () => {
    if (isEditing) {
      onSaveEdit(item.id, editValue);
      setEditingId(null);
    }
    onToggleExpand(item.id);
  };

  // 在 NoteItem 组件中删除 handleOpenWindow 函数
  const handleOpenWindow = () => {
    let ipcRenderer;
    try {
      ipcRenderer = window.require && window.require('electron').ipcRenderer;
    } catch (e) {}
    if (ipcRenderer) {
      const noteData = {
        id: item.id.toString(),
        text: item.text || '',
        color: item.color || '',
        alwaysOnTop: true
      };
      console.log('Sending to main process:', noteData);
      ipcRenderer.send('open-note-window', noteData);
    } else {
      alert('请在Electron应用中使用此功能');
    }
  };

  // 删除小窗口按钮
  <Button
    className="note-action-btn"
    type="text"
    icon={<PushpinOutlined />}
    onClick={handleOpenWindow}
    key="window"
    size="small"
    title="独立窗口"
  />
  const colorBtn = expanded && (
    <Popover
      content={
        <div className="color-palette-container">
          {COLOR_PALETTE.map(color => (
            <div
              key={color}
              onClick={() => { onChangeColor(item.id, color); setColorPopoverOpen(false); }}
              className="color-palette-item"
              style={{
                background: color,
                border: color === item.color ? '2px solid #1890ff' : '1px solid #eee'
              }}
            />
          ))}
        </div>
      }
      trigger="click"
      open={colorPopoverOpen}
      onOpenChange={setColorPopoverOpen}
    >
      <Button type="text" icon={<BgColorsOutlined />} size="small" className="note-action-btn" title="更改背景色" />
    </Popover>
  );

  // 单行和多行内容统一布局，按钮始终右下角
  return (
    <List.Item className="flash-note-item">
      <div
        className={`note-content-anim${expanded ? ' expanded' : ''}`}
        ref={contentRef}
        style={{
          background: isDark ? '#232323' : (item.color || '#fff'),
        }}
      >
        {/* 彩色小圆球，仅暗色模式且有自定义色时显示 */}
        {isDark && item.color && (
          <span
            className="note-color-dot"
            style={{ background: darkenAndSaturate(item.color, 0.25, 0.2) }}
            title="该内容原本的颜色"
          />
        )}
        <div

          className={`note-text ${expanded ? 'note-text-expanded' : 'note-text-collapsed'}`}>
          {isEditing ? (
            <Input.TextArea
              autoSize
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onPressEnter={e => { e.preventDefault(); handleEditClick(); }}
              onBlur={handleEditClick}
            />
          ) : item.text}
        </div>
        <div
          className="note-actions"
          style={{
            position: 'absolute',
            right: 16,
            bottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: 'transparent',
            flexDirection: 'row',
            zIndex: 2,
          }}
        >
          <Button
            className="note-action-btn edit-button"
            type={isEditing ? 'primary' : 'text'}
            icon={<EditOutlined />}
            onClick={handleEditClick}
            key="edit"
            size="small"
            style={{ display: expanded || isEditing ? undefined : 'none' }}
            title={isEditing ? "保存编辑" : "编辑"}
          />
          {colorBtn}
          <Button
            className="note-action-btn"
            type="text"
            icon={<PushpinOutlined />}
            onClick={handleOpenWindow}
            key="window"
            size="small"
            color="#1890ff"
            title="独立窗口"
          />
          <Button
            className="note-action-btn"
            type="text"
            icon={<DeleteOutlined />}
            onClick={() => onDelete(item.id)}
            key="delete"
            size="small"
            danger={pendingDeleteId === item.id}
            ref={deleteBtnRef}
            title={pendingDeleteId === item.id ? "确认删除" : "删除"}
          />
          <Button
            className="note-action-btn"
            type="text"
            icon={expanded ? <UpOutlined /> : <DownOutlined />}
            onClick={handleExpandClick}
            key="expand"
            size="small"
            title={expanded ? "收起" : "展开"}
          />
        </div>
      </div>
    </List.Item>
  );
}

function FlashNote() {
  const [notes, setNotes] = useState([]);
  const [input, setInput] = useState('');
  const [expandedIds, setExpandedIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const deleteBtnRef = useRef(null);
  const textareaRef = useRef(null);

  // 获取IPC渲染器
  const getIpcRenderer = () => {
    try {
      return window.require && window.require('electron').ipcRenderer;
    } catch (e) {
      console.error('无法获取IPC渲染器:', e);
      return null;
    }
  };

  // 从文件系统加载笔记数据
  const loadNotes = async () => {
    console.log("开始加载笔记数据");
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      try {
        const savedNotes = await ipcRenderer.invoke('get-notes');
        console.log('从文件系统加载笔记:', savedNotes.length, '条');
        setNotes(savedNotes || []);
      } catch (error) {
        console.error('加载笔记失败:', error);
        message.error('加载笔记失败');
      }
    } else {
      console.warn('IPC不可用，无法加载笔记');
    }
  };

  // 保存所有笔记到文件系统
  const saveNotes = async (notesToSave) => {
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      try {
        await ipcRenderer.invoke('save-notes', notesToSave);
        console.log('笔记已保存到文件系统');
      } catch (error) {
        console.error('保存笔记失败:', error);
        message.error('保存笔记失败');
      }
    }
  };

  // 添加新笔记
  const addNoteToFile = async (noteData) => {
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      try {
        const savedNote = await ipcRenderer.invoke('add-note', noteData);
        console.log('笔记已添加到文件系统:', savedNote);
        return savedNote;
      } catch (error) {
        console.error('添加笔记失败:', error);
        message.error('添加笔记失败');
        return null;
      }
    }
    return null;
  };

  // 更新笔记
  const updateNoteInFile = async (noteData) => {
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      try {
        const success = await ipcRenderer.invoke('update-note', noteData);
        if (success) {
          console.log('笔记已更新到文件系统:', noteData);
        }
        return success;
      } catch (error) {
        console.error('更新笔记失败:', error);
        message.error('更新笔记失败');
        return false;
      }
    }
    return false;
  };

  // 删除笔记
  const deleteNoteFromFile = async (noteId) => {
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      try {
        const success = await ipcRenderer.invoke('delete-note', noteId);
        if (success) {
          console.log('笔记已从文件系统删除:', noteId);
        }
        return success;
      } catch (error) {
        console.error('删除笔记失败:', error);
        message.error('删除笔记失败');
        return false;
      }
    }
    return false;
  };

  useEffect(() => {
    // 初始加载笔记
    loadNotes();
    
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      // 监听来自主进程的刷新事件
      const handleRefreshNotes = () => {
        console.log('收到刷新笔记事件');
        loadNotes();
      };
      
      // 监听添加笔记事件（来自悬浮球）
      const handleAddNote = async (event, noteData) => {
        console.log('收到悬浮球添加笔记事件:', noteData);
        
        // 直接更新本地状态，因为笔记已经通过IPC添加到文件了
        setNotes(prevNotes => {
          // 检查是否已存在相同ID的笔记
          if (prevNotes.some(note => note.id && note.id.toString() === noteData.id.toString())) {
            console.log('笔记已存在，不重复添加');
            return prevNotes;
          }
          
          return [noteData, ...prevNotes];
        });
      };
      
      ipcRenderer.on('refresh-notes', handleRefreshNotes);
      ipcRenderer.on('add-note', handleAddNote);
      
      // 组件卸载时移除事件监听
      return () => {
        try {
          ipcRenderer.removeListener('refresh-notes', handleRefreshNotes);
          ipcRenderer.removeListener('add-note', handleAddNote);
        } catch (e) {
          console.error('移除IPC监听器失败:', e);
        }
      };
    }
  }, []);

  useEffect(() => {
    if (pendingDeleteId == null) return;
    const timer = setTimeout(() => setPendingDeleteId(null), 5000);
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

  const addNote = async () => {
    if (!input.trim()) return message.warning('内容不能为空');
    
    const newNote = { 
      text: input.trim(), 
      id: Date.now().toString(),
      color: '',
      alwaysOnTop: false,
      createdAt: new Date().toISOString()
    };
    
    const savedNote = await addNoteToFile(newNote);
    if (savedNote) {
      setNotes(prevNotes => [savedNote, ...prevNotes]);
      setInput('');
      if (textareaRef.current) textareaRef.current.focus();
    }
  };

  const handleDeleteClick = async (id) => {
    if (pendingDeleteId === id) {
      const success = await deleteNoteFromFile(id);
      if (success) {
        setNotes(notes.filter(n => n.id !== id));
        setExpandedIds(expandedIds.filter(eid => eid !== id));
        setEditingId(editingId === id ? null : editingId);
        setPendingDeleteId(null);
      }
    } else {
      setPendingDeleteId(id);
    }
  };

  const toggleExpand = (id) => {
    setExpandedIds(expandedIds.includes(id)
      ? expandedIds.filter(eid => eid !== id)
      : [...expandedIds, id]
    );
  };

  const saveEdit = async (id, newText) => {
    const noteToUpdate = notes.find(n => n.id === id);
    if (noteToUpdate) {
      const updatedNote = { ...noteToUpdate, text: newText.trim() };
      const success = await updateNoteInFile(updatedNote);
      if (success) {
        setNotes(notes.map(n => n.id === id ? updatedNote : n));
      }
    }
  };

  const changeColor = async (id, color) => {
    const noteToUpdate = notes.find(n => n.id === id);
    if (noteToUpdate) {
      const updatedNote = { ...noteToUpdate, color };
      const success = await updateNoteInFile(updatedNote);
      if (success) {
        setNotes(notes.map(n => n.id === id ? updatedNote : n));
      }
    }
  };

  return (
    <div>
      <Row gutter={8} align="middle">
        <Col flex="auto">
          <Input.TextArea
            ref={textareaRef}
            placeholder="快速记录..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onPressEnter={e => {
              if (!e.shiftKey) {
                e.preventDefault();
                addNote();
              }
            }}
            autoSize={{ minRows: 1, maxRows: 6 }}
            style={{ resize: 'none' }}
          />
        </Col>
        <Col>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={addNote} 
            style={{ 
              transition: 'all 0.3s',
              transform: 'rotate(0deg)',
              height: '32px'
            }}
            className="add-button"
            title="添加闪记"
          />
        </Col>
      </Row>
      <div className="content-scroll-area">
        <List
          className="add-note-form"
          bordered={false}
          dataSource={notes}
          renderItem={item => (
            <NoteItem
              key={item.id}
              item={item}
              expanded={expandedIds.includes(item.id)}
              onToggleExpand={toggleExpand}
              onDelete={() => handleDeleteClick(item.id)}
              onEdit={() => setEditingId(item.id)}
              editingId={editingId}
              setEditingId={setEditingId}
              onSaveEdit={saveEdit}
              onChangeColor={changeColor}
              pendingDeleteId={pendingDeleteId}
              deleteBtnRef={pendingDeleteId === item.id ? deleteBtnRef : undefined}
            />
          )}
        />
      </div>
    </div>
  );
}

export default FlashNote;