import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Typography,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  TextField,
  InputAdornment,
  Paper,
  Skeleton,
  Fade,
  CircularProgress,
  Checkbox
} from '@mui/material'
import {
  PushPin as PinIcon,
  PushPinOutlined as PinOutlinedIcon,
  Delete as DeleteIcon,
  MoreVert as MoreVertIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Note as NoteIcon,
  Restore as RestoreIcon,
  DeleteForever as DeleteForeverIcon
} from '@mui/icons-material'
import { useStore } from '../store/useStore'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale/zh-CN'
import { useMultiSelect } from '../hooks/useMultiSelect'
import { useSearch } from '../hooks/useSearch'
import { useSearchManager } from '../hooks/useSearchManager'
import { useMultiSelectManager } from '../hooks/useMultiSelectManager'
import { searchNotesAPI } from '../api/searchAPI'
import TagFilter from './TagFilter'
import MultiSelectToolbar from './MultiSelectToolbar'

const NoteList = ({ showDeleted = false, onMultiSelectChange, onMultiSelectRefChange }) => {
  const {
    notes,
    selectedNoteId,
    searchQuery,
    isLoading,
    setSelectedNoteId,
    setSearchQuery,
    loadNotes,
    deleteNote,
    restoreNote,
    togglePinNote,
    batchDeleteNotes,
    batchRestoreNotes,
    batchPermanentDeleteNotes
  } = useStore()

  const [anchorEl, setAnchorEl] = useState(null)
  const [selectedNote, setSelectedNote] = useState(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [selectedTagFilters, setSelectedTagFilters] = useState([])
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState(false)
  const [batchPermanentDeleteConfirm, setBatchPermanentDeleteConfirm] = useState(false)

  // 过滤笔记
  const filteredNotes = notes.filter(note => {
    const matchesDeletedStatus = showDeleted ? note.is_deleted : !note.is_deleted;
    
    // 如果没有选择标签筛选，只按删除状态筛选
    if (selectedTagFilters.length === 0) {
      return matchesDeletedStatus;
    }
    
    // 检查笔记是否包含选中的标签
    const noteTags = note.tags ? 
      (Array.isArray(note.tags) ? note.tags : note.tags.split(',').map(tag => tag.trim())) : [];
    const hasSelectedTags = selectedTagFilters.some(filterTag => 
      noteTags.includes(filterTag)
    );
    
    return matchesDeletedStatus && hasSelectedTags;
  })

  // 使用多选管理hook
  const multiSelect = useMultiSelectManager({
    items: filteredNotes,
    itemType: '笔记',
    onMultiSelectChange,
    onMultiSelectRefChange
  })

  useEffect(() => {
    const handleTransition = async () => {
      setIsTransitioning(true)
      // 添加短暂延迟以显示过渡动画
      await new Promise(resolve => setTimeout(resolve, 150))
      
      if (showDeleted) {
        await loadNotes({ deleted: true })
      } else {
        await loadNotes()
      }
      
      setIsTransitioning(false)
    }
    
    handleTransition()
  }, [showDeleted]) // 移除 loadNotes 依赖，避免无限循环

  // 使用通用搜索hook
  const { search: searchNotes, isSearching } = useSearch({
    searchAPI: searchNotesAPI,
    onSearchResult: (results, query) => {
      // 通过store更新notes状态
      useStore.setState({ notes: results, searchQuery: query })
    },
    onError: (error) => {
      console.error('Search error:', error)
    }
  })

  // 创建稳定的回调函数，避免无限循环
  const stableSearchFunction = useCallback((query) => {
    searchNotes(query)
  }, [searchNotes])
  
  const stableLoadFunction = useCallback((condition) => {
    setSearchQuery('')
    loadNotes(condition)
  }, [setSearchQuery, loadNotes])
  
  // 使用搜索管理hook解决无限循环问题
  const { localSearchQuery, setLocalSearchQuery } = useSearchManager({
    searchFunction: stableSearchFunction,
    loadFunction: stableLoadFunction,
    searchCondition: showDeleted ? { deleted: true } : {},
    debounceDelay: 300
  })

  const handleNoteClick = (noteId) => {
    if (!multiSelect.isMultiSelectMode) {
      setSelectedNoteId(noteId)
    }
  }

  const handleMenuClick = (event, note) => {
    event.stopPropagation()
    setAnchorEl(event.currentTarget)
    setSelectedNote(note)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
    setSelectedNote(null)
  }

  const handleTogglePin = async () => {
    if (selectedNote) {
      await togglePinNote(selectedNote.id)
      handleMenuClose()
    }
  }

  const handleDelete = async () => {
    if (selectedNote) {
      await deleteNote(selectedNote.id)
      handleMenuClose()
    }
  }

  const handleRestore = async () => {
    if (selectedNote) {
      await restoreNote(selectedNote.id)
      handleMenuClose()
    }
  }

  const handlePermanentDelete = async () => {
    if (selectedNote) {
      if (!permanentDeleteConfirm) {
        // 第一次点击，设置确认状态
        setPermanentDeleteConfirm(true)
        // 3秒后自动重置状态
        setTimeout(() => {
          setPermanentDeleteConfirm(false)
        }, 3000)
      } else {
        // 第二次点击，执行删除
        const { permanentDeleteNote } = useStore.getState()
        await permanentDeleteNote(selectedNote.id)
        setPermanentDeleteConfirm(false)
        handleMenuClose()
      }
    }
  }

  // 批量操作处理函数
  const handleBatchRestore = async (selectedIds) => {
    if (selectedIds.length === 0) return
    
    const confirmed = window.confirm(`确定要恢复 ${selectedIds.length} 个笔记吗？`)
    if (confirmed) {
      const result = await batchRestoreNotes(selectedIds)
      if (result.success) {
        multiSelect.clearSelection()
      }
    }
  }

  const handleBatchPermanentDelete = async (selectedIds) => {
    if (selectedIds.length === 0) return
    
    if (!batchPermanentDeleteConfirm) {
      // 第一次点击，设置确认状态
      setBatchPermanentDeleteConfirm(true)
      // 3秒后自动重置状态
      setTimeout(() => {
        setBatchPermanentDeleteConfirm(false)
      }, 3000)
    } else {
      // 第二次点击，执行删除
      const result = await batchPermanentDeleteNotes(selectedIds)
      if (result.success) {
        multiSelect.clearSelection()
      }
      setBatchPermanentDeleteConfirm(false)
    }
  }

  const handleBatchDelete = async (selectedIds) => {
    if (selectedIds.length === 0) return
    
    const confirmed = window.confirm(`确定要删除 ${selectedIds.length} 个笔记吗？`)
    if (confirmed) {
      const result = await batchDeleteNotes(selectedIds)
      if (result.success) {
        multiSelect.clearSelection()
      }
    }
  }

  const handleClearSearch = () => {
    setLocalSearchQuery('')
  }

  const formatDate = (dateString) => {
    try {
      // SQLite的CURRENT_TIMESTAMP返回UTC时间，需要转换为本地时间
      const utcDate = new Date(dateString + 'Z') // 添加Z表示UTC时间
      return formatDistanceToNow(utcDate, {
        addSuffix: true,
        locale: zhCN
      })
    } catch {
      return '未知时间'
    }
  }

  const getPreviewText = (content) => {
    if (!content) return '空笔记'
    return content.replace(/[#*`\n]/g, '').substring(0, 100)
  }

  // 渲染加载状态
  const renderLoadingState = () => (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      height: '200px',
      gap: 2
    }}>
      <CircularProgress size={40} />
      <Typography variant="body2" color="text.secondary">
        {showDeleted ? '加载回收站...' : '加载笔记...'}
      </Typography>
    </Box>
  )

  if (isLoading && !isTransitioning) {
    return (
      <Box sx={{ 
        flex: 1,
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0
      }}>
        <Box sx={{ p: 2, pb: 1, flexShrink: 0 }}>
          <Skeleton variant="rectangular" height={40} />
        </Box>
        <Box sx={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          minHeight: 0
        }}>
          {renderLoadingState()}
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ 
      flex: 1,
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden',
      minHeight: 0
    }}>
      {/* 搜索框 */}
      <Box sx={{ p: 2, pb: 1, flexShrink: 0 }}>
        <TextField
          fullWidth
          size="small"
          placeholder={showDeleted ? "搜索回收站..." : "搜索笔记..."}
          value={localSearchQuery}
          onChange={(e) => setLocalSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: localSearchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleClearSearch}>
                  <ClearIcon />
                </IconButton>
              </InputAdornment>
            )
          }}
        />
        
        {/* 标签筛选 */}
        <TagFilter
          selectedTags={selectedTagFilters}
          onTagsChange={setSelectedTagFilters}
          showDeleted={showDeleted}
          sx={{ mt: 1 }}
        />
      </Box>

      {/* 多选工具栏 */}
      {multiSelect.isMultiSelectMode && (
        <MultiSelectToolbar
          selectedCount={multiSelect.selectedIds.length}
          totalCount={filteredNotes.length}
          itemType="笔记"
          onSelectAll={() => multiSelect.selectAll(filteredNotes)}
          onSelectNone={multiSelect.selectNone}
          onDelete={showDeleted ? undefined : handleBatchDelete}
          onClose={multiSelect.exitMultiSelectMode}
          customActions={showDeleted ? [
            {
              label: '批量恢复',
              icon: <RestoreIcon />,
              onClick: () => handleBatchRestore(multiSelect.selectedIds),
              color: 'primary'
            },
            {
              label: batchPermanentDeleteConfirm ? '确认删除' : '永久删除',
              icon: <DeleteForeverIcon />,
              onClick: () => handleBatchPermanentDelete(multiSelect.selectedIds),
              color: batchPermanentDeleteConfirm ? 'error' : 'inherit',
              sx: batchPermanentDeleteConfirm ? {
                backgroundColor: 'error.main',
                color: 'error.contrastText',
                '&:hover': {
                  backgroundColor: 'error.dark'
                }
              } : {}
            }
          ] : []}
        />
      )}

      {/* 笔记列表 */}
      <Box sx={{ 
        flex: 1, 
        overflow: 'auto', 
        position: 'relative',
        minHeight: 0
      }}>
        {/* 过渡加载状态 */}
        {isTransitioning && (
          <Box sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'background.paper',
            zIndex: 1
          }}>
            {renderLoadingState()}
          </Box>
        )}
        
        {/* 笔记内容 */}
        <Fade in={!isTransitioning} timeout={300}>
          <Box>
            {filteredNotes.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <NoteIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" color="text.secondary">
                  {showDeleted ? '回收站为空' : '还没有笔记'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {showDeleted ? '删除的笔记会显示在这里' : '点击新建按钮创建第一个笔记'}
                </Typography>
              </Box>
            ) : (
              <List sx={{ py: 0 }}>
                {filteredNotes.map((note, index) => (
                  <React.Fragment key={note.id}>
                    <ListItem
                      disablePadding
                      secondaryAction={
                        !multiSelect.isMultiSelectMode && (
                          <IconButton
                            edge="end"
                            onClick={(e) => handleMenuClick(e, note)}
                            size="small"
                          >
                            <MoreVertIcon />
                          </IconButton>
                        )
                      }
                    >
                      <ListItemButton
                        selected={!multiSelect.isMultiSelectMode && selectedNoteId === note.id}
                        onClick={(e) => multiSelect.handleClick(e, note.id, handleNoteClick)}
                        onContextMenu={(e) => multiSelect.handleContextMenu(e, note.id, multiSelect.isMultiSelectMode)}
                        sx={{
                          py: 1.5,
                          pr: multiSelect.isMultiSelectMode ? 2 : 6,
                          '&.Mui-selected': {
                            backgroundColor: 'primary.light',
                            '&:hover': {
                              backgroundColor: 'primary.light'
                            }
                          },
                          ...(multiSelect.isMultiSelectMode && multiSelect.isSelected(note.id) && {
                            backgroundColor: 'action.selected',
                            '&:hover': {
                              backgroundColor: 'action.selected'
                            }
                          })
                        }}
                      >
                        {multiSelect.isMultiSelectMode && (
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            <Checkbox
                              checked={multiSelect.isSelected(note.id)}
                              size="small"
                              sx={{ p: 0.5 }}
                            />
                          </ListItemIcon>
                        )}
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          {note.is_pinned ? (
                            <PinIcon color="primary" fontSize="small" />
                          ) : (
                            <NoteIcon color="action" fontSize="small" />
                          )}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography
                                variant="subtitle2"
                                sx={{
                                  fontWeight: note.is_pinned ? 600 : 400,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  flex: 1
                                }}
                              >
                                {note.title || '无标题'}
                              </Typography>
                              {note.category && (
                                <Chip
                                  label={note.category}
                                  size="small"
                                  variant="outlined"
                                  sx={{ fontSize: '0.7rem', height: 20 }}
                                />
                              )}
                            </Box>
                          }
                          secondary={
                            <Box component="span" sx={{ display: 'block' }}>
                              <Typography
                                component="span"
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  mb: 0.5,
                                  display: 'block'
                                }}
                              >
                                {getPreviewText(note.content)}
                              </Typography>
                              <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                {formatDate(note.updated_at)}
                              </Typography>
                            </Box>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                    {index < filteredNotes.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Box>
        </Fade>
      </Box>

      {/* 右键菜单 */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {showDeleted ? (
          [
            <MenuItem key="restore" onClick={handleRestore}>
              <ListItemIcon>
                <RestoreIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>恢复笔记</ListItemText>
            </MenuItem>,
            <MenuItem 
              key="permanent-delete" 
              onClick={handlePermanentDelete}
              sx={permanentDeleteConfirm ? {
                backgroundColor: 'error.main',
                color: 'error.contrastText',
                '&:hover': {
                  backgroundColor: 'error.dark'
                }
              } : {}}
            >
              <ListItemIcon>
                <DeleteIcon fontSize="small" color={permanentDeleteConfirm ? "inherit" : "error"} />
              </ListItemIcon>
              <ListItemText>{permanentDeleteConfirm ? '确认删除' : '永久删除'}</ListItemText>
            </MenuItem>
          ]
        ) : (
          [
            <MenuItem key="pin" onClick={handleTogglePin}>
              <ListItemIcon>
                {selectedNote?.is_pinned ? (
                  <PinOutlinedIcon fontSize="small" />
                ) : (
                  <PinIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText>
                {selectedNote?.is_pinned ? '取消置顶' : '置顶笔记'}
              </ListItemText>
            </MenuItem>,
            <MenuItem key="delete" onClick={handleDelete}>
              <ListItemIcon>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>删除笔记</ListItemText>
            </MenuItem>
          ]
        )}
      </Menu>
    </Box>
  )
}

export default NoteList