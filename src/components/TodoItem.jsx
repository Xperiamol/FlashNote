import React from 'react';
import {
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  IconButton,
  Typography,
  Chip,
  Box,
  Tooltip,
  Checkbox,
  Paper
} from '@mui/material';
import {
  CheckCircle,
  Circle,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { 
  getPriorityFromQuadrant, 
  getPriorityIcon, 
  getPriorityColor, 
  getPriorityText 
} from '../utils/priorityUtils';

/**
 * 获取Todo优先级颜色
 */
const getTodoPriorityColor = (todo) => {
  if (todo.quadrant === 1) return '#f44336'; // 紧急重要 - 红色
  if (todo.quadrant === 2) return '#ff9800'; // 重要不紧急 - 橙色
  if (todo.quadrant === 3) return '#2196f3'; // 紧急不重要 - 蓝色
  if (todo.quadrant === 4) return '#4caf50'; // 不紧急不重要 - 绿色
  return '#9e9e9e'; // 默认灰色
};

/**
 * 获取优先级标签
 */
const getPriorityLabel = (todo) => {
  const priority = getPriorityFromQuadrant(todo.quadrant);
  return {
    label: getPriorityText(priority),
    color: getPriorityColor(priority),
    icon: getPriorityIcon(priority)
  };
};

/**
 * 格式化时间显示
 */
const formatTime = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return format(date, 'HH:mm', { locale: zhCN });
  } catch (error) {
    return '';
  }
};

/**
 * 可复用的TodoItem组件
 * 支持不同的显示模式和交互方式
 */
