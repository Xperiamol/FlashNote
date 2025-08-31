import React, { useState } from 'react'
import {
  Box,
  Toolbar as MuiToolbar,
  IconButton,
  Typography,
  Button,
  Tooltip,
  Badge,
  FormControlLabel,
  Checkbox,
  ButtonGroup
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Delete as DeleteIcon,
  Restore as RestoreIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  Menu as MenuIcon,
  Close as CloseIcon,
  Sort as SortIcon,
  Schedule as ScheduleIcon,
  Flag as FlagIcon,
  AccessTime as AccessTimeIcon
} from '@mui/icons-material'
import { useStore } from '../store/useStore'
import DropdownMenu from './DropdownMenu'

const Toolbar = ({ 
  onToggleSidebar, 
  sidebarOpen, 
  showDeleted, 
  onToggleDeleted,
  currentView,
  todoViewMode,
  onTodoViewModeChange,
  todoShowCompleted,
  onTodoShowCompletedChange,
  onCreateTodo,
  todoSortBy,
  onTodoSortByChange
}) => {
  const {
    createNote,
    notes,
    theme,
    toggleTheme,
    setSelectedNoteId
  } = useStore()

  // 移除settingsAnchor状态，改用DropdownMenu组件

  const deletedNotesCount = notes.filter(note => note.is_deleted).length

  const handleCreateNote = async () => {
    try {
      const result = await createNote({
        title: '新笔记',
        content: '',
        category: '',
        tags: []
      })
      if (result?.success && result.data) {
        setSelectedNoteId(result.data.id)
      }
    } catch (error) {
      console.error('创建笔记失败:', error)
    }
  }



  // 设置菜单选项
  const settingsOptions = [
    {
      value: 'preferences',
      label: '偏好设置',
      icon: SettingsIcon
    }
  ]

  const handleSettingsSelect = (value) => {
    // 设置选项的处理逻辑可以在这里添加
  }



  // 其他视图的创建处理函数
  const handleCreateTodo = async () => {
    if (onCreateTodo) {
      onCreateTodo();
    }
  };

  const handleCreateEvent = async () => {
    // TODO: 实现创建日历事件的逻辑
    console.log('创建日历事件');
  };

  const handleCreateFile = async () => {
    // TODO: 实现创建文件的逻辑
    console.log('创建文件');
  };

  // 根据当前视图获取标题和新建按钮文本
  const getViewConfig = () => {
    switch (currentView) {
      case 'notes':
        return {
          title: 'FlashNote',
          createButtonText: '新建',
          createAction: handleCreateNote,
          showDeletedButton: true
        };
      case 'todo':
        return {
          title: '待办事项',
          createButtonText: '新建',
          createAction: handleCreateTodo,
          showDeletedButton: false,
          customButtons: [
            {
              type: 'viewToggle',
              label: '视图切换',
              options: [
                { value: 'quadrant', label: '四象限' },
                { value: 'list', label: '列表' }
              ]
            },
            {
              type: 'checkbox',
              label: '显示已完成',
              key: 'showCompleted'
            }
          ],
          rightButtons: [
            {
              type: 'sortMenu',
              label: '排序',
              icon: SortIcon,
              options: [
                { value: 'priority', label: '按优先级', icon: FlagIcon },
                { value: 'dueDate', label: '按截止时间', icon: ScheduleIcon },
                { value: 'createdAt', label: '按创建时间', icon: AccessTimeIcon }
              ]
            }
          ]
        };
      case 'calendar':
        return {
          title: '日历',
          createButtonText: '新建事件',
          createAction: handleCreateEvent,
          showDeletedButton: false
        };
      case 'files':
        return {
          title: '文件管理',
          createButtonText: '新建文件',
          createAction: handleCreateFile,
          showDeletedButton: false
        };
      case 'settings':
        return {
          title: '设置',
          createButtonText: null,
          createAction: null,
          showDeletedButton: false
        };
      default:
        return {
          title: 'FlashNote',
          createButtonText: '新建',
          createAction: handleCreateNote,
          showDeletedButton: false
        };
    }
  };

  const viewConfig = getViewConfig();

  return (
    <MuiToolbar
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        minHeight: '64px !important'
      }}
    >
      {/* 左侧按钮组 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tooltip title={sidebarOpen ? '隐藏侧边栏' : '显示侧边栏'}>
          <IconButton onClick={onToggleSidebar}>
            {sidebarOpen ? <CloseIcon /> : <MenuIcon />}
          </IconButton>
        </Tooltip>

        {/* 通用新建按钮 */}
        {viewConfig.createButtonText && (
          <Tooltip title={viewConfig.createButtonText}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={viewConfig.createAction}
              sx={{ ml: 1 }}
            >
              {viewConfig.createButtonText}
            </Button>
          </Tooltip>
        )}

        {/* 自定义按钮区域 */}
        {viewConfig.customButtons && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 2 }}>
            {viewConfig.customButtons.map((button, index) => {
              if (button.type === 'viewToggle') {
                return (
                  <ButtonGroup key={index} size="small" variant="outlined">
                    {button.options.map((option) => (
                      <Button
                        key={option.value}
                        variant={todoViewMode === option.value ? 'contained' : 'outlined'}
                        onClick={() => onTodoViewModeChange && onTodoViewModeChange(option.value)}
                        sx={{ px: 2 }}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </ButtonGroup>
                );
              } else if (button.type === 'checkbox') {
                return (
                  <FormControlLabel
                    key={index}
                    control={
                      <Checkbox
                        checked={todoShowCompleted || false}
                        onChange={(e) => onTodoShowCompletedChange && onTodoShowCompletedChange(e.target.checked)}
                        size="small"
                      />
                    }
                    label={button.label}
                    sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
                  />
                );
              }
              return null;
            })}
          </Box>
        )}
      </Box>

      {/* 动态标题 */}
      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <Typography variant="h6" component="div">
          {viewConfig.title}
        </Typography>
      </Box>

      {/* 右侧按钮组 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* 视图特定的右侧按钮 */}
        {viewConfig.rightButtons && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 1 }}>
            {viewConfig.rightButtons.map((button, index) => {
              if (button.type === 'sortMenu') {
                return (
                  <DropdownMenu
                    key={index}
                    icon={<button.icon />}
                    tooltip={button.label}
                    options={button.options}
                    selectedValue={todoSortBy}
                    onSelect={onTodoSortByChange}
                  />
                );
              }
              return null;
            })}
          </Box>
        )}
        
        {/* 回收站按钮 - 仅在笔记视图显示 */}
        {viewConfig.showDeletedButton && (
          <Tooltip title={showDeleted ? '显示正常笔记' : '显示回收站'}>
            <IconButton onClick={onToggleDeleted}>
              <Badge badgeContent={deletedNotesCount} color="error">
                {showDeleted ? <RestoreIcon /> : <DeleteIcon />}
              </Badge>
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}>
          <IconButton onClick={toggleTheme}>
            {theme === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>

        <DropdownMenu
          icon={<SettingsIcon />}
          tooltip="设置"
          options={settingsOptions}
          onSelect={handleSettingsSelect}
        />
      </Box>
    </MuiToolbar>
  )
}

export default Toolbar