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
  ToggleButtonGroup,
  Icon,
  InputAdornment
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
  ViewColumn as SplitViewIcon,
  Article as ArticleIcon,
  Brush as WhiteboardIcon,
  OpenInNew as OpenInNewIcon,
  Code as CodeIcon,
  GetApp as GetAppIcon
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
import WhiteboardEditor from './WhiteboardEditor'
import NoteTypeConversionDialog from './NoteTypeConversionDialog'
import WYSIWYGEditor from './WYSIWYGEditor'
import { useDebouncedSave } from '../hooks/useDebouncedSave'
import { imageAPI } from '../api/imageAPI'
import { convertMarkdownToWhiteboard } from '../utils/markdownToWhiteboardConverter'
import { useTranslation } from '../utils/i18n'

const NoteEditor = () => {
  // 检测是否在独立窗口模式下运行
  let standaloneContext = null
  let isStandaloneMode = false
  try {
    standaloneContext = useStandaloneContext()
    isStandaloneMode = true
  } catch (error) {
    // 不在独立窗口模式下，使用主应用store
    isStandaloneMode = false
  }

  // 根据运行环境选择状态管理
  const mainStore = useStore()
  const store = standaloneContext || mainStore

  const { t } = useTranslation()

  const {
    selectedNoteId,
    notes,
    updateNote,
    togglePinNote,
    autoSaveNote,
    editorMode
  } = store

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [noteType, setNoteType] = useState('markdown') // 'markdown' or 'whiteboard'
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [viewMode, setViewMode] = useState('edit') // 'edit', 'preview', 'split'
  const [isDragging, setIsDragging] = useState(false)
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false)
  const [pendingNoteType, setPendingNoteType] = useState(null)
  const [whiteboardSaveFunc, setWhiteboardSaveFunc] = useState(null)
  const [whiteboardExportFunc, setWhiteboardExportFunc] = useState(null)
  const [showToolbar, setShowToolbar] = useState(!isStandaloneMode) // 独立窗口默认隐藏工具栏
  const [wikiLinkError, setWikiLinkError] = useState('') // wiki 链接错误提示
  const [isOpenInStandaloneWindow, setIsOpenInStandaloneWindow] = useState(false) // 是否在独立窗口中打开
  const contentRef = useRef(null)
  const titleRef = useRef(null)
  const toolbarTimeoutRef = useRef(null)
  const wysiwygEditorRef = useRef(null)

  const currentNote = notes.find(note => note.id === selectedNoteId)
  const prevNoteIdRef = useRef(null)
  const prevStateRef = useRef({ title: '', content: '', category: '', tags: '', noteType: 'markdown' })
  const hasUnsavedChangesRef = useRef(false)

  // 保存函数（稳定引用）
  const performSave = async () => {
    if (!selectedNoteId) return

    setIsAutoSaving(true)
    try {
      const tagsArray = parseTags(prevStateRef.current.tags)
      await updateNote(selectedNoteId, {
        title: prevStateRef.current.title.trim() || '无标题',
        content: prevStateRef.current.content,
        category: prevStateRef.current.category.trim(),
        tags: formatTags(tagsArray),
        note_type: prevStateRef.current.noteType
      })
      setLastSaved(new Date().toISOString())
      setHasUnsavedChanges(false)
      hasUnsavedChangesRef.current = false
      console.log('自动保存成功')
    } catch (error) {
      console.error('自动保存失败:', error)
    } finally {
      setIsAutoSaving(false)
    }
  }

  // 使用防抖保存 Hook
  const { debouncedSave, saveNow, cancelSave } = useDebouncedSave(performSave, 2000)

  // 同步 hasUnsavedChanges 到 ref
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges])

  // 第一步：在切换笔记前保存旧笔记
  useEffect(() => {
    // 只在 selectedNoteId 真正变化时才执行
    if (prevNoteIdRef.current !== null && prevNoteIdRef.current !== selectedNoteId) {
      // 检查是否有未保存的更改
      if (hasUnsavedChangesRef.current) {
        // 立即保存旧笔记，使用 prevStateRef 中保存的状态
        const oldNoteId = prevNoteIdRef.current
        const stateToSave = {
          title: prevStateRef.current.title.trim() || '无标题',
          content: prevStateRef.current.content,
          category: prevStateRef.current.category.trim(),
          tags: formatTags(parseTags(prevStateRef.current.tags)),
          note_type: prevStateRef.current.noteType
        }

        // 先取消当前的防抖保存
        cancelSave()

        // 立即保存
        updateNote(oldNoteId, stateToSave).then(() => {
          console.log('切换笔记前已自动保存')
        }).catch(error => {
          console.error('切换笔记时保存失败:', error)
        })
      }
    }

    // 更新 prevNoteIdRef
    prevNoteIdRef.current = selectedNoteId
  }, [selectedNoteId, updateNote, cancelSave])  // 检查笔记是否在独立窗口中打开（仅主窗口）
  useEffect(() => {
    if (isStandaloneMode || !selectedNoteId) {
      setIsOpenInStandaloneWindow(false)
      return
    }

    const checkWindowStatus = async () => {
      try {
        const result = await window.electronAPI?.isNoteOpenInWindow?.(selectedNoteId)
        if (result?.success) {
          setIsOpenInStandaloneWindow(result.isOpen)
        }
      } catch (error) {
        console.error('检查独立窗口状态失败:', error)
      }
    }

    checkWindowStatus()
    // 定期检查状态（每2秒）
    const interval = setInterval(checkWindowStatus, 2000)
    return () => clearInterval(interval)
  }, [selectedNoteId, isStandaloneMode])

  // 第二步：加载新笔记的数据
  useEffect(() => {
    if (currentNote) {
      const newTitle = currentNote.title || ''
      const newContent = currentNote.content || ''
      const newCategory = currentNote.category || ''
      // 处理 tags：可能是数组或逗号分隔的字符串
      const newTags = Array.isArray(currentNote.tags) 
        ? currentNote.tags.join(', ') 
        : (currentNote.tags || '')
      const newNoteType = currentNote.note_type || 'markdown'

      setTitle(newTitle)
      setContent(newContent)
      setCategory(newCategory)
      setTags(newTags)
      setNoteType(newNoteType)
      setLastSaved(currentNote.updated_at)
      setHasUnsavedChanges(false)

      // 保存新笔记的状态到 ref
      prevStateRef.current = {
        title: newTitle,
        content: newContent,
        category: newCategory,
        tags: newTags,
        noteType: newNoteType
      }

      // 如果是新创建的笔记（标题为"新笔记"且内容为空），自动聚焦到标题输入框
      if (currentNote.title === '新笔记' && !currentNote.content) {
        setTimeout(() => {
          if (titleRef.current) {
            const inputElement = titleRef.current.querySelector('input')
            if (inputElement) {
              inputElement.focus()
              inputElement.select()
            }
          }
        }, 100)
      }
    } else {
      setTitle('')
      setContent('')
      setCategory('')
      setTags('')
      setLastSaved(null)
      setHasUnsavedChanges(false)
      prevStateRef.current = { title: '', content: '', category: '', tags: '' }
    }
  }, [selectedNoteId, currentNote])

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

    // 清理函数：组件卸载时保存未保存的内容
    return () => {
      shortcutManager.unregisterListener(document)

      // 组件卸载时立即保存
      if (hasUnsavedChangesRef.current && selectedNoteId) {
        const tagsArray = parseTags(prevStateRef.current.tags)
        updateNote(selectedNoteId, {
          title: prevStateRef.current.title.trim() || '无标题',
          content: prevStateRef.current.content,
          category: prevStateRef.current.category.trim(),
          tags: formatTags(tagsArray)
        }).catch(error => {
          console.error('组件卸载时保存失败:', error)
        })
      }
    }
  }, [])

  // 清理定时器（独立窗口模式）
  useEffect(() => {
    return () => {
      if (toolbarTimeoutRef.current) {
        clearTimeout(toolbarTimeoutRef.current)
      }
    }
  }, [])

  // 独立窗口模式：监听窗口关闭事件，触发保存
  useEffect(() => {
    if (!isStandaloneMode) return

    const handleStandaloneSave = async () => {
      console.log('独立窗口保存事件触发', { noteType: prevStateRef.current.noteType })

      // 对于白板类型，触发全局保存事件由WhiteboardEditor处理
      if (prevStateRef.current.noteType === 'whiteboard') {
        console.log('白板类型，触发白板保存事件')
        const whiteboardSaveEvent = new CustomEvent('whiteboard-save')
        window.dispatchEvent(whiteboardSaveEvent)
        // 等待白板保存完成
        await new Promise(resolve => setTimeout(resolve, 500))
        return
      }

      // Markdown类型的保存逻辑
      if (hasUnsavedChangesRef.current && selectedNoteId) {
        try {
          const tagsArray = parseTags(prevStateRef.current.tags)
          await updateNote(selectedNoteId, {
            title: prevStateRef.current.title.trim() || '无标题',
            content: prevStateRef.current.content,
            category: prevStateRef.current.category.trim(),
            tags: formatTags(tagsArray),
            note_type: prevStateRef.current.noteType
          })
          console.log('独立窗口关闭前Markdown保存成功')
        } catch (error) {
          console.error('独立窗口关闭前保存失败:', error)
        }
      }
    }

    // 监听自定义保存事件
    window.addEventListener('standalone-window-save', handleStandaloneSave)

    return () => {
      window.removeEventListener('standalone-window-save', handleStandaloneSave)
    }
  }, [isStandaloneMode, selectedNoteId, updateNote])

  const handleTitleChange = (e) => {
    const newValue = e.target.value
    setTitle(newValue)
    setHasUnsavedChanges(true)
    // 同时更新 ref，避免额外的 useEffect
    prevStateRef.current.title = newValue
    // 触发防抖保存
    debouncedSave()
  }

  const handleContentChange = (e) => {
    const newValue = e.target.value
    setContent(newValue)
    setHasUnsavedChanges(true)
    // 同时更新 ref，避免额外的 useEffect
    prevStateRef.current.content = newValue
    // 触发防抖保存
    debouncedSave()
  }



  const handleCategoryChange = (e) => {
    const newValue = e.target.value
    setCategory(newValue)
    setHasUnsavedChanges(true)
    // 同时更新 ref，避免额外的 useEffect
    prevStateRef.current.category = newValue
    // 触发防抖保存
    debouncedSave()
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

  // 处理 wiki 链接点击
  const handleWikiLinkClick = (wikiTarget, wikiSection) => {
    // 根据笔记标题查找所有匹配的笔记
    const matchingNotes = notes.filter(note =>
      note.title && note.title.toLowerCase() === wikiTarget.toLowerCase()
    )

    if (matchingNotes.length === 0) {
      console.warn(`Wiki link target not found: ${wikiTarget}`)
      setWikiLinkError(t('common.wikiLinkNotFound', { noteTitle: wikiTarget }))
      return
    }

    let targetNote

    if (matchingNotes.length === 1) {
      // 只有一个匹配的笔记，直接使用
      targetNote = matchingNotes[0]
    } else {
      // 多个相同标题的笔记，优先选择最近修改的
      targetNote = matchingNotes.reduce((latest, current) => {
        const latestTime = new Date(latest.updated_at || latest.created_at || 0)
        const currentTime = new Date(current.updated_at || current.created_at || 0)
        return currentTime > latestTime ? current : latest
      })

      console.info(`Multiple notes found with title "${wikiTarget}", navigating to the most recently updated one (ID: ${targetNote.id})`)
    }

    // 设置选中的笔记 ID 来导航到该笔记
    store.setSelectedNoteId(targetNote.id)
  }

  // 处理标签点击
  const handleTagClick = (tag) => {
    // 设置搜索查询来过滤显示该标签的笔记
    store.setSearchQuery(`tag:${tag}`)
  }

  // 处理在独立窗口打开
  const handleOpenStandalone = async () => {
    if (!selectedNoteId) return

    try {
      await window.electronAPI.createNoteWindow(selectedNoteId)
    } catch (error) {
      console.error('打开独立窗口失败:', error)
    }
  }

  // 处理笔记类型切换
  const handleNoteTypeChange = (event, newType) => {
    if (newType === null) return

    // 如果切换到相同类型，不做任何操作
    if (newType === noteType) return

    // 记录用户想要切换到的类型
    setPendingNoteType(newType)

    // 显示转换确认对话框
    setConversionDialogOpen(true)
  }

  // 处理转换确认
  const handleConversionConfirm = async (confirmed) => {
    setConversionDialogOpen(false)

    if (!confirmed || !pendingNoteType) {
      // 用户取消，重置
      setPendingNoteType(null)
      return
    }

    try {
      if (noteType === 'markdown' && pendingNoteType === 'whiteboard') {
        // Markdown → 白板转换
        await convertMarkdownToWhiteboardNote()
      } else if (noteType === 'whiteboard' && pendingNoteType === 'markdown') {
        // 白板 → Markdown 转换（清空内容）
        await convertWhiteboardToMarkdownNote()
      }
    } catch (error) {
      console.error('笔记类型转换失败:', error)
      // 显示错误提示
      setShowSaveSuccess(false)
    } finally {
      setPendingNoteType(null)
    }
  }

  // Markdown 转白板
  const convertMarkdownToWhiteboardNote = async () => {
    if (!selectedNoteId) return

    try {
      // 转换 Markdown 内容为白板数据
      const whiteboardContent = convertMarkdownToWhiteboard(content)

      // 更新笔记
      await updateNote(selectedNoteId, {
        content: whiteboardContent,
        note_type: 'whiteboard',
        title: title.trim() || '无标题',
        category: category.trim(),
        tags: formatTags(parseTags(tags))
      })

      // 更新本地状态
      setNoteType('whiteboard')
      setContent('') // 清空 Markdown content 状态（白板数据存储在 note.content 中）
      prevStateRef.current.noteType = 'whiteboard'
      prevStateRef.current.content = ''
      setHasUnsavedChanges(false)
      hasUnsavedChangesRef.current = false

      console.log('Markdown 转白板成功')
    } catch (error) {
      console.error('Markdown 转白板失败:', error)
      throw error
    }
  }

  // 白板转 Markdown
  const convertWhiteboardToMarkdownNote = async () => {
    if (!selectedNoteId) return

    try {
      // 清空内容，切换类型
      await updateNote(selectedNoteId, {
        content: '',
        note_type: 'markdown',
        title: title.trim() || '无标题',
        category: category.trim(),
        tags: formatTags(parseTags(tags))
      })

      // 更新本地状态
      setNoteType('markdown')
      setContent('')
      prevStateRef.current.noteType = 'markdown'
      prevStateRef.current.content = ''
      setHasUnsavedChanges(false)
      hasUnsavedChangesRef.current = false

      console.log('白板转 Markdown 成功')
    } catch (error) {
      console.error('白板转 Markdown 失败:', error)
      throw error
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
    prevStateRef.current.content = newContent
    // 触发防抖保存
    debouncedSave()

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
    // 只在Markdown模式下处理特殊键盘事件
    if (editorMode === 'markdown') {
      // 处理Tab键缩进
      if (e.key === 'Tab') {
        e.preventDefault()

        const start = e.target.selectionStart
        const end = e.target.selectionEnd

        const newContent = content.substring(0, start) + '  ' + content.substring(end)
        setContent(newContent)
        setHasUnsavedChanges(true)
        prevStateRef.current.content = newContent
        // 触发防抖保存
        debouncedSave()

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
    }

    // 撤销/重做使用浏览器原生功能
    // 不需要阻止默认行为
  }  // 处理图片粘贴
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
            {t('common.selectNoteToEdit')}
          </Typography>
          <Typography variant="body2">
            {t('common.selectOrCreateNote')}
          </Typography>
        </Box>
      </Box>
    )
  }

  // 处理鼠标移动事件（独立窗口模式）
  const handleMouseMove = (e) => {
    if (!isStandaloneMode) return

    const triggerAreaHeight = 50 // 触发展开的区域（最顶端50px）
    const toolbarTotalHeight = 160 // TitleBar(28px) + 工具栏(48px) + 标题栏(48px) = 124px

    // 鼠标在整个工具栏区域内（包括触发区域）
    if (e.clientY < toolbarTotalHeight) {
      // 在触发区域或工具栏已展开
      if (e.clientY < triggerAreaHeight || showToolbar) {
        setShowToolbar(true)
        // 清除隐藏定时器
        if (toolbarTimeoutRef.current) {
          clearTimeout(toolbarTimeoutRef.current)
          toolbarTimeoutRef.current = null
        }
      }
    } else if (showToolbar) {
      // 鼠标离开了工具栏区域，设置延迟隐藏
      if (!toolbarTimeoutRef.current) {
        toolbarTimeoutRef.current = setTimeout(() => {
          setShowToolbar(false)
          toolbarTimeoutRef.current = null
        }, 500) // 500ms延迟
      }
    }
  }

  // 处理鼠标离开编辑器区域
  const handleMouseLeave = (e) => {
    if (!isStandaloneMode) return

    // 不立即隐藏，给一个延迟让handleMouseMove有机会处理
    // 如果鼠标真的离开了整个窗口，这个延迟后会隐藏
    if (toolbarTimeoutRef.current) {
      clearTimeout(toolbarTimeoutRef.current)
    }

    toolbarTimeoutRef.current = setTimeout(() => {
      setShowToolbar(false)
      toolbarTimeoutRef.current = null
    }, 500)
  }

  return (
    <Box
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* 工具栏 - 调整高度 */}
      <Paper
        elevation={0}
        sx={{
          p: 1,
          height: '48px',
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          overflow: 'hidden',
          backgroundColor: (theme) => theme.palette.mode === 'dark'
            ? 'rgba(30, 41, 59, 0.6)'
            : 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(30px) saturate(180%)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          // 独立窗口模式下的特殊样式
          ...(isStandaloneMode && {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            opacity: showToolbar ? 1 : 0,
            transform: showToolbar ? 'translateY(0)' : 'translateY(-100%)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            pointerEvents: showToolbar ? 'auto' : 'none',
            boxShadow: showToolbar ? 2 : 0
          })
        }}
      >
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          {isAutoSaving ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AutoSaveIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {t('common.autoSaving')}
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {hasUnsavedChanges ? (
                t('common.unsavedChanges')
              ) : lastSaved ? (
                t('common.lastSaved', { time: formatLastSaved(lastSaved) })
              ) : (
                t('common.newNote')
              )}
            </Typography>
          )}
        </Box>

        {/* 笔记类型切换 - 移到工具栏 */}
        <ToggleButtonGroup
          value={noteType}
          exclusive
          onChange={handleNoteTypeChange}
          size="small"
        >
          <ToggleButton value="markdown">
            <ArticleIcon fontSize="small" sx={{ mr: 0.5 }} />
            Markdown
          </ToggleButton>
          <ToggleButton value="whiteboard">
            <WhiteboardIcon fontSize="small" sx={{ mr: 0.5 }} />
            白板
          </ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title={t('notes.openInNewWindow')}>
          <IconButton onClick={handleOpenStandalone} size="small">
            <OpenInNewIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={currentNote?.is_pinned ? t('notes.unpinNote') : t('notes.pinNote')}>
          <IconButton onClick={handleTogglePin} size="small">
            {currentNote?.is_pinned ? (
              <PinIcon color="primary" />
            ) : (
              <PinOutlinedIcon />
            )}
          </IconButton>
        </Tooltip>

        {/* Markdown 模式：保存按钮 */}
        {noteType === 'markdown' && (
          <Tooltip title={t('common.saveTooltip')}>
            <IconButton
              onClick={handleManualSave}
              size="small"
              disabled={!hasUnsavedChanges}
            >
              <SaveIcon />
            </IconButton>
          </Tooltip>
        )}

        {/* 白板模式：保存白板和导出PNG */}
        {noteType === 'whiteboard' && (
          <>
            <Tooltip title={t('common.saveWhiteboardTooltip')}>
              <IconButton
                onClick={() => whiteboardSaveFunc?.()}
                size="small"
              >
                <SaveIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title={t('common.exportPngTooltip')}>
              <IconButton
                onClick={() => whiteboardExportFunc?.()}
                size="small"
              >
                <GetAppIcon />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Paper>

      {/* 标签和标题栏 - 调整高度 */}
      <Box
        sx={{
          p: 1,
          height: '48px',
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'nowrap',
          overflow: 'hidden',
          backgroundColor: (theme) => theme.palette.mode === 'dark'
            ? 'rgba(30, 41, 59, 0.6)'
            : 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(30px) saturate(180%)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          // 独立窗口模式下的特殊样式
          ...(isStandaloneMode && {
            position: 'absolute',
            top: 48,
            left: 0,
            right: 0,
            zIndex: 999,
            opacity: showToolbar ? 1 : 0,
            transform: showToolbar ? 'translateY(0)' : 'translateY(-100%)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            pointerEvents: showToolbar ? 'auto' : 'none',
            boxShadow: showToolbar ? 1 : 0
          })
        }}
      >
        {/* 标题输入 - 紧凑样式 */}
        <TextField
          ref={titleRef}
          fullWidth
          variant="standard"
          placeholder={t('common.noteTitlePlaceholder')}
          value={title}
          onChange={handleTitleChange}
          onKeyDown={handleKeyDown}
          sx={{
            flex: 1,  // 减小标题宽度占比
            '& .MuiInput-input': {
              fontSize: '1.1rem',  // 减小字体大小
              fontWeight: 500,
              padding: '2px 0',    // 减小内边距
              maxWidth: '100%'     // 确保不超过容器宽度
            }
          }}
          InputProps={{
            disableUnderline: true
          }}
        />

        {/* 分类和标签 - 紧凑布局 */}
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
          <TextField
            size="small"
            placeholder={t('common.categoryPlaceholder')}
            value={category}
            onChange={handleCategoryChange}
            onKeyDown={handleKeyDown}
            InputProps={{
              startAdornment: <InputAdornment position="start">
                <CategoryIcon sx={{ mr: 0.5, color: 'action.active', fontSize: '14px' }} />
              </InputAdornment>
            }}
            sx={{
              minWidth: 100,
              maxWidth: '45%',  // 限制分类宽度
              mr: 0.5,
              '& .MuiInputBase-input': {
                fontSize: '0.85rem'  // 减小字体大小
              }
            }}
          />
          <Box sx={{ flex: 1, maxWidth: '55%' }}>
            <TagInput
              value={tags}
              onChange={(newTags) => {
                setTags(newTags);
                setHasUnsavedChanges(true);
                prevStateRef.current.tags = newTags;
                debouncedSave();
              }}
              placeholder={t('common.tagsPlaceholder')}
              maxTags={5}
              showSuggestions={true}
              inline={true}
              noteContent={content}
              noteId={selectedNoteId}
              size="small"
              sx={{
                width: '100%',
                // 确保标签输入框和分类输入框高度一致
                '& .MuiInputBase-root': {
                  height: '100%',
                  fontSize: '0.85rem'
                },
                '& .MuiInputBase-input': {
                  fontSize: '0.85rem'
                }
              }}
            />
          </Box>
        </Box>
      </Box>

      {/* 编辑区域 */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {/* 独立窗口打开提示 */}
        {isOpenInStandaloneWindow && !isStandaloneMode && (
          <Alert severity="info" sx={{ m: 2, mb: 0 }}>
            {t('common.noteOpenInStandalone')}
          </Alert>
        )}
        {/* Markdown 编辑器 */}
        {noteType === 'markdown' && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <Box
              sx={{
                // 独立窗口模式下的特殊样式
                ...(isStandaloneMode && {
                  position: 'absolute',
                  top: 96,  // 工具栏(48px) + 标题栏(48px)
                  left: 0,
                  right: 0,
                  zIndex: 998,
                  opacity: showToolbar ? 1 : 0,
                  transform: showToolbar ? 'translateY(0)' : 'translateY(-100%)',
                  transition: 'opacity 0.3s ease, transform 0.3s ease',
                  pointerEvents: showToolbar ? 'auto' : 'none'
                })
              }}
            >
              <MarkdownToolbar
                onInsert={handleMarkdownInsert}
                disabled={!selectedNoteId || viewMode === 'preview'}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                editor={wysiwygEditorRef.current?.getEditor?.()}
                editorMode={editorMode}
              />
            </Box>
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: viewMode === 'split' ? 'row' : 'column',
                overflow: 'hidden',
                minHeight: 0
              }}
            >
              {/* 编辑面板 */}
              {(viewMode === 'edit' || viewMode === 'split') && (
                <Box
                  sx={{
                    flex: viewMode === 'split' ? 1 : 'auto',
                    p: 0,
                    overflow: 'auto',
                    borderRight: viewMode === 'split' ? 1 : 0,
                    borderColor: 'divider',
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    // 拖拽样式
                    ...(isDragging && editorMode === 'markdown' && {
                      backgroundColor: 'action.hover'
                    })
                  }}
                  onDragEnter={editorMode === 'markdown' ? handleDragEnter : undefined}
                  onDragLeave={editorMode === 'markdown' ? handleDragLeave : undefined}
                  onDragOver={editorMode === 'markdown' ? handleDragOver : undefined}
                  onDrop={editorMode === 'markdown' ? handleDrop : undefined}
                  onPaste={editorMode === 'markdown' ? handlePaste : undefined}
                >
                  {/* 拖拽覆盖层 */}
                  {isDragging && editorMode === 'markdown' && (
                    <Box
                      sx={{
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
                      }}
                    >
                      {t('common.dragImageHere')}
                    </Box>
                  )}

                  {/* 内容编辑器 - 根据 editorMode 切换 */}
                  {editorMode === 'markdown' ? (
                    <TextField
                      ref={contentRef}
                      fullWidth
                      multiline
                      variant="standard"
                      placeholder={t('common.startWritingMarkdown')}
                      value={content}
                      onChange={handleContentChange}
                      onKeyDown={handleKeyDown}
                      InputProps={{
                        disableUnderline: true
                      }}
                      sx={{
                        flex: 1,
                        '& .MuiInput-root': {
                          height: '100%',
                          padding: '16px'
                        },
                        '& .MuiInput-input': {
                          fontSize: '1rem',
                          lineHeight: 1.6,
                          fontFamily: '"OPPOSans R", "OPPOSans", system-ui, -apple-system, sans-serif',
                          height: '100% !important',
                          overflow: 'auto !important'
                        }
                      }}
                    />
                  ) : (
                    <WYSIWYGEditor
                      ref={wysiwygEditorRef}
                      content={content}
                      onChange={(newContent) => {
                        setContent(newContent)
                        setHasUnsavedChanges(true)
                        prevStateRef.current.content = newContent
                        debouncedSave()
                      }}
                      placeholder={t('common.startWriting')}
                    />
                  )}
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
                  <MarkdownPreview
                    content={content}
                    onWikiLinkClick={handleWikiLinkClick}
                    onTagClick={handleTagClick}
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
          </Box>
        )}

        {/* 白板编辑器 */}
        {noteType === 'whiteboard' && selectedNoteId && (
          <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <WhiteboardEditor
              noteId={selectedNoteId}
              showToolbar={showToolbar}
              isStandaloneMode={isStandaloneMode}
              onSaveWhiteboard={(func) => setWhiteboardSaveFunc(() => func)}
              onExportPNG={(func) => setWhiteboardExportFunc(() => func)}
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
          {t('common.noteSaved')}
        </Alert>
      </Snackbar>

      {/* Wiki 链接错误提示 */}
      <Snackbar
        open={!!wikiLinkError}
        autoHideDuration={3000}
        onClose={() => setWikiLinkError('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="warning" onClose={() => setWikiLinkError('')}>
          {wikiLinkError}
        </Alert>
      </Snackbar>

      {/* 笔记类型转换确认对话框 */}
      <NoteTypeConversionDialog
        open={conversionDialogOpen}
        onClose={handleConversionConfirm}
        conversionType={
          noteType === 'markdown' && pendingNoteType === 'whiteboard'
            ? 'markdown-to-whiteboard'
            : 'whiteboard-to-markdown'
        }
        noteTitle={title}
      />
    </Box>
  )
}

export default NoteEditor
