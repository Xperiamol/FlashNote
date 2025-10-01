import React, { useMemo, useState } from 'react'
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
  AccessTime as AccessTimeIcon,
  ChevronLeft,
  ChevronRight,
  Today
} from '@mui/icons-material'
import { useStore } from '../store/useStore'
import DropdownMenu from './DropdownMenu'
import { executePluginCommand } from '../api/pluginAPI'
import { getPluginCommandIcon } from '../utils/pluginCommandUtils.jsx'

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
  onTodoSortByChange,
  // 日历相关的props
  calendarCurrentDate,
  onCalendarDateChange,
  calendarShowCompleted,
  onCalendarShowCompletedChange,
  onSelectedDateChange,
  selectedDate
}) => {
  const {
    createNote,
    notes,
    theme,
    toggleTheme,
    setSelectedNoteId
  } = useStore()
  const pluginCommands = useStore((state) => state.pluginCommands)
  const [pluginCommandPending, setPluginCommandPending] = useState(null)

  const noteToolbarCommands = useMemo(() => {
    if (!Array.isArray(pluginCommands) || pluginCommands.length === 0) return []
    return pluginCommands.filter((command) =>
      Array.isArray(command.surfaces) && command.surfaces.includes('toolbar:notes')
    )
  }, [pluginCommands])

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


  const createSettingsConfig = () => ({
    options: [
      {
        value: 'preferences',
        label: '偏好设置',
        icon: SettingsIcon
      }
    ],
    handleSelect: (value) => {
      // 设置选项的处理逻辑可以在这里添加
    }
  });

  // 当前设置配置已隐藏
  // const settingsConfig = createSettingsConfig();



  // 其他视图的创建处理函数
  const handleCreateTodo = async () => {
    if (onCreateTodo) {
      onCreateTodo();
    }
  };

  const handleCreateEvent = async () => {
    console.log('handleCreateEvent被调用了');
    console.log('selectedDate:', selectedDate);
    
    // 创建日历事件，预设选中的日期
    const initialData = {}
    
    // 如果有选中的日期，预设截止日期
    if (selectedDate) {
      // 格式化日期为 YYYY-MM-DD 格式
      const year = selectedDate.getFullYear()
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
      const day = String(selectedDate.getDate()).padStart(2, '0')
      initialData.due_date = `${year}-${month}-${day}`
      console.log('设置初始日期:', initialData.due_date);
    }
    
    console.log('调用onCreateTodo，参数:', initialData);
    if (onCreateTodo) {
      onCreateTodo(initialData)
    } else {
      console.log('onCreateTodo不存在');
    }
  };

  // 日历导航函数 - 遵循DRY原则的通用日期处理
  const createDateNavigationHandler = (dateTransform) => {
    return () => {
      if (calendarCurrentDate && onCalendarDateChange) {
        const newDate = dateTransform(calendarCurrentDate);
        onCalendarDateChange(newDate);
      }
    };
  };

  const goToPreviousMonth = createDateNavigationHandler(
    (date) => new Date(date.getFullYear(), date.getMonth() - 1, 1)
  );

  const goToNextMonth = createDateNavigationHandler(
    (date) => new Date(date.getFullYear(), date.getMonth() + 1, 1)
  );

  const goToToday = () => {
    const today = new Date();
    if (onCalendarDateChange) {
      onCalendarDateChange(today);
    }
    // 同时设置选中日期为今天
    if (onSelectedDateChange) {
      onSelectedDateChange(today);
    }
  };

  const handleCreateFile = async () => {
    // TODO: 实现创建文件的逻辑
    console.log('创建文件');
  };

  const handlePluginCommandExecute = async (command) => {
    if (!command) return
    const commandKey = `${command.pluginId}:${command.commandId}`
    try {
      setPluginCommandPending(commandKey)
      await executePluginCommand(command.pluginId, command.commandId)
    } catch (error) {
      console.error('执行插件命令失败:', error)
    } finally {
      setPluginCommandPending(null)
    }
  }

  const renderPluginCommandIcon = (command) =>
    getPluginCommandIcon(command, { fontSize: 'small', size: 20 })

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
                { value: 'focus', label: '专注' }
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
          showDeletedButton: false,
          customButtons: [
            {
              type: 'calendarNavigation',
              currentDate: calendarCurrentDate
            },
            {
              type: 'checkbox',
              label: '显示已完成',
              key: 'showCompleted'
            }
          ]
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
                const isCalendarView = currentView === 'calendar';
                const checked = isCalendarView ? calendarShowCompleted : todoShowCompleted;
                const onChange = isCalendarView ? onCalendarShowCompletedChange : onTodoShowCompletedChange;
                
                return (
                  <FormControlLabel
                    key={index}
                    control={
                      <Checkbox
                        checked={checked || false}
                        onChange={(e) => onChange && onChange(e.target.checked)}
                        size="small"
                      />
                    }
                    label={button.label}
                    sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
                  />
                );
              } else if (button.type === 'calendarNavigation') {
                return (
                  <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Tooltip title="上个月">
                      <IconButton 
                        onClick={goToPreviousMonth} 
                        size="small"
                        sx={{
                          backgroundColor: 'background.paper',
                          border: 1,
                          borderColor: 'divider',
                          '&:hover': {
                            backgroundColor: 'primary.main',
                            color: 'primary.contrastText',
                            transform: 'scale(1.05)'
                          },
                          transition: 'all 0.2s ease-in-out'
                        }}
                      >
                        <ChevronLeft />
                      </IconButton>
                    </Tooltip>
                    
                    <Box
                      sx={{
                        minWidth: '140px',
                        textAlign: 'center',
                        px: 2,
                        py: 0.5,
                        borderRadius: 1,
                        backgroundColor: 'primary.main',
                        color: 'primary.contrastText'
                      }}
                    >
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 600,
                          fontSize: '0.875rem'
                        }}
                      >
                        {button.currentDate ? 
                          `${button.currentDate.getFullYear()}年${button.currentDate.getMonth() + 1}月` : 
                          '日历'
                        }
                      </Typography>
                    </Box>
                    
                    <Tooltip title="下个月">
                      <IconButton 
                        onClick={goToNextMonth} 
                        size="small"
                        sx={{
                          backgroundColor: 'background.paper',
                          border: 1,
                          borderColor: 'divider',
                          '&:hover': {
                            backgroundColor: 'primary.main',
                            color: 'primary.contrastText',
                            transform: 'scale(1.05)'
                          },
                          transition: 'all 0.2s ease-in-out'
                        }}
                      >
                        <ChevronRight />
                      </IconButton>
                    </Tooltip>
                    
                    <Tooltip title="回到今天">
                      <IconButton 
                        onClick={goToToday} 
                        size="small"
                        color="primary"
                        sx={{
                          backgroundColor: 'primary.main',
                          color: 'primary.contrastText',
                          '&:hover': {
                            backgroundColor: 'primary.dark',
                            transform: 'scale(1.1)'
                          },
                          transition: 'all 0.2s ease-in-out',
                          ml: 1
                        }}
                      >
                        <Today />
                      </IconButton>
                    </Tooltip>
                  </Box>
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
        {currentView === 'notes' && noteToolbarCommands.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 0.5 }}>
            {noteToolbarCommands.map((command) => {
              const commandKey = `${command.pluginId}:${command.commandId}`
              const baseLabel = command.description || command.title || command.commandId
              const shortcutHint =
                command?.shortcutBinding?.currentKey ||
                command?.shortcutBinding?.defaultKey ||
                (typeof command?.shortcut === 'string'
                  ? command.shortcut
                  : command?.shortcut?.default || '')

              const tooltipText = shortcutHint ? `${baseLabel} (${shortcutHint})` : baseLabel

              return (
                <Tooltip
                  key={commandKey}
                  title={tooltipText}
                  placement="bottom"
                >
                  <span>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => handlePluginCommandExecute(command)}
                      disabled={pluginCommandPending === commandKey}
                      aria-label={command.title}
                      sx={{
                        '&.Mui-disabled': {
                          opacity: 0.35
                        }
                      }}
                    >
                      {renderPluginCommandIcon(command)}
                    </IconButton>
                  </span>
                </Tooltip>
              )
            })}
          </Box>
        )}

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

        {/* 暂时隐藏设置按钮 */}
        {/* <DropdownMenu
          icon={<SettingsIcon />}
          tooltip="设置"
          options={settingsOptions}
          onSelect={handleSettingsSelect}
        /> */}
      </Box>
    </MuiToolbar>
  )
}

export default Toolbar