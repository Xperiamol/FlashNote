import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../utils/i18n';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Paper,
  Chip,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Divider,
  useTheme,
  Card,
  CardHeader,
  CardContent,
  Avatar,
  ToggleButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { scrollbar } from '../styles/commonStyles';
import MultiSelectToolbar from './MultiSelectToolbar';
import {
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  Flag as FlagIcon,
  FlashOn as FlashOnIcon,
  Circle as CircleIcon
} from '@mui/icons-material';
import { format, isToday, isPast, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import TodoFormFields from './TodoFormFields';
import TodoItem from './TodoItem';
import FocusModeView from './FocusModeView';
import TimeZoneUtils from '../utils/timeZoneUtils';
import {
  fetchTodos,
  fetchTodosByQuadrant,
  toggleTodoComplete,
  deleteTodo as deleteTodoAPI,
  createTodo as createTodoAPI,
  getTodoTagSuggestions,
  addTodoFocusTime
} from '../api/todoAPI';
import appLocale from '../locales/zh-CN';
import { todoSchema, extractValidationErrors } from '../validators/todoValidation';
import { ANIMATIONS, createTransitionString } from '../utils/animationConfig';
import useTodoDrag from '../hooks/useTodoDrag';
import { useError } from './ErrorProvider';

const {
  todo: { dialog: todoDialog }
} = appLocale;

const TodoView = ({ viewMode, showCompleted, onViewModeChange, onShowCompletedChange, onRefresh, onTodoSelect }) => {
  const { t } = useTranslation();
  const { showError, showSuccess } = useError();
  const theme = useTheme();
  const effectiveViewMode = viewMode === 'list' ? 'focus' : viewMode;
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('quadrant');
  const [filterBy, setFilterBy] = useState('all'); // 'all', 'pending', 'completed', 'overdue', 'today'
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, overdue: 0 });

  // 双击完成相关状态
  const [pendingComplete, setPendingComplete] = useState(new Set());
  const [celebratingTodos, setCelebratingTodos] = useState(new Set());

  // 多选相关状态
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedTodos, setSelectedTodos] = useState([]);

  // 使用拖放 hook
  const {
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDropQuadrant,
    isDragOver
  } = useTodoDrag(() => {
    loadTodos();
    if (onRefresh) {
      onRefresh();
    }
  });

  // 加载待办事项
  const computeStatsFromList = (list = []) => {
    const total = list.length;
    const completed = list.filter(todo => todo.is_completed || todo.completed).length;
    const pending = total - completed;
    const overdue = list.filter(todo => {
      const isCompleted = todo.is_completed || todo.completed;
      return todo.due_date && !isCompleted && TimeZoneUtils.isOverdue(todo.due_date);
    }).length;
    return { total, completed, pending, overdue };
  };

  const loadTodos = useCallback(async () => {
    try {
      setLoading(true);
      let statsSource = [];
      let nextTodos;
      if (sortBy === 'quadrant') {
        const data = await fetchTodosByQuadrant(showCompleted);
        nextTodos = data || {
          urgent_important: [],
          not_urgent_important: [],
          urgent_not_important: [],
          not_urgent_not_important: []
        };
        statsSource = Object.values(nextTodos).flat();
      } else {
        const data = await fetchTodos({ sortBy, showCompleted });
        if (data && Array.isArray(data.todos)) {
          nextTodos = data.todos;
          statsSource = data.todos;
        } else {
          nextTodos = data || [];
          statsSource = Array.isArray(nextTodos) ? nextTodos : [];
        }
      }

      setTodos(nextTodos);
      setStats(computeStatsFromList(statsSource));
    } catch (error) {
      console.error('加载待办事项失败:', error);
      showError(error, '加载待办事项失败');
      setTodos([]);
      setStats({ total: 0, completed: 0, pending: 0, overdue: 0 });
    } finally {
      setLoading(false);
    }
  }, [sortBy, showCompleted]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  // 切换待办事项完成状态 - 支持双击完成
  const handleToggleTodo = async (todo) => {
    // 如果已经完成，直接切换状态
    if (todo.is_completed) {
      try {
        await toggleTodoComplete(todo.id);
        loadTodos();
        if (onRefresh) {
          onRefresh();
        }
      } catch (error) {
        console.error('更新待办事项失败:', error);
        showError(error, '更新待办事项失败');
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
          try {
            await toggleTodoComplete(todo.id);
            loadTodos();
            if (onRefresh) {
              onRefresh();
            }
          } catch (err) {
            console.error('更新待办事项失败:', err);
            showError(err, '更新待办事项失败');
          }

          // 清除庆祝状态
          setTimeout(() => {
            setCelebratingTodos(prev => {
              const newSet = new Set(prev);
              newSet.delete(todo.id);
              return newSet;
            });
          }, 1000);
        }, 150);

        // 清除待完成状态
        setPendingComplete(prev => {
          const newSet = new Set(prev);
          newSet.delete(todo.id);
          return newSet;
        });
      } catch (error) {
        console.error('更新待办事项失败:', error);
        showError(error, '更新待办事项失败');
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

  const completeTodoInstantly = async (todo) => {
    if (!todo) return;
    try {
      await toggleTodoComplete(todo.id);
      await loadTodos();
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('更新待办事项失败:', error);
      showError(error, '更新待办事项失败');
      throw error;
    }
  };

  const handleFocusTimeLogged = useCallback((updatedTodo) => {
    if (!updatedTodo || !updatedTodo.id) return;

    setTodos((prev) => {
      if (!prev) return prev;

      if (Array.isArray(prev)) {
        return prev.map((todo) => (todo.id === updatedTodo.id ? { ...todo, ...updatedTodo } : todo));
      }

      if (prev && typeof prev === 'object') {
        const next = {};
        Object.keys(prev).forEach((key) => {
          next[key] = prev[key].map((todo) => (todo.id === updatedTodo.id ? { ...todo, ...updatedTodo } : todo));
        });
        return next;
      }

      return prev;
    });
  }, []);

  // 删除待办事项
  const handleDeleteTodo = async (id) => {
    try {
      const success = await deleteTodoAPI(id);
      if (success) {
        loadTodos();
        if (onRefresh) {
          onRefresh();
        }
      }
    } catch (error) {
      console.error('删除待办事项失败:', error);
      showError(error, '删除待办事项失败');
    }
  };
  // 渲染单个待办事项
  const renderTodoItem = (todo) => {
    return (
      <TodoItem
        key={todo.id}
        todo={{
          ...todo,
          completed: todo.is_completed,
          quadrant: todo.is_important && todo.is_urgent ? 1 :
            todo.is_important ? 2 :
              todo.is_urgent ? 3 : 4
        }}
        onToggleComplete={() => handleToggleTodo(todo)}
        variant="quadrant"
        showSecondaryInfo={true}
        compact={false}
        pendingComplete={pendingComplete}
        celebratingTodos={celebratingTodos}
        isMultiSelectMode={multiSelectMode}
        isSelected={selectedTodos.includes(todo.id)}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={(e, todo) => {
          if (multiSelectMode) {
            // 多选模式下的点击处理
            if (selectedTodos.includes(todo.id)) {
              setSelectedTodos(selectedTodos.filter(id => id !== todo.id));
            } else {
              setSelectedTodos([...selectedTodos, todo.id]);
            }
          } else {
            // 正常模式下的点击处理：打开详情对话框
            if (onTodoSelect) {
              onTodoSelect(todo);
            }
          }
        }}
        onContextMenu={(e, todo) => {
          if (multiSelectMode) {
            // 多选模式下的右键处理
            e.preventDefault();
            if (selectedTodos.includes(todo.id)) {
              setSelectedTodos(selectedTodos.filter(id => id !== todo.id));
            } else {
              setSelectedTodos([...selectedTodos, todo.id]);
            }
          } else {
            // 正常模式下的右键处理
            e.preventDefault();
            // 进入多选模式
            setMultiSelectMode(true);
            setSelectedTodos([todo.id]);
          }
        }}
      />
    );
  };

  // 渲染四象限视图 - 重新设计为2x2布局
  const renderQuadrantView = () => {
    if (!todos || typeof todos !== 'object') return null;

    const quadrants = [
      {
        key: 'urgent_important',
        title: t('quadrant.urgentImportant'),
        subtitle: t('quadrant.urgentImportantDesc'),
        color: '#f44336',
        bgGradient: theme.palette.mode === 'dark'
          ? 'linear-gradient(135deg, #2d1b1b 0%, #3d2626 100%)'
          : 'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)',
        icon: <WarningIcon />,
        todos: todos.urgent_important || [],
        isImportant: true,
        isUrgent: true
      },
      {
        key: 'not_urgent_important',
        title: t('quadrant.importantNotUrgent'),
        subtitle: t('quadrant.importantNotUrgentDesc'),
        color: '#ff9800',
        bgGradient: theme.palette.mode === 'dark'
          ? 'linear-gradient(135deg, #2d2419 0%, #3d3122 100%)'
          : 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
        icon: <FlagIcon />,
        todos: todos.not_urgent_important || [],
        isImportant: true,
        isUrgent: false
      },
      {
        key: 'urgent_not_important',
        title: t('quadrant.urgentNotImportant'),
        subtitle: t('quadrant.urgentNotImportantDesc'),
        color: '#2196f3',
        bgGradient: theme.palette.mode === 'dark'
          ? 'linear-gradient(135deg, #1a2332 0%, #243242 100%)'
          : 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
        icon: <FlashOnIcon />,
        todos: todos.urgent_not_important || [],
        isImportant: false,
        isUrgent: true
      },
      {
        key: 'not_urgent_not_important',
        title: t('quadrant.neitherUrgentNorImportant'),
        subtitle: t('quadrant.neitherUrgentNorImportantDesc'),
        color: '#9e9e9e',
        bgGradient: theme.palette.mode === 'dark'
          ? 'linear-gradient(135deg, #262626 0%, #333333 100%)'
          : 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
        icon: <CircleIcon />,
        todos: todos.not_urgent_not_important || [],
        isImportant: false,
        isUrgent: false
      }
    ];

    return (
      <Box sx={{ width: '100%', maxWidth: '1200px', mx: 'auto' }}>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 3,
            '& > *': {
              width: 'calc(50% - 12px)',
              minWidth: 'calc(50% - 12px)',
              maxWidth: 'calc(50% - 12px)',
              flexBasis: 'calc(50% - 12px)'
            }
          }}
        >
          {quadrants.map((quadrant) => (
            <Box
              key={quadrant.key}
              onDragOver={(e) => handleDragOver(e, quadrant.key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDropQuadrant(e, {
                isImportant: quadrant.isImportant,
                isUrgent: quadrant.isUrgent
              })}
            >
              <Card
                elevation={0}
                sx={{
                  height: '400px',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: '8px',
                  background: 'transparent',
                  backdropFilter: 'blur(10px)',
                  backgroundColor: theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.05)'
                    : 'rgba(255, 255, 255, 0.4)',
                  border: `1px solid ${quadrant.color}30`,
                  transition: createTransitionString(ANIMATIONS.hover),
                  '&:hover': {
                    boxShadow: `0 12px 40px ${quadrant.color}30`,
                    backgroundColor: theme.palette.mode === 'dark'
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(255, 255, 255, 0.6)',
                    borderColor: `${quadrant.color}50`
                  },
                  ...(isDragOver(quadrant.key) && {
                    border: `2px solid ${quadrant.color}`,
                    boxShadow: `0 12px 40px ${quadrant.color}50`
                  })
                }}
              >
                <CardHeader
                  avatar={
                    <Avatar
                      sx={{
                        bgcolor: quadrant.color,
                        width: 40,
                        height: 40
                      }}
                    >
                      {quadrant.icon}
                    </Avatar>
                  }
                  title={
                    <Typography variant="h6" sx={{ fontWeight: 600, color: quadrant.color }}>
                      {quadrant.title}
                    </Typography>
                  }
                  subheader={
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {quadrant.subtitle} • {t('quadrant.itemsCount', { count: quadrant.todos.length })}
                    </Typography>
                  }
                  sx={{
                    pb: 1,
                    '& .MuiCardHeader-content': {
                      overflow: 'hidden'
                    }
                  }}
                />

                <CardContent sx={{ flex: 1, pt: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  {quadrant.todos.length === 0 ? (
                    <Box
                      sx={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        color: 'text.secondary'
                      }}
                    >
                      <Box>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          暂无待办事项
                        </Typography>
                        <Typography variant="caption">
                          点击上方按钮添加新任务
                        </Typography>
                      </Box>
                    </Box>
                  ) : (
                    <Box sx={{ flex: 1, overflow: 'auto', pr: 1, ...scrollbar.auto }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {quadrant.todos.map(renderTodoItem)}
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Box>
          ))}
        </Box>
      </Box>
    );
  };

  // 渲染专注视图
  const renderFocusView = () => {
    const flattenTodos = Array.isArray(todos)
      ? todos
      : todos && typeof todos === 'object'
        ? Object.values(todos).flat()
        : [];

    const filteredTodos = flattenTodos.filter((todo) => {
      const completed = todo.completed !== undefined ? Boolean(todo.completed) : Boolean(todo.is_completed);
      if (filterBy === 'pending') return !completed;
      if (filterBy === 'completed') return completed;
      if (filterBy === 'overdue') return todo.due_date && isPast(parseISO(todo.due_date)) && !completed;
      if (filterBy === 'today') return todo.due_date && isToday(parseISO(todo.due_date));
      return true;
    });

    return (
      <FocusModeView
        todos={filteredTodos}
        loading={loading}
        onToggleComplete={completeTodoInstantly}
        onLogFocusTime={addTodoFocusTime}
        onTodoUpdated={handleFocusTimeLogged}
      />
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <Typography color="text.secondary">加载中...</Typography>
      </Box>
    );
  }

  // 处理多选操作
  const handleMultiSelectComplete = async () => {
    try {
      for (const todoId of selectedTodos) {
        await toggleTodoComplete(todoId);
      }
      loadTodos();
      if (onRefresh) {
        onRefresh();
      }
      setMultiSelectMode(false);
      setSelectedTodos([]);
    } catch (error) {
      console.error('批量完成待办事项失败:', error);
      showError(error, '批量完成失败');
    }
  };

  const handleMultiSelectDelete = async () => {
    try {
      for (const todoId of selectedTodos) {
        await deleteTodoAPI(todoId);
      }
      loadTodos();
      if (onRefresh) {
        onRefresh();
      }
      setMultiSelectMode(false);
      setSelectedTodos([]);
    } catch (error) {
      console.error('批量删除待办事项失败:', error);
      showError(error, '批量删除失败');
    }
  };

  // 计算todos总数
  const getTotalTodosCount = () => {
    if (Array.isArray(todos)) {
      return todos.length;
    }
    if (todos && typeof todos === 'object') {
      return Object.values(todos).flat().length;
    }
    return 0;
  };

  // 获取所有todoIds用于全选
  const getAllTodoIds = () => {
    if (Array.isArray(todos)) {
      return todos.map(todo => todo.id);
    }
    if (todos && typeof todos === 'object') {
      return Object.values(todos).flat().map(todo => todo.id);
    }
    return [];
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 多选工具栏 */}
      <MultiSelectToolbar
        visible={multiSelectMode}
        selectedCount={selectedTodos.length}
        totalCount={getTotalTodosCount()}
        itemType="待办事项"
        onSelectAll={() => setSelectedTodos(getAllTodoIds())}
        onSelectNone={() => setSelectedTodos([])}
        onDelete={handleMultiSelectDelete}
        customActions={[
          {
            key: 'complete',
            label: '设为完成',
            onClick: handleMultiSelectComplete,
            icon: <CheckCircleIcon />,
          },
        ]}
        onClose={() => {
          setMultiSelectMode(false);
          setSelectedTodos([]);
        }}
      />

      {/* 主内容区域 */}
      <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
        {effectiveViewMode === 'quadrant' ? renderQuadrantView() : renderFocusView()}
      </Box>
    </Box>
  );
};

// 创建待办事项弹窗组件
export default TodoView;