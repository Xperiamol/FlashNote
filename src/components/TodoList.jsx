import React, { useState, useEffect, useCallback } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  ToggleButtonGroup,
  ToggleButton,
  Checkbox
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  MoreVert as MoreVertIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  Flag as FlagIcon,
  FlashOn as FlashOnIcon,
  FilterList as FilterListIcon,
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon
} from '@mui/icons-material';
import { format, isToday, isPast, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useMultiSelect } from '../hooks/useMultiSelect';
import { useSearch } from '../hooks/useSearch';
import { useSearchManager } from '../hooks/useSearchManager';
import { useMultiSelectManager } from '../hooks/useMultiSelectManager';
import { searchTodosAPI } from '../api/searchAPI';
import FilterContainer from './FilterContainer';
import { 
  getPriorityFromQuadrant, 
  getPriorityIcon, 
  getPriorityColor, 
  getPriorityText,
  comparePriority
} from '../utils/priorityUtils';
import { createDragHandler } from '../utils/DragManager'
import { useDragAnimation } from './DragAnimationProvider';

const TodoList = ({ onTodoSelect, onViewModeChange, onShowCompletedChange, viewMode, showCompleted, onMultiSelectChange, onMultiSelectRefChange, refreshTrigger, sortBy, onSortByChange }) => {
  const [todos, setTodos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedTodo, setSelectedTodo] = useState(null);
  const [filterBy, setFilterBy] = useState('all'); // all, urgent, important, normal, low
  
  // 新增筛选状态
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedPriorities, setSelectedPriorities] = useState([]);
  
  // 双击完成相关状态
  const [pendingComplete, setPendingComplete] = useState(new Set());
  const [celebratingTodos, setCelebratingTodos] = useState(new Set());

  // 使用通用搜索hook
  const { search: searchTodos, isSearching } = useSearch({
    searchAPI: searchTodosAPI,
    onSearchResult: (results) => {
      // 应用过滤和排序
      let filteredTodos = results;
      
      if (!showCompleted) {
        filteredTodos = filteredTodos.filter(todo => !todo.completed);
      }
      
      setTodos(applyFiltersAndSort(filteredTodos));
    },
    onError: (error) => {
      console.error('Todo search error:', error);
    }
  });

  // 使用多选管理hook
  const multiSelect = useMultiSelectManager({
    items: todos,
    itemType: '待办事项',
    onMultiSelectChange,
    onMultiSelectRefChange
  })

  // 使用动画拖拽处理器 - 拖拽整个Todo列表
  const { createAnimatedDragHandler } = useDragAnimation()
  const dragHandler = createAnimatedDragHandler('todo', async (todoList) => {
    try {
      // 传递当前的todos列表作为参数
      await window.electronAPI.createTodoWindow({ todos: todoList })
    } catch (error) {
      console.error('创建Todo独立窗口失败:', error)
    }
  }, {
    onDragStart: (dragData) => {
      // 添加Todo拖拽开始时的自定义逻辑
      console.log('Todo列表拖拽开始，添加视觉反馈');
    },
    onCreateWindow: (dragData) => {
      // Todo独立窗口创建成功后的回调
      console.log('Todo独立窗口创建成功');
    }
  })

  // 定义loadTodos函数，确保在使用前初始化
  const loadTodos = async () => {
    setIsLoading(true);
    try {
      let result;
      if (sortBy === 'priority') {
        const response = await window.electronAPI.todos.getByPriority();
        result = response.success ? response.data : [];
      } else if (sortBy === 'dueDate') {
        const response = await window.electronAPI.todos.getByDueDate();
        result = response.success ? response.data : [];
      } else {
        const response = await window.electronAPI.todos.getByCreatedAt();
        result = response.success ? response.data : [];
      }
      
      let filteredTodos = result || [];
      
      // 映射数据字段
      filteredTodos = filteredTodos.map(todo => ({
        ...todo,
        completed: Boolean(todo.is_completed),
        title: todo.content,
        priority: getPriorityFromQuadrant(todo.is_important, todo.is_urgent)
      }));
      
      // 根据完成状态筛选
      if (!showCompleted) {
        filteredTodos = filteredTodos.filter(todo => !todo.completed);
      }
      
      // 应用所有筛选和排序
      setTodos(applyFiltersAndSort(filteredTodos));
    } catch (error) {
      console.error('加载待办事项失败:', error);
      setTodos([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 在loadTodos定义后添加相关的hooks和effects
  useEffect(() => {
    loadTodos();
  }, [filterBy, sortBy, showCompleted, selectedTags, selectedPriorities]);

  // 创建稳定的回调函数，避免无限循环
  const stableSearchFunction = useCallback((query) => {
    searchTodos(query);
  }, [searchTodos]);
  
  const stableLoadFunction = useCallback(() => {
    loadTodos();
  }, [loadTodos]);
  
  // 使用搜索管理hook解决无限循环问题
  const { localSearchQuery, setLocalSearchQuery } = useSearchManager({
    searchFunction: stableSearchFunction,
    loadFunction: stableLoadFunction,
    searchCondition: {},
    debounceDelay: 300
  });

  // 监听刷新触发器
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadTodos();
    }
  }, [refreshTrigger]);

  // 应用过滤和排序的辅助函数
  const applyFiltersAndSort = (todoList) => {
    let filtered = [...todoList];
    
    // 按优先级过滤（保留原有逻辑）
    if (filterBy !== 'all') {
      filtered = filtered.filter(todo => todo.priority === filterBy);
    }
    
    // 按新的优先级筛选过滤
    if (selectedPriorities.length > 0) {
      filtered = filtered.filter(todo => selectedPriorities.includes(todo.priority));
    }
    
    // 按标签过滤
    if (selectedTags.length > 0) {
      filtered = filtered.filter(todo => {
        if (!todo.tags) return false;
        const todoTags = Array.isArray(todo.tags) ? todo.tags : todo.tags.split(',').map(tag => tag.trim());
        return selectedTags.some(selectedTag => todoTags.includes(selectedTag));
      });
    }
    
    // 排序
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          return comparePriority(a, b);
        case 'dueDate':
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date) - new Date(b.due_date);
        case 'createdAt':
          return new Date(b.created_at) - new Date(a.created_at);
        default:
          return 0;
      }
    });
    
    return filtered;
  };

  const handleTodoClick = (todo) => {
    if (!multiSelect.isMultiSelectMode) {
      if (onTodoSelect) {
        onTodoSelect(todo);
      }
    }
  };

  const handleMenuClick = (event, todo) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedTodo(todo);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedTodo(null);
  };

  const handleToggleComplete = async (todo) => {
    // 如果已经完成，直接切换状态
    if (todo.completed) {
      try {
        await window.electronAPI.todos.toggleComplete(todo.id);
        loadTodos();
      } catch (error) {
        console.error('更新待办事项失败:', error);
      }
      return;
    }
    
    // 未完成的任务需要双击
    if (pendingComplete.has(todo.id)) {
      // 第二次点击，执行完成操作
      try {
        // 先显示庆祝动画
        setCelebratingTodos(prev => new Set([...prev, todo.id]));
        
        // 延迟执行完成操作，让动画播放
        setTimeout(async () => {
          await window.electronAPI.todos.toggleComplete(todo.id);
          loadTodos();
          
          // 清除庆祝状态
          setTimeout(() => {
            setCelebratingTodos(prev => {
              const newSet = new Set(prev);
              newSet.delete(todo.id);
              return newSet;
            });
          }, 1000);
        }, 300);
        
        // 清除待完成状态
        setPendingComplete(prev => {
          const newSet = new Set(prev);
          newSet.delete(todo.id);
          return newSet;
        });
      } catch (error) {
        console.error('更新待办事项失败:', error);
      }
    } else {
      // 第一次点击，标记为待完成
      setPendingComplete(prev => new Set([...prev, todo.id]));
      
      // 3秒后自动清除待完成状态
      setTimeout(() => {
        setPendingComplete(prev => {
          const newSet = new Set(prev);
          newSet.delete(todo.id);
          return newSet;
        });
      }, 3000);
    }
  };

  const handleDelete = async () => {
    if (selectedTodo) {
      try {
        await window.electronAPI.todos.delete(selectedTodo.id);
        loadTodos();
        handleMenuClose();
      } catch (error) {
        console.error('删除待办事项失败:', error);
      }
    }
  };

  const handleEdit = () => {
    if (selectedTodo && onTodoSelect) {
      onTodoSelect(selectedTodo);
      handleMenuClose();
    }
  };

  const handleClearSearch = () => {
    setLocalSearchQuery('');
  };

  // 优先级相关函数已移至 priorityUtils.js，这里直接使用导入的函数

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = parseISO(dateString);
      if (isToday(date)) {
        return '今天';
      }
      return format(date, 'MM月dd日', { locale: zhCN });
    } catch (error) {
      return '';
    }
  };

  const isOverdue = (dateString) => {
    if (!dateString) return false;
    try {
      const date = parseISO(dateString);
      return isPast(date) && !isToday(date);
    } catch (error) {
      return false;
    }
  };



  const renderLoadingState = () => (
    <Box sx={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: 200 
    }}>
      <CircularProgress size={24} />
    </Box>
  );

  const renderEmptyState = () => (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      height: 200,
      color: 'text.secondary'
    }}>
      <ScheduleIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
      <Typography variant="body2">
        {localSearchQuery ? '没有找到匹配的待办事项' : '暂无待办事项'}
      </Typography>
      {!localSearchQuery && (
        <Typography variant="body2" sx={{ mt: 1, opacity: 0.7 }}>
          点击新建按钮创建第一个待办
        </Typography>
      )}
    </Box>
  );

  return (
    <Box sx={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* 搜索框和筛选区域 */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="搜索待办事项..."
          value={localSearchQuery}
          onChange={(e) => setLocalSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: localSearchQuery && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleClearSearch}
                  sx={{ color: 'text.secondary' }}
                >
                  <ClearIcon />
                </IconButton>
              </InputAdornment>
            )
          }}
        />
        
        {/* 筛选容器 */}
        <FilterContainer
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
          selectedPriorities={selectedPriorities}
          onPrioritiesChange={setSelectedPriorities}
          showTagFilter={true}
          showPriorityFilter={true}
          isTodoFilter={true}
          sx={{ mt: 1 }}
        />
      </Box>

      {/* 待办事项列表 */}
      <Box 
        sx={{ flex: 1, overflow: 'auto' }}
        onMouseDown={(e) => {
          // 只在非多选模式下且有待办事项时启用拖拽
          if (!multiSelect.isMultiSelectMode && todos.length > 0 && e.button === 0) {
            // 检查是否点击在列表项上，而不是在具体的按钮或输入框上
            const target = e.target;
            const isClickOnListArea = target.closest('.MuiList-root') && 
                                    !target.closest('.MuiIconButton-root') && 
                                    !target.closest('.MuiCheckbox-root') && 
                                    !target.closest('.MuiTextField-root');
            
            if (isClickOnListArea) {
              dragHandler.handleDragStart(e, todos)
            }
          }
        }}
      >
        {isLoading ? (
          renderLoadingState()
        ) : todos.length === 0 ? (
          renderEmptyState()
        ) : (
          <List sx={{ p: 0 }}>
            {todos.map((todo) => (
              <Fade key={todo.id} in timeout={300}>
                <ListItem
                  disablePadding
                  sx={{
                    borderBottom: 1,
                    borderColor: 'divider',
                    position: 'relative',
                    overflow: 'hidden',
                    '&:hover': {
                      backgroundColor: 'action.hover'
                    },
                    ...(multiSelect.isMultiSelectMode && multiSelect.isSelected(todo.id) && {
                      backgroundColor: 'action.selected',
                      '&:hover': {
                        backgroundColor: 'action.selected'
                      }
                    }),
                    ...(celebratingTodos.has(todo.id) && {
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(76, 175, 80, 0.4)',
                        transform: 'translateX(-100%)',
                        animation: 'greenSweep 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
                        zIndex: 1,
                        pointerEvents: 'none'
                      },
                      '@keyframes greenSweep': {
                        '0%': {
                          transform: 'translateX(-100%)'
                        },
                        '100%': {
                          transform: 'translateX(0%)'
                        }
                      }
                    })
                  }}
                >
                  <ListItemButton
                    onClick={(e) => multiSelect.handleClick(e, todo.id, () => handleTodoClick(todo))}
                    onContextMenu={(e) => multiSelect.handleContextMenu(e, todo.id, multiSelect.isMultiSelectMode)}
                    sx={{ py: 1.5 }}
                  >
                    {multiSelect.isMultiSelectMode && (
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        <Checkbox
                          checked={multiSelect.isSelected(todo.id)}
                          size="small"
                          sx={{ p: 0.5 }}
                        />
                      </ListItemIcon>
                    )}
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleComplete(todo);
                        }}
                        sx={{
                          position: 'relative',
                          transition: 'all 0.3s ease',
                          zIndex: 2,
                          ...(pendingComplete.has(todo.id) && {
                            backgroundColor: 'warning.light',
                            '&:hover': {
                              backgroundColor: 'warning.main'
                            }
                          })
                        }}
                      >
                        {todo.completed ? (
                          <CheckCircleIcon sx={{ color: 'success.main' }} />
                        ) : pendingComplete.has(todo.id) ? (
                          <RadioButtonUncheckedIcon 
                            sx={{ 
                              color: 'warning.main',
                              animation: 'pulse 1s infinite'
                            }} 
                          />
                        ) : celebratingTodos.has(todo.id) ? (
                          <CheckCircleIcon 
                            sx={{ 
                              color: 'success.main',
                              filter: 'drop-shadow(0 0 8px rgba(76, 175, 80, 0.6))'
                            }} 
                          />
                        ) : (
                          <RadioButtonUncheckedIcon sx={{ color: 'text.secondary' }} />
                        )}
                      </IconButton>
                    </ListItemIcon>
                    
                    <ListItemText
                      primary={
                        <Typography
                          variant="body2"
                          sx={{
                            textDecoration: todo.completed ? 'line-through' : 'none',
                            opacity: todo.completed ? 0.6 : 1
                          }}
                        >
                          {todo.title}
                        </Typography>
                      }
                      secondary={
                        <Typography component="div" variant="body2" color="textSecondary">
                          <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 1, 
                            mt: 0.5,
                            flexWrap: 'wrap',
                            maxWidth: 'calc(100% - 60px)' // 为右侧图标预留空间
                          }}>
                            <Chip
                              label={getPriorityText(todo.priority)}
                              size="small"
                              sx={{
                                backgroundColor: `${getPriorityColor(todo.priority)}20`,
                                color: getPriorityColor(todo.priority),
                                fontSize: '0.7rem',
                                height: 20
                              }}
                            />
                            {todo.due_date && (
                              <Chip
                                label={formatDate(todo.due_date)}
                                size="small"
                                sx={{
                                  backgroundColor: isOverdue(todo.due_date) ? '#f4433620' : '#2196f320',
                                  color: isOverdue(todo.due_date) ? '#f44336' : '#2196f3',
                                  fontSize: '0.7rem',
                                  height: 20
                                }}
                              />
                            )}
                            {todo.tags && todo.tags.split(',').filter(tag => tag.trim()).map((tag, index) => (
                              <Chip
                                key={index}
                                label={tag.trim()}
                                size="small"
                                sx={{
                                  backgroundColor: '#9c27b020',
                                  color: '#9c27b0',
                                  fontSize: '0.7rem',
                                  height: 20
                                }}
                              />
                            ))}
                          </Box>
                        </Typography>
                      }
                    />
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getPriorityIcon(todo.priority)}
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuClick(e, todo)}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </Box>
                  </ListItemButton>
                </ListItem>
              </Fade>
            ))}
          </List>
        )}
      </Box>

      {/* 右键菜单 */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem onClick={handleEdit}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>编辑</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDelete}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>删除</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default TodoList;