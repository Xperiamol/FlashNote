import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Tooltip,
  Grid,
  Fade,
  IconButton,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import {
  Circle,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { fetchTodos, toggleTodoComplete } from '../api/todoAPI';

const CalendarView = ({ currentDate, onDateChange, onTodoSelect, selectedDate, onSelectedDateChange, refreshToken = 0, showCompleted = false, onShowCompletedChange, onTodoUpdated }) => {
  const theme = useTheme();
  const [todos, setTodos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingComplete, setPendingComplete] = useState(new Set());
  const [celebratingTodos, setCelebratingTodos] = useState(new Set());

  // 获取当月的所有Todo
  const loadTodos = async () => {
    setIsLoading(true);
    try {
      const data = await fetchTodos({ includeCompleted: showCompleted });
      const normalizedTodos = (data || []).map(todo => ({
        ...todo,
        completed: Boolean(todo.completed ?? todo.is_completed)
      }));
      setTodos(normalizedTodos);
    } catch (error) {
      console.error('获取Todo失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理todo完成状态切换
  const handleToggleComplete = async (todo) => {
    // 已完成的任务直接切换状态
    if (todo.completed) {
      try {
        await toggleTodoComplete(todo.id);
        loadTodos();
        // 触发全局刷新
        if (onTodoUpdated) {
          onTodoUpdated();
        }
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
          await toggleTodoComplete(todo.id);
          loadTodos();
          // 触发全局刷新
          if (onTodoUpdated) {
            onTodoUpdated();
          }
          
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

  useEffect(() => {
    loadTodos();
  }, [currentDate, refreshToken, showCompleted]);

  // 获取当月的日期数组
  const getCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // 获取当月第一天和最后一天
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // 获取第一天是星期几（0=周日，1=周一...）
    const firstDayOfWeek = firstDay.getDay();
    
    // 计算需要显示的天数（包括上月末尾和下月开头）
    const daysInMonth = lastDay.getDate();
    const totalDays = Math.ceil((daysInMonth + firstDayOfWeek) / 7) * 7;
    
    const days = [];
    
    // 添加上月末尾的日期
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: false
      });
    }
    
    // 添加当月的日期
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      
      days.push({
        date,
        isCurrentMonth: true,
        isToday
      });
    }
    
    // 添加下月开头的日期
    const remainingDays = totalDays - days.length;
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: false
      });
    }
    
    return days;
  };

  // 获取指定日期的Todo
  const getTodosForDate = (date) => {
    if (!todos.length) return [];
    
    return todos.filter(todo => {
      if (!todo.due_date) return false;
      
      const todoDate = new Date(todo.due_date);
      return todoDate.toDateString() === date.toDateString();
    });
  };

  // 获取Todo的优先级颜色
  const getTodoPriorityColor = (todo) => {
    if (todo.is_important && todo.is_urgent) {
      return theme.palette.error.main; // 重要且紧急 - 红色
    } else if (todo.is_important) {
      return theme.palette.warning.main; // 重要不紧急 - 橙色
    } else if (todo.is_urgent) {
      return theme.palette.info.main; // 不重要紧急 - 蓝色
    } else {
      return theme.palette.text.secondary; // 不重要不紧急 - 灰色
    }
  };

  const calendarDays = getCalendarDays();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: { xs: 1, sm: 2 }, // 小屏幕减少内边距
        overflow: 'hidden'
      }}
    >

      {/* 日历容器 - 支持水平滚动 */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          minWidth: 0
        }}
      >
        {/* 星期标题 */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(80px, 1fr))', // 设置最小列宽
            gap: 0,
            mb: 2,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
            overflow: 'hidden',
            minWidth: '560px' // 7列 * 80px = 560px 最小宽度
          }}
        >
          {weekDays.map((day, index) => (
            <Box
              key={day}
              sx={{
                textAlign: 'center',
                py: 1.5,
                backgroundColor: theme.palette.mode === 'dark' 
                  ? theme.palette.grey[800] 
                  : theme.palette.grey[50],
                borderRight: index < 6 ? `1px solid ${theme.palette.divider}` : 'none'
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  color: theme.palette.text.primary,
                  fontWeight: 600,
                  fontSize: { xs: '0.75rem', sm: '0.875rem' } // 小屏幕字体更小
                }}
              >
                {day}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* 日历网格 */}
        <Box 
          sx={{ 
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
            overflow: 'hidden'
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(80px, 1fr))', // 设置最小列宽
              gridTemplateRows: `repeat(${Math.ceil(calendarDays.length / 7)}, minmax(100px, auto))`,
              minWidth: '560px', // 确保最小宽度
              width: '100%'
            }}
          >
          {calendarDays.map((dayInfo, index) => {
            const dayTodos = getTodosForDate(dayInfo.date);
            const incompleteTodos = dayTodos.filter(todo => !todo.completed);
            const todosToDisplay = showCompleted ? dayTodos : incompleteTodos;

            return (
              <Box
                  key={index}
                  sx={{
                    borderRight: index % 7 < 6 ? `1px solid ${theme.palette.divider}` : 'none',
                    borderBottom: index < calendarDays.length - 7 ? `1px solid ${theme.palette.divider}` : 'none',
                    minHeight: '100px',
                    position: 'relative',
                    overflow: 'hidden', // 防止内容溢出
                    minWidth: 0 // 确保可以收缩
                  }}
                >
                <Box
                  onClick={() => {
                    onSelectedDateChange(dayInfo.date);
                    if (onDateChange) {
                      onDateChange(dayInfo.date);
                    }
                  }}
                  sx={{
                    height: '100%',
                    p: 1.5,
                    backgroundColor: dayInfo.isCurrentMonth 
                      ? (dayInfo.isToday 
                          ? theme.palette.primary.light + '15' // 今天的浅色底色
                          : (selectedDate && dayInfo.date.toDateString() === selectedDate.toDateString() 
                              ? theme.palette.primary.light + '20' 
                              : 'transparent'))
                      : theme.palette.action.hover,
                    border: dayInfo.isToday 
                      ? `2px solid ${theme.palette.primary.main}` 
                      : (selectedDate && dayInfo.date.toDateString() === selectedDate.toDateString()
                          ? `2px solid ${theme.palette.primary.main}`
                          : 'none'),
                    borderRadius: (dayInfo.isToday || (selectedDate && dayInfo.date.toDateString() === selectedDate.toDateString())) ? 1 : 0,
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      backgroundColor: theme.palette.action.hover
                    },
                    overflow: 'hidden', // 防止内容溢出
                    minWidth: 0 // 确保可以收缩
                  }}
                >
                  {/* 日期数字 */}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        color: dayInfo.isCurrentMonth 
                          ? (dayInfo.isToday ? theme.palette.primary.main : theme.palette.text.primary)
                          : theme.palette.text.disabled,
                        fontWeight: dayInfo.isToday ? 700 : dayInfo.isCurrentMonth ? 500 : 400,
                        fontSize: '0.9rem'
                      }}
                    >
                      {dayInfo.date.getDate()}
                    </Typography>
                    
                    {/* 显示Todo数量指示器 */}
                    {incompleteTodos.length > 0 && (
                      <Box
                        sx={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          backgroundColor: theme.palette.primary.main,
                          color: theme.palette.primary.contrastText,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.7rem',
                          fontWeight: 600
                        }}
                      >
                        {incompleteTodos.length}
                      </Box>
                    )}
                  </Box>

                  {/* Todo列表 */}
                  <Box 
                    sx={{ 
                      flex: 1,
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                      maxHeight: '72px', // 3行 * 24px高度
                      pr: 0.5,
                      '&::-webkit-scrollbar': {
                        width: '4px',
                      },
                      '&::-webkit-scrollbar-track': {
                        background: 'transparent',
                      },
                      '&::-webkit-scrollbar-thumb': {
                        background: theme.palette.divider,
                        borderRadius: '2px',
                      },
                    }}
                  >
                    {todosToDisplay.map((todo) => (
                      <Fade key={todo.id} in timeout={300}>
                        <Tooltip title={todo.content} placement="top">
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              p: 0.5,
                              borderRadius: 1,
                              backgroundColor: `${getTodoPriorityColor(todo)}15`,
                              border: `1px solid ${getTodoPriorityColor(todo)}30`,
                              cursor: 'pointer',
                              position: 'relative',
                              overflow: 'hidden',
                              transition: 'all 0.2s ease-in-out',
                              minHeight: '22px', // 固定最小高度
                              '&:hover': {
                                backgroundColor: `${getTodoPriorityColor(todo)}40`, // 颜色变暗
                              },
                              '&:active': {
                                backgroundColor: `${getTodoPriorityColor(todo)}50`, // 点击时更暗
                              },
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
                            {/* 完成状态按钮 */}
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleComplete(todo);
                              }}
                              sx={{
                                minWidth: 20,
                                width: 20,
                                height: 20,
                                mr: 0.5,
                                p: 0,
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
                                <CheckCircleIcon sx={{ color: 'success.main', fontSize: 16 }} />
                              ) : pendingComplete.has(todo.id) ? (
                                <RadioButtonUncheckedIcon 
                                  sx={{ 
                                    color: 'warning.main',
                                    fontSize: 16,
                                    animation: 'pulse 1s infinite'
                                  }} 
                                />
                              ) : celebratingTodos.has(todo.id) ? (
                                <CheckCircleIcon 
                                  sx={{ 
                                    color: 'success.main',
                                    fontSize: 16,
                                    filter: 'drop-shadow(0 0 8px rgba(76, 175, 80, 0.6))'
                                  }} 
                                />
                              ) : (
                                <RadioButtonUncheckedIcon sx={{ color: 'text.secondary', fontSize: 16 }} />
                              )}
                            </IconButton>

                            {/* Todo内容 */}
                            <Box
                              onClick={() => {
                                if (onTodoSelect) {
                                  onTodoSelect(todo);
                                }
                              }}
                              sx={{
                                flex: 1,
                                minWidth: 0,
                                zIndex: 2
                              }}
                            >
                              <Typography
                                variant="caption"
                                sx={{
                                  display: 'block',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  fontSize: '0.65rem', // 更小的字体
                                  lineHeight: 1.1,
                                  textDecoration: todo.completed ? 'line-through' : 'none',
                                  opacity: todo.completed ? 0.6 : 1,
                                  color: theme.palette.text.primary
                                }}
                              >
                                {todo.content}
                              </Typography>
                            </Box>
                          </Box>
                        </Tooltip>
                      </Fade>
                    ))}
                    
                    {/* 显示剩余Todo数量 */}
                  </Box>
                </Box>
              </Box>
            );
          })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default CalendarView;