const TodoItem = ({
  todo,
  onToggleComplete,
  onClick,
  onContextMenu,
  pendingComplete = new Set(),
  celebratingTodos = new Set(),
  isMultiSelectMode = false,
  isSelected = false,
  showSecondaryInfo = true,
  compact = false,
  variant = 'default' // 'default', 'calendar', 'mydaypanel'
}) => {
  const theme = useTheme();
  
  // 根据不同变体确定是否已完成
  const isCompleted = todo.completed || todo.is_completed;
  
  // 优先级信息
  const priority = getPriorityLabel(todo);
  const dueTime = formatTime(todo.due_date);

  // 根据变体调整样式
  const getItemStyles = () => {
    const baseStyles = {
      py: compact ? 1 : 1.5,
      px: 2,
      position: 'relative',
      overflow: 'hidden',
      '&:hover': {
        backgroundColor: theme.palette.action.hover
      },
      opacity: isCompleted ? 0.6 : 1
    };

    // 庆祝动画样式
    if (celebratingTodos.has(todo.id)) {
      baseStyles['&::before'] = {
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
      };
      baseStyles['@keyframes greenSweep'] = {
        '0%': {
          transform: 'translateX(-100%)'
        },
        '100%': {
          transform: 'translateX(0%)'
        }
      };
    }

    return baseStyles;
  };

  // 渲染完成状态图标
  const renderCompletionIcon = () => {
    const iconProps = {
      size: "small",
      onClick: (e) => {
        e.stopPropagation();
        onToggleComplete(todo);
      },
      sx: {
        color: isCompleted
          ? theme.palette.success.main
          : getTodoPriorityColor(todo),
        ...(pendingComplete.has(todo.id) && {
          transform: 'scale(1.1)',
          transition: 'transform 0.1s ease-in-out'
        })
      }
    };

    // MyDayPanel 变体使用双击
    if (variant === 'mydaypanel') {
      iconProps.onDoubleClick = iconProps.onClick;
    }

    const icon = isCompleted ? <CheckCircle /> : <Circle />;
    
    return (
      <Tooltip title={isCompleted ? '标记为未完成' : '标记为完成'}>
        <IconButton {...iconProps}>
          {icon}
        </IconButton>
      </Tooltip>
    );
  };

  // TodoList 变体的复杂图标渲染
  const renderTodoListIcon = () => {
    return (
      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete(todo);
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
        {isCompleted ? (
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
    );
  };

  // 渲染主要内容
  const renderContent = () => {
    return (
      <ListItemText
        primary={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: showSecondaryInfo ? 0.5 : 0 }}>
            <Typography
              variant="body2"
              sx={{
                textDecoration: isCompleted ? 'line-through' : 'none',
                color: isCompleted
                  ? theme.palette.text.disabled
                  : theme.palette.text.primary,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0
              }}
            >
              {todo.content}
            </Typography>
            
            {showSecondaryInfo && (
              <Chip
                size="small"
                label={priority.label}
                sx={{
                  backgroundColor: `${priority.color}20`,
                  color: priority.color,
                  fontSize: '0.7rem',
                  height: 20,
                  '& .MuiChip-label': {
                    px: 1
                  }
                }}
              />
            )}
          </Box>
        }
        secondary={
          showSecondaryInfo && dueTime && (
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.text.secondary,
                fontSize: '0.7rem'
              }}
            >
              {dueTime}
            </Typography>
          )
        }
      />
    );
  };

  // 根据变体选择不同的渲染方式
  if (variant === 'calendar') {
    // 日历视图的简化版本
    return (
      <Box
        onClick={() => onClick && onClick(todo)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 0.5,
          borderRadius: 1,
          cursor: 'pointer',
          ...getItemStyles()
        }}
      >
        {renderCompletionIcon()}
        <Typography
          variant="caption"
          sx={{
            flex: 1,
            textDecoration: isCompleted ? 'line-through' : 'none',
            color: isCompleted ? theme.palette.text.disabled : theme.palette.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {todo.content}
        </Typography>
      </Box>
    );
  }

  if (variant === 'quadrant') {
    // 四象限视图的Paper版本
    const isOverdue = todo.due_date && new Date(todo.due_date) < new Date() && !isCompleted;
    const isDueToday = todo.due_date && new Date(todo.due_date).toDateString() === new Date().toDateString();

    return (
      <Paper
        elevation={1}
        sx={{
          p: 2,
          borderRadius: 2,
          backgroundColor: isCompleted ? 'grey.50' : 'background.paper',
          border: isOverdue ? '1px solid' : 'none',
          borderColor: isOverdue ? 'error.main' : 'transparent',
          transition: 'all 0.2s ease',
          cursor: 'pointer',
          '&:hover': {
            elevation: 2,
            transform: 'translateY(-1px)'
          },
          ...getItemStyles()
        }}
        onClick={() => onClick && onClick(todo)}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          {renderTodoListIcon()}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body1"
              sx={{
                textDecoration: isCompleted ? 'line-through' : 'none',
                color: isCompleted ? 'text.secondary' : 'text.primary',
                wordBreak: 'break-word',
                mb: showSecondaryInfo ? 0.5 : 0
              }}
            >
              {todo.content}
            </Typography>
            
            {showSecondaryInfo && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  label={priority.label}
                  sx={{
                    backgroundColor: `${priority.color}20`,
                    color: priority.color,
                    fontSize: '0.7rem',
                    height: 20
                  }}
                />
                {dueTime && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: theme.palette.text.secondary,
                      fontSize: '0.7rem'
                    }}
                  >
                    {dueTime}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Paper>
    );
  }

  // 默认的 ListItem 渲染
  const content = (
    <>
      {isMultiSelectMode && (
        <ListItemIcon sx={{ minWidth: 40 }}>
          <Checkbox
            checked={isSelected}
            size="small"
            sx={{ p: 0.5 }}
          />
        </ListItemIcon>
      )}
      <ListItemIcon sx={{ minWidth: variant === 'mydaypanel' ? 36 : 40 }}>
        {variant === 'default' ? renderTodoListIcon() : renderCompletionIcon()}
      </ListItemIcon>
      {renderContent()}
    </>
  );

  // 如果有点击或右键菜单处理，使用 ListItemButton
  if (onClick || onContextMenu) {
    return (
      <ListItem sx={getItemStyles()}>
        <ListItemButton
          onClick={(e) => onClick && onClick(e, todo)}
          onContextMenu={(e) => onContextMenu && onContextMenu(e, todo)}
          sx={{ py: compact ? 1 : 1.5 }}
        >
          {content}
        </ListItemButton>
      </ListItem>
    );
  }

  // 简单的 ListItem
  return (
    <ListItem sx={getItemStyles()}>
      {content}
    </ListItem>
  );
};

export default TodoItem;