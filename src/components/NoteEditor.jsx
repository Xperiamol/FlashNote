import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  TextField,
  Typography,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Divider,
  Alert,
  Snackbar,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material'
import {
  Save as SaveIcon,
  AutoMode as AutoSaveIcon,
  PushPin as PinIcon,
  PushPinOutlined as PinOutlinedIcon,
  Category as CategoryIcon,
  Tag as TagIcon,
  Edit as EditIcon,
  Visibility as PreviewIcon,
  ViewColumn as SplitViewIcon
} from '@mui/icons-material'
import { useStore } from '../store/useStore'
import { useStandaloneContext } from './StandaloneProvider'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale/zh-CN'
import { parseTags, formatTags } from '../utils/tagUtils'
import { DEFAULT_SHORTCUTS } from '../utils/shortcutUtils'
import shortcutManager from '../utils/ShortcutManager'
import TagInput from './TagInput'
import MarkdownPreview from './MarkdownPreview'
import MarkdownToolbar from './MarkdownToolbar'
import { imageAPI } from '../api/imageAPI'

const NoteEditor = () => {
  // 检测是否在独立窗口模式下运行
  let standaloneContext = null
  try {
    standaloneContext = useStandaloneContext()
  } catch (error) {
    // 不在独立窗口模式下，使用主应用store
  }
  
  // 根据运行环境选择状态管理
  const mainStore = useStore()
  const store = standaloneContext || mainStore
  
  const {
    selectedNoteId,
    notes,
    updateNote,
    togglePinNote,
    autoSaveNote
  } = store

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [viewMode, setViewMode] = useState('edit') // 'edit', 'preview', 'split'
  const [isDragging, setIsDragging] = useState(false)
  const autoSaveTimerRef = useRef(null)
  const contentRef = useRef(null)
  const titleRef = useRef(null)

  const currentNote = notes.find(note => note.id === selectedNoteId)

  // 加载笔记数据
  useEffect(() => {
    if (currentNote) {
      setTitle(currentNote.title || '')
      setContent(currentNote.content || '')
      setCategory(currentNote.category || '')
      setTags(currentNote.tags ? currentNote.tags.join(', ') : '')
      setLastSaved(currentNote.updated_at)
      setHasUnsavedChanges(false)
      
      // 如果是新创建的笔记（标题为"新笔记"且内容为空），自动聚焦到标题输入框
      if (currentNote.title === '新笔记' && !currentNote.content) {
        console.log('检测到新笔记，准备自动聚焦')
        setTimeout(() => {
          if (titleRef.current) {
            console.log('开始聚焦到标题输入框')
            const inputElement = titleRef.current.querySelector('input')
            if (inputElement) {
              inputElement.focus()
              inputElement.select() // 选中标题文本，方便用户直接输入新标题
            }
          } else {
            console.log('titleRef.current 不存在')
          }
        }, 300) // 增加延迟时间确保DOM完全渲染
      }
    } else {
      setTitle('')
      setContent('')
      setCategory('')
      setTags('')
      setLastSaved(null)
      setHasUnsavedChanges(false)
    }
  }, [currentNote])

  // 初始化快捷键管理器和注册监听器
  useEffect(() => {
    const initializeShortcuts = async () => {
      console.log('初始化快捷键管理器...')
      await shortcutManager.initialize()
      
      // 只注册保存快捷键，其他快捷键使用编辑器原生实现
      const handlers = {
        save: handleManualSave
      }
      
      shortcutManager.registerListener(document, handlers)
      console.log('编辑器快捷键监听器已注册')
    }

    initializeShortcuts()
    
    // 清理函数
    return () => {
      shortcutManager.unregisterListener(document)
    }
  }, [])

  // 自动保存逻辑
  useEffect(() => {
    if (hasUnsavedChanges && selectedNoteId) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }

      autoSaveTimerRef.current = setTimeout(async () => {
        setIsAutoSaving(true)
        try {
          // 自动保存所有字段，不仅仅是内容
          const tagsArray = parseTags(tags)
          await updateNote(selectedNoteId, {
            title: title.trim() || '无标题',
            content,
            category: category.trim(),
            tags: formatTags(tagsArray)
          })
          setLastSaved(new Date().toISOString())
          setHasUnsavedChanges(false)
        } catch (error) {
          console.error('自动保存失败:', error)
        } finally {
          setIsAutoSaving(false)
        }
      }, 2000) // 2秒后自动保存
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [hasUnsavedChanges, selectedNoteId, title, content, category, tags]) // 添加所有字段作为依赖

  const handleTitleChange = (e) => {
    setTitle(e.target.value)
    setHasUnsavedChanges(true)
  }

  const handleContentChange = (e) => {
    setContent(e.target.value)
    setHasUnsavedChanges(true)
  }

  const handleCategoryChange = (e) => {
    setCategory(e.target.value)
    setHasUnsavedChanges(true)
  }



  const handleManualSave = async () => {
    if (!selectedNoteId) return

    try {
      const tagsArray = parseTags(tags)
      await updateNote(selectedNoteId, {
        title: title.trim() || '无标题',
        content,
        category: category.trim(),
        tags: formatTags(tagsArray)
      })
      setLastSaved(new Date().toISOString())
      setHasUnsavedChanges(false)
      setShowSaveSuccess(true)
    } catch (error) {
      console.error('保存失败:', error)
    }
  }

  const handleTogglePin = async () => {
    if (selectedNoteId) {
      await togglePinNote(selectedNoteId)
    }
  }

  // 处理Markdown工具栏插入文本
  const handleMarkdownInsert = (before, after = '', placeholder = '') => {
    if (!contentRef.current) return
    
    const textarea = contentRef.current.querySelector('textarea')
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.substring(start, end)
    const textToInsert = selectedText || placeholder
    
    const newContent = 
      content.substring(0, start) + 
      before + textToInsert + after + 
      content.substring(end)
    
    setContent(newContent)
    setHasUnsavedChanges(true)
    
    // 设置新的光标位置
    setTimeout(() => {
      const newCursorPos = start + before.length + textToInsert.length
      textarea.focus()
      textarea.setSelectionRange(newCursorPos, newCursorPos + (selectedText ? 0 : after.length))
    }, 0)
  }

  const formatLastSaved = (dateString) => {
    if (!dateString) return ''
    try {
      // 尝试多种时间格式解析
      let date
      if (dateString.includes('T') || dateString.includes('Z')) {
        // ISO格式时间
        date = new Date(dateString)
      } else {
        // SQLite的CURRENT_TIMESTAMP格式，假设为UTC时间
        date = new Date(dateString + 'Z')
      }
      
      // 检查日期是否有效
      if (isNaN(date.getTime())) {
        // 如果解析失败，尝试直接解析
        date = new Date(dateString)
      }
      
      return formatDistanceToNow(date, {
        addSuffix: true,
        locale: zhCN
      })
    } catch {
      return ''
    }
  }


  
  // 处理键盘事件
  const handleKeyDown = (e) => {
    // 处理Tab键缩进
    if (e.key === 'Tab') {
      e.preventDefault()
      
      const start = e.target.selectionStart
      const end = e.target.selectionEnd
      const newContent = content.substring(0, start) + '  ' + content.substring(end)
      setContent(newContent)
      setHasUnsavedChanges(true)
      
      // 设置光标位置
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2
      }, 0)
      return
    }
    
    // 处理Ctrl+B (粗体)
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault()
      handleMarkdownInsert('**', '**', '粗体文本')
      return
    }
    
    // 处理Ctrl+I (斜体)
    if (e.ctrlKey && e.key === 'i') {
      e.preventDefault()
      handleMarkdownInsert('*', '*', '斜体文本')
      return
    }
    
    // 处理Ctrl+Z (撤销) - 使用浏览器原生撤销功能
    if (e.ctrlKey && e.key === 'z') {
      // 不阻止默认行为，让浏览器处理撤销
      return
    }
  }

  // 处理图片粘贴
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault()
        try {
          const blob = item.getAsFile()
          if (blob) {
            const arrayBuffer = await blob.arrayBuffer()
            const buffer = new Uint8Array(arrayBuffer)
            const fileName = `clipboard_${Date.now()}.png`
            const imagePath = await imageAPI.saveFromBuffer(buffer, fileName)
            
            // 插入图片到光标位置
            const textarea = contentRef.current?.querySelector('textarea')
            if (textarea) {
              const start = textarea.selectionStart
              const end = textarea.selectionEnd
              const imageMarkdown = `![${fileName}](${imagePath})`
              const newContent = content.substring(0, start) + imageMarkdown + content.substring(end)
              setContent(newContent)
              setHasUnsavedChanges(true)
              
              // 设置光标位置到图片markdown之后
              setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = start + imageMarkdown.length
                textarea.focus()
              }, 0)
            }
          }
        } catch (error) {
          console.error('粘贴图片失败:', error)
        }
        break
      }
    }
  }

  // 处理拖拽进入
  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  // 处理拖拽离开
  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    // 只有当离开编辑器容器时才设置为false
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false)
    }
  }

  // 处理拖拽悬停
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  // 处理文件拖拽放置
  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    const imageFiles = files.filter(file => file.type.startsWith('image/'))

    if (imageFiles.length === 0) return

    try {
      for (const file of imageFiles) {
        const arrayBuffer = await file.arrayBuffer()
        const buffer = new Uint8Array(arrayBuffer)
        const imagePath = await imageAPI.saveFromBuffer(buffer, file.name)
        
        // 插入图片到内容末尾
        const imageMarkdown = `![${file.name}](${imagePath})\n`
        setContent(prev => prev + imageMarkdown)
        setHasUnsavedChanges(true)
      }
    } catch (error) {
      console.error('拖拽图片失败:', error)
    }
  }

  if (!selectedNoteId) {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.secondary',
          overflow: 'hidden'
        }}
      >
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            选择一个笔记开始编辑
          </Typography>
          <Typography variant="body2">
            从左侧列表中选择笔记，或创建一个新笔记
          </Typography>
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 工具栏 */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 2
        }}
      >
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          {isAutoSaving ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AutoSaveIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                正在自动保存...
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {hasUnsavedChanges ? (
                '有未保存的更改'
              ) : lastSaved ? (
                `上次保存: ${formatLastSaved(lastSaved)}`
              ) : (
                '新笔记'
              )}
            </Typography>
          )}
        </Box>

        {/* 视图模式切换 */}
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(event, newMode) => {
            if (newMode !== null) {
              setViewMode(newMode)
            }
          }}
          size="small"
        >
          <ToggleButton value="edit">
            <Tooltip title="编辑模式">
              <EditIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="preview">
            <Tooltip title="预览模式">
              <PreviewIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="split">
            <Tooltip title="分屏模式">
              <SplitViewIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
        
        <Tooltip title={currentNote?.is_pinned ? '取消置顶' : '置顶笔记'}>
          <IconButton onClick={handleTogglePin} size="small">
            {currentNote?.is_pinned ? (
              <PinIcon color="primary" />
            ) : (
              <PinOutlinedIcon />
            )}
          </IconButton>
        </Tooltip>
        
        <Tooltip title="保存 (Ctrl+S)">
          <IconButton 
            onClick={handleManualSave} 
            size="small"
            disabled={!hasUnsavedChanges}
          >
            <SaveIcon />
          </IconButton>
        </Tooltip>
      </Paper>

      {/* 编辑区域 */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: viewMode === 'split' ? 'row' : 'column', overflow: 'hidden', minHeight: 0, height: 'calc(100% - 80px)' }}>
        {/* 编辑面板 */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <Box 
            sx={{ 
              flex: viewMode === 'split' ? 1 : 'auto',
              p: 2, 
              overflow: 'auto',
              borderRight: viewMode === 'split' ? 1 : 0,
              borderColor: 'divider',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              // 拖拽样式
              ...(isDragging && {
                backgroundColor: 'action.hover',
                '&::after': {
                  content: '"拖拽图片到这里"',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(25, 118, 210, 0.1)',
                  color: 'primary.main',
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  zIndex: 1000,
                  border: '2px dashed',
                  borderColor: 'primary.main',
                  borderRadius: 1
                }
              })
            }}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onPaste={handlePaste}
          >
            {/* 标题输入 */}
            <TextField
              ref={titleRef}
              fullWidth
              variant="standard"
              placeholder="笔记标题..."
              value={title}
              onChange={handleTitleChange}
              onKeyDown={handleKeyDown}
              sx={{
                mb: 2,
                '& .MuiInput-input': {
                  fontSize: '1.5rem',
                  fontWeight: 500
                }
              }}
              InputProps={{
                disableUnderline: true
              }}
            />

            {/* 分类和标签 */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                size="small"
                placeholder="分类"
                value={category}
                onChange={handleCategoryChange}
                onKeyDown={handleKeyDown}
                InputProps={{
                  startAdornment: <CategoryIcon sx={{ mr: 1, color: 'action.active' }} />
                }}
                sx={{ minWidth: 150 }}
              />
              <TagInput
                    value={tags}
                    onChange={(newTags) => {
                      setTags(newTags);
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="标签 (用逗号分隔)"
                    maxTags={10}
                    showSuggestions={true}
                    inline={true}
                    sx={{ flex: 1 }}
                  />
            </Box>

            <Divider sx={{ mb: 2 }} />

             {/* Markdown工具栏 */}
             <MarkdownToolbar 
               onInsert={handleMarkdownInsert}
               disabled={!selectedNoteId}
             />

             {/* 内容编辑器 */}
            <TextField
              ref={contentRef}
              fullWidth
              multiline
              variant="standard"
              placeholder="开始写笔记... (支持Markdown语法)"
              value={content}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              InputProps={{
                disableUnderline: true
              }}
              sx={{
                flex: 1,
                '& .MuiInput-root': {
                  height: '100%'
                },
                '& .MuiInput-input': {
                  fontSize: '1rem',
                  lineHeight: 1.6,
                  fontFamily: 'monospace',
                  height: '100% !important',
                  overflow: 'auto !important'
                }
              }}
            />
          </Box>
        )}

        {/* 预览面板 */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <Box sx={{ 
            flex: viewMode === 'split' ? 1 : 'auto',
            height: viewMode === 'preview' ? '100%' : 'auto',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0
          }}>
            {viewMode === 'preview' && (
              <Box sx={{ 
                p: 2, 
                borderBottom: 1, 
                borderColor: 'divider',
                userSelect: 'text', // 允许标题和标签文字选择
                WebkitUserSelect: 'text',
                MozUserSelect: 'text',
                msUserSelect: 'text'
              }}>
                <Typography variant="h5" sx={{ fontWeight: 500, mb: 1 }}>
                  {title || '无标题'}
                </Typography>
                {(category || tags) && (
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                    {category && (
                      <Chip
                        icon={<CategoryIcon />}
                        label={category}
                        size="small"
                        variant="outlined"
                      />
                    )}
                    {tags && parseTags(tags).map((tag, index) => (
                      <Chip
                        key={index}
                        label={tag}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    ))}
                  </Box>
                )}
              </Box>
            )}
            <MarkdownPreview 
              content={content} 
              sx={{ 
                flex: 1,
                overflow: 'auto',
                minHeight: 0,
                maxWidth: '100%',
                width: '100%',
                boxSizing: 'border-box'
              }} 
            />
          </Box>
        )}
      </Box>

      {/* 保存成功提示 */}
      <Snackbar
        open={showSaveSuccess}
        autoHideDuration={2000}
        onClose={() => setShowSaveSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" onClose={() => setShowSaveSuccess(false)}>
          笔记已保存
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default NoteEditor