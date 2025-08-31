import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Paper,
  Chip,
  TextField,
  Checkbox,
  FormControlLabel,
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
import {
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  Flag as FlagIcon,
  FlashOn as FlashOnIcon,
  Circle as CircleIcon
} from '@mui/icons-material';
import { format, isToday, isPast, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import TagInput from './TagInput';

const TodoView = ({ viewMode, showCompleted, onViewModeChange, onShowCompletedChange, showCreateForm, onCreateFormClose, onRefresh, selectedTodo, onTodoSelect }) => {
  const theme = useTheme();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('quadrant');
  const [filterBy, setFilterBy] = useState('all'); // 'all', 'pending', 'completed', 'overdue', 'today'
  const [editingTodo, setEditingTodo] = useState(null);
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, overdue: 0 });

  const [newTodo, setNewTodo] = useState({
    content: '',
    is_important: false,
    is_urgent: false,
    due_date: ''
  });

  // 监听selectedTodo变化，自动打开编辑对话框
  useEffect(() => {
    if (selectedTodo) {
      setEditingTodo(selectedTodo);
    }
  }, [selectedTodo]);

  // 加载待办事项
  const loadTodos = useCallback(async () => {
    try {
      setLoading(true);
      let result;
      if (sortBy === 'quadrant') {
        result = await window.electronAPI.todos.getByQuadrant(showCompleted);
      } else {
        result = await window.electronAPI.todos.getAll({ sortBy, showCompleted });
      }
      
      if (result.success) {
        if (sortBy === 'quadrant') {
          // 四象限数据直接使用
          setTodos(result.data);
        } else {
          // 列表数据使用todos数组
          setTodos(result.data.todos || result.data);
        }
        setStats(result.data.stats || { total: 0, completed: 0, pending: 0, overdue: 0 });
      } else {
        console.error('加载待办事项失败:', result.error);
        if (sortBy === 'quadrant') {
          setTodos({ urgent_important: [], not_urgent_important: [], urgent_not_important: [], not_urgent_not_important: [] });
        } else {
          setTodos([]);
        }
        setStats({ total: 0, completed: 0, pending: 0, overdue: 0 });
      }
    } catch (error) {
      console.error('加载待办事项失败:', error);
      setTodos([]);
      setStats({ total: 0, completed: 0, pending: 0, overdue: 0 });
    } finally {
      setLoading(false);
    }
  }, [sortBy, showCompleted]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  // 切换待办事项完成状态
  const handleToggleTodo = async (id, completed) => {
    try {
      const result = await window.electronAPI.todos.toggleComplete(id);
      if (result.success) {
        loadTodos();
        if (onRefresh) {
          onRefresh();
        }
      } else {
        console.error('更新待办事项失败:', result.error);
      }
    } catch (error) {
      console.error('更新待办事项失败:', error);
    }
  };

  // 删除待办事项
  const handleDeleteTodo = async (id) => {
    try {
      const result = await window.electronAPI.todos.delete(id);
      if (result.success) {
        loadTodos();
      } else {
        console.error('删除待办事项失败:', result.error);
      }
    } catch (error) {
      console.error('删除待办事项失败:', error);
    }
  };

  // 创建新待办事项
  const handleCreateTodo = async () => {
    if (!newTodo.content.trim()) return;
    
    try {
      const result = await window.electronAPI.todos.create({
        content: newTodo.content,
        is_important: newTodo.is_important,
        is_urgent: newTodo.is_urgent,
        due_date: newTodo.due_date || null
      });
      if (result.success) {
        setNewTodo({ content: '', is_important: false, is_urgent: false, due_date: '' });
        if (onCreateFormClose) {
          onCreateFormClose();
        }
        loadTodos();
        if (onRefresh) {
          onRefresh();
        }
      } else {
        console.error('创建待办事项失败:', result.error);
      }
    } catch (error) {
      console.error('创建待办事项失败:', error);
    }
  };

  // 更新待办事项
  const handleUpdateTodo = async (id, updates) => {
    try {
      const result = await window.electronAPI.todos.update(id, updates);
      if (result.success) {
        setEditingTodo(null);
        loadTodos();
        if (onRefresh) {
          onRefresh();
        }
      } else {
        console.error('更新待办事项失败:', result.error);
      }
    } catch (error) {
      console.error('更新待办事项失败:', error);
    }
  };

  // 渲染单个待办事项
  const renderTodoItem = (todo) => {
    const isOverdue = todo.due_date && isPast(parseISO(todo.due_date)) && !todo.is_completed;
    const isDueToday = todo.due_date && isToday(parseISO(todo.due_date));
    
    return (
      <Paper
        key={todo.id}
        elevation={1}
        sx={{
          p: 2,
          mb: 1,
          borderRadius: 2,
          backgroundColor: todo.is_completed ? 'grey.50' : 'background.paper',
          opacity: todo.is_completed ? 0.7 : 1,
          border: isOverdue ? '1px solid' : 'none',
          borderColor: isOverdue ? 'error.main' : 'transparent',
          transition: 'all 0.2s ease',
          '&:hover': {
            elevation: 2,
            transform: 'translateY(-1px)'
          }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Checkbox
            checked={todo.is_completed}
            onChange={(e) => handleToggleTodo(todo.id, e.target.checked)}
            icon={<RadioButtonUncheckedIcon />}
            checkedIcon={<CheckCircleIcon />}
            sx={{ mt: -0.5 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body1"
              sx={{
                textDecoration: todo.is_completed ? 'line-through' : 'none',
                color: todo.is_completed ? 'text.secondary' : 'text.primary',
                wordBreak: 'break-word',
                mb: 0.5
              }}
            >
              {todo.content}
            </Typography>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {todo.is_important && (
                <Chip
                  size="small"
                  label="重要"
                  color="warning"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              )}
              {todo.is_urgent && (
                <Chip
                  size="small"
                  label="紧急"
                  color="error"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              )}
              {todo.due_date && (
                <Chip
                  size="small"
                  icon={<ScheduleIcon sx={{ fontSize: '0.8rem !important' }} />}
                  label={format(parseISO(todo.due_date), 'MM/dd', { locale: zhCN })}
                  color={isOverdue ? 'error' : isDueToday ? 'warning' : 'default'}
                  variant={isOverdue || isDueToday ? 'filled' : 'outlined'}
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              )}
              {todo.tags && todo.tags.split(',').filter(tag => tag.trim()).map((tag, index) => (
                <Chip
                  key={index}
                  size="small"
                  label={tag.trim()}
                  color="primary"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              ))}
            </Box>
          </Box>
          
          {!todo.is_completed && (
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton
                size="small"
                onClick={() => setEditingTodo(todo)}
                sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => handleDeleteTodo(todo.id)}
                sx={{ opacity: 0.7, '&:hover': { opacity: 1, color: 'error.main' } }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
        </Box>
      </Paper>
    );
  };

  // 渲染四象限视图 - 重新设计为2x2布局
  const renderQuadrantView = () => {
    if (!todos || typeof todos !== 'object') return null;
    
    const quadrants = [
      {
        key: 'urgent_important',
        title: '重要且紧急',
        subtitle: '立即处理',
        color: '#f44336',
        bgGradient: theme.palette.mode === 'dark' 
          ? 'linear-gradient(135deg, #2d1b1b 0%, #3d2626 100%)'
          : 'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)',
        icon: <WarningIcon />,
        todos: todos.urgent_important || []
      },
      {
        key: 'not_urgent_important',
        title: '重要不紧急',
        subtitle: '计划安排',
        color: '#ff9800',
        bgGradient: theme.palette.mode === 'dark'
          ? 'linear-gradient(135deg, #2d2419 0%, #3d3122 100%)'
          : 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
        icon: <FlagIcon />,
        todos: todos.not_urgent_important || []
      },
      {
        key: 'urgent_not_important',
        title: '紧急不重要',
        subtitle: '委托他人',
        color: '#2196f3',
        bgGradient: theme.palette.mode === 'dark'
          ? 'linear-gradient(135deg, #1a2332 0%, #243242 100%)'
          : 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
        icon: <FlashOnIcon />,
        todos: todos.urgent_not_important || []
      },
      {
        key: 'not_urgent_not_important',
        title: '不重要不紧急',
        subtitle: '有空再做',
        color: '#9e9e9e',
        bgGradient: theme.palette.mode === 'dark'
          ? 'linear-gradient(135deg, #262626 0%, #333333 100%)'
          : 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
        icon: <CircleIcon />,
        todos: todos.not_urgent_not_important || []
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
            <Box key={quadrant.key}>
              <Card
                elevation={3}
                sx={{
                  height: '400px',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 3,
                  background: quadrant.bgGradient,
                  border: `2px solid ${quadrant.color}20`,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 8px 25px ${quadrant.color}30`
                  }
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
                      {quadrant.subtitle} • {quadrant.todos.length} 项
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
                    <Box sx={{ flex: 1, overflow: 'auto', pr: 1 }}>
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

  // 渲染列表视图
  const renderListView = () => {
    const filteredTodos = Array.isArray(todos) ? todos.filter(todo => {
      if (filterBy === 'pending') return !todo.is_completed;
      if (filterBy === 'completed') return todo.is_completed;
      if (filterBy === 'overdue') return todo.due_date && isPast(parseISO(todo.due_date)) && !todo.is_completed;
      if (filterBy === 'today') return todo.due_date && isToday(parseISO(todo.due_date));
      return true;
    }) : [];

    return (
      <Box sx={{ maxWidth: '800px', mx: 'auto' }}>
        {filteredTodos.length === 0 ? (
          <Box
            sx={{
              textAlign: 'center',
              py: 8,
              color: 'text.secondary'
            }}
          >
            <Typography variant="h6" sx={{ mb: 1 }}>
              暂无待办事项
            </Typography>
            <Typography variant="body2">
              点击上方按钮创建新的待办事项
            </Typography>
          </Box>
        ) : (
          filteredTodos.map(renderTodoItem)
        )}
      </Box>
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <Typography color="text.secondary">加载中...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: theme.palette.mode === 'dark' ? '#121212' : 'grey.50' }}>
      {/* 主内容区域 */}
      <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
        {viewMode === 'quadrant' ? renderQuadrantView() : renderListView()}
      </Box>

      {/* 新建待办事项弹窗 */}
      {showCreateForm && (
        <CreateTodoModal
          todo={newTodo}
          onChange={setNewTodo}
          onSubmit={handleCreateTodo}
          onCancel={() => {
            if (onCreateFormClose) {
              onCreateFormClose();
            }
            setNewTodo({ content: '', is_important: false, is_urgent: false, due_date: '' });
          }}
        />
      )}

      {/* 编辑待办事项弹窗 */}
      {editingTodo && (
        <EditTodoForm
          todo={editingTodo}
          onSave={handleUpdateTodo}
          onCancel={() => {
            setEditingTodo(null);
            if (onTodoSelect) {
              onTodoSelect(null);
            }
          }}
        />
      )}
    </Box>
  );
};

// 编辑待办事项表单组件
const EditTodoForm = ({ todo, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    content: todo.content,
    tags: todo.tags || '',
    is_important: todo.is_important,
    is_urgent: todo.is_urgent,
    due_date: todo.due_date ? todo.due_date.split('T')[0] : ''
  });

  const handleSubmit = () => {
    if (!formData.content.trim()) return;
    onSave(todo.id, formData);
  };

  return (
    <Dialog open={true} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>编辑待办事项</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="待办内容"
          fullWidth
          variant="outlined"
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          sx={{ mb: 2 }}
        />
        
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={formData.is_important}
                onChange={(e) => setFormData({ ...formData, is_important: e.target.checked })}
              />
            }
            label="重要"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={formData.is_urgent}
                onChange={(e) => setFormData({ ...formData, is_urgent: e.target.checked })}
              />
            }
            label="紧急"
          />
        </Box>
        
        <TagInput
          value={formData.tags}
          onChange={(tags) => setFormData({ ...formData, tags })}
          getSuggestions={async (query) => {
            try {
              const result = await window.electronAPI.todos.getTagSuggestions(query);
              return result.success ? result.data : [];
            } catch (error) {
              console.error('获取标签建议失败:', error);
              return [];
            }
          }}
          sx={{ mb: 2 }}
        />
        
        <TextField
          label="截止日期"
          type="date"
          fullWidth
          variant="outlined"
          value={formData.due_date}
          onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
          InputLabelProps={{ shrink: true }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>取消</Button>
        <Button onClick={handleSubmit} variant="contained">保存</Button>
      </DialogActions>
    </Dialog>
  );
};

// 创建待办事项弹窗组件
const CreateTodoModal = ({ todo, onChange, onSubmit, onCancel }) => {
  const handleSubmit = () => {
    if (!todo.content.trim()) return;
    onSubmit();
  };

  return (
    <Dialog open={true} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>新建待办事项</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="待办内容"
          fullWidth
          variant="outlined"
          value={todo.content}
          onChange={(e) => onChange({ ...todo, content: e.target.value })}
          sx={{ mb: 2 }}
        />
        
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={todo.is_important}
                onChange={(e) => onChange({ ...todo, is_important: e.target.checked })}
              />
            }
            label="重要"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={todo.is_urgent}
                onChange={(e) => onChange({ ...todo, is_urgent: e.target.checked })}
              />
            }
            label="紧急"
          />
        </Box>
        
        <TagInput
          value={todo.tags || ''}
          onChange={(tags) => onChange({ ...todo, tags })}
          getSuggestions={async (query) => {
            try {
              const result = await window.electronAPI.todos.getTagSuggestions(query);
              return result.success ? result.data : [];
            } catch (error) {
              console.error('获取标签建议失败:', error);
              return [];
            }
          }}
          sx={{ mb: 2 }}
        />
        
        <TextField
          label="截止日期"
          type="date"
          fullWidth
          variant="outlined"
          value={todo.due_date}
          onChange={(e) => onChange({ ...todo, due_date: e.target.value })}
          InputLabelProps={{ shrink: true }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>取消</Button>
        <Button onClick={handleSubmit} variant="contained">创建</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TodoView;