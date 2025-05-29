import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, List, Row, Col, message, Popover } from 'antd';
import { DeleteOutlined, DownOutlined, UpOutlined, EditOutlined, BgColorsOutlined, PlusOutlined, PushpinOutlined } from '@ant-design/icons';

const STORAGE_KEY = 'flash_notes';
const COLLAPSED_MAX_HEIGHT = 72; // 2行内容高度+padding
const EXPANDED_MAX_HEIGHT = 500; // 展开最大高度
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
  const [maxHeight, setMaxHeight] = useState(COLLAPSED_MAX_HEIGHT + 'px');
  const [editValue, setEditValue] = useState(item.text);
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [needCollapse, setNeedCollapse] = useState(false);
  const singleLine = isSingleLine(item.text);
  const isEditing = editingId === item.id;
  const isDark = typeof document !== 'undefined' && document.body.classList.contains('dark-mode');

  useEffect(() => {
    setMaxHeight(expanded ? EXPANDED_MAX_HEIGHT + 'px' : COLLAPSED_MAX_HEIGHT + 'px');
  }, [expanded, item.text]);

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
        <div style={{ display: 'flex', gap: 6 }}>
          {COLOR_PALETTE.map(color => (
            <div
              key={color}
              onClick={() => { onChangeColor(item.id, color); setColorPopoverOpen(false); }}
              style={{
                width: 24, height: 24, borderRadius: '50%', background: color,
                border: color === item.color ? '2px solid #1890ff' : '1px solid #eee', cursor: 'pointer'
              }}
            />
          ))}
        </div>
      }
      trigger="click"
      open={colorPopoverOpen}
      onOpenChange={setColorPopoverOpen}
    >
      <Button type="text" icon={<BgColorsOutlined />} size="small" className="note-action-btn" />
    </Popover>
  );

  // 单行和多行内容统一布局，按钮始终右下角
  return (
    <List.Item style={{ padding: 0, border: 'none', background: 'transparent' }}>
      <div
        className={`note-content-anim${expanded ? ' expanded' : ''}`}
        ref={contentRef}
        style={{
          maxHeight,
          background: isDark ? '#232323' : (item.color || '#fff'),
          position: 'relative',
          minHeight: 32,
          overflow: 'hidden',
          padding: expanded ? '2px 12px 40px 12px' : '2px 12px 40px 12px',
          boxSizing: 'border-box',
          paddingRight: 20,
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
          className="note-text"
          style={expanded ? { minWidth: 0, flex: 1, minHeight: 32, paddingRight: 8, wordWrap: 'break-word' } : {
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            whiteSpace: 'normal',
            textOverflow: 'ellipsis',
            wordBreak: 'break-all',
            minWidth: 0,
            flex: 1,
            lineHeight: '32px',
            maxWidth: '100%',
            minHeight: 32,
            paddingRight: 60,
            wordWrap: 'break-word'
          }}
        >
          {isEditing ? (
            <Input.TextArea
              autoSize
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onPressEnter={e => { e.preventDefault(); handleEditClick(); }}
              onBlur={handleEditClick}
              style={{ background: 'inherit', border: '1px solid #eee', borderRadius: 4 }}
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
            className="note-action-btn"
            type={isEditing ? 'primary' : 'text'}
            icon={<EditOutlined />}
            onClick={handleEditClick}
            key="edit"
            size="small"
            style={{ display: expanded || isEditing ? undefined : 'none' }}
          />
          {colorBtn}
          <Button
            className="note-action-btn"
            type="text"
            icon={<PushpinOutlined />}
            onClick={handleOpenWindow}
            key="window"
            size="small"
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
          />
          <Button
            className="note-action-btn"
            type="text"
            icon={expanded ? <UpOutlined /> : <DownOutlined />}
            onClick={handleExpandClick}
            key="expand"
            size="small"
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

  // 加载笔记数据的函数
  const loadNotes = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setNotes(JSON.parse(saved));
  };

  useEffect(() => {
    // 初始加载笔记
    loadNotes();
    
    // 监听来自主进程的刷新事件
    let ipcRenderer;
    try {
      ipcRenderer = window.require && window.require('electron').ipcRenderer;
      if (ipcRenderer) {
        ipcRenderer.on('refresh-notes', loadNotes);
      }
    } catch (e) {
      console.error('Error setting up IPC listener:', e);
    }
    
    // 组件卸载时移除事件监听
    return () => {
      if (ipcRenderer) {
        try {
          ipcRenderer.removeListener('refresh-notes', loadNotes);
        } catch (e) {
          console.error('Error removing IPC listener:', e);
        }
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

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

  const addNote = () => {
    if (!input.trim()) return message.warning('内容不能为空');
    setNotes([{ text: input, id: Date.now() }, ...notes]);
    setInput('');
    if (textareaRef.current) textareaRef.current.focus();
  };

  const handleDeleteClick = (id) => {
    if (pendingDeleteId === id) {
      setNotes(notes.filter(n => n.id !== id));
      setExpandedIds(expandedIds.filter(eid => eid !== id));
      setEditingId(editingId === id ? null : editingId);
      setPendingDeleteId(null);
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

  const saveEdit = (id, newText) => {
    setNotes(notes.map(n => n.id === id ? { ...n, text: newText } : n));
  };

  const changeColor = (id, color) => {
    setNotes(notes.map(n => n.id === id ? { ...n, color } : n));
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
          />
        </Col>
      </Row>
      <div className="content-scroll-area" style={{ height: 'calc(100vh - 100px)', overflow: 'auto', paddingBottom: 5 }}>
        <List
          style={{ marginTop: 16 }}
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