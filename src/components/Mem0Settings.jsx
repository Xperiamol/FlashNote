import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Divider,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  IconButton,
  Tooltip,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import {
  Memory as MemoryIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon
} from '@mui/icons-material';

const Mem0Settings = () => {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [memories, setMemories] = useState([]);
  const [message, setMessage] = useState(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [migrateDialogOpen, setMigrateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');

  const userId = 'current_user'; // 简化示例，实际应从用户系统获取

  useEffect(() => {
    checkAvailability();
  }, []);

  useEffect(() => {
    if (available) {
      loadMemories();
    }
  }, [selectedCategory, available]);

  const checkAvailability = async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.invoke) {
        const result = await window.electronAPI.invoke('mem0:is-available');
        setAvailable(result?.available || false);
        
        if (result?.available) {
          await loadStats();
          await loadMemories();
        } else {
          setMessage({ 
            type: 'warning', 
            text: 'Mem0 服务未初始化。首次启动时模型需要下载约 22MB，请稍候...' 
          });
        }
      }
    } catch (error) {
      console.error('检查 Mem0 可用性失败:', error);
      setMessage({ type: 'error', text: '检查服务状态失败' });
      setAvailable(false);
    }
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      if (window.electronAPI?.invoke) {
        const result = await window.electronAPI.invoke('mem0:stats', { userId });
        if (result?.success && result?.stats) {
          setStats(result.stats);
        }
      }
    } catch (error) {
      console.error('加载统计信息失败:', error);
      setStats(null);
    }
  };

  const loadMemories = async () => {
    try {
      if (window.electronAPI?.invoke) {
        const options = {
          limit: 200  // 增加到200条,确保能看到笔记内容
        };
        
        // 如果选择了特定类别,添加过滤
        if (selectedCategory !== 'all') {
          options.category = selectedCategory;
        }
        
        const result = await window.electronAPI.invoke('mem0:get', {
          userId,
          options
        });
        
        console.log('[Mem0Settings] 加载记忆结果:', result);
        
        if (result?.success && Array.isArray(result?.memories)) {
          setMemories(result.memories);
          console.log('[Mem0Settings] 成功加载记忆:', result.memories.length, '条');
        } else {
          setMemories([]);
        }
      }
    } catch (error) {
      console.error('加载记忆列表失败:', error);
      setMessage({ type: 'error', text: '加载记忆失败' });
      setMemories([]);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setMessage({ type: 'warning', text: '请输入搜索内容' });
      return;
    }

    setSearching(true);
    try {
      if (window.electronAPI?.invoke) {
        const result = await window.electronAPI.invoke('mem0:search', {
          userId,
          query: searchQuery,
          options: {
            limit: 10,
            threshold: 0.6
          }
        });
        if (result?.success && Array.isArray(result?.results)) {
          setSearchResults(result.results);
          setMessage({ 
            type: 'success', 
            text: `找到 ${result.results.length} 条相关记忆` 
          });
        } else {
          setSearchResults([]);
          setMessage({ type: 'info', text: '未找到相关记忆' });
        }
      }
    } catch (error) {
      console.error('搜索失败:', error);
      setMessage({ type: 'error', text: '搜索失败' });
      setSearchResults([]);
    }
    setSearching(false);
  };

  const handleDeleteMemory = async (memoryId) => {
    try {
      if (window.electronAPI?.invoke) {
        const result = await window.electronAPI.invoke('mem0:delete', { memoryId });
        if (result?.success) {
          setMessage({ type: 'success', text: '记忆已删除' });
          await loadStats();
          await loadMemories();
          // 如果在搜索结果中，也更新搜索结果
          if (Array.isArray(searchResults) && searchResults.length > 0) {
            setSearchResults(searchResults.filter(m => m.id !== memoryId));
          }
        }
      }
    } catch (error) {
      console.error('删除记忆失败:', error);
      setMessage({ type: 'error', text: '删除失败' });
    }
  };

  const handleClearAll = async () => {
    try {
      if (window.electronAPI?.invoke) {
        const result = await window.electronAPI.invoke('mem0:clear', { userId });
        if (result.success) {
          setMessage({ type: 'success', text: '所有记忆已清除' });
          setMemories([]);
          setSearchResults([]);
          await loadStats();
          setClearDialogOpen(false);
        }
      }
    } catch (error) {
      console.error('清除记忆失败:', error);
      setMessage({ type: 'error', text: '清除失败' });
    }
  };

  const handleRefresh = () => {
    checkAvailability();
  };

  const handleMigrateHistoricalData = async () => {
    setLoading(true);
    setMessage({ type: 'info', text: '正在处理笔记和分析数据,请稍候...' });

    try {
      if (window.electronAPI?.invoke) {
        const result = await window.electronAPI.invoke('mem0:migrate-historical');
        if (result?.success) {
          setMessage({
            type: 'success',
            text: `完成!已添加 ${result.memoryCount || 0} 条记忆(包含笔记内容和行为模式)`
          });
          await loadStats();
          await loadMemories();
        } else {
          setMessage({
            type: 'error',
            text: result?.error || '处理失败'
          });
        }
      }
    } catch (error) {
      console.error('迁移历史数据失败:', error);
      setMessage({ type: 'error', text: '处理历史数据时出错' });
    } finally {
      setLoading(false);
      setMigrateDialogOpen(false);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* 消息提示 */}
      {message && (
        <Alert
          severity={message.type}
          onClose={() => setMessage(null)}
          sx={{ mb: 2 }}
        >
          {message.text}
        </Alert>
      )}

      {!available ? (
        <Alert severity="info" icon={<InfoIcon />}>
          <Typography variant="body2" gutterBottom>
            <strong>Mem0 知识记忆功能</strong>
          </Typography>
          <Typography variant="body2">
            首次使用时需要下载语义模型（约 22MB），之后将缓存在本地。
            该服务用于学习用户偏好，提供个性化的 AI 任务规划。
          </Typography>
        </Alert>
      ) : (
        <List>
          {/* 系统状态 */}
          <ListItem>
            <ListItemText
              primary="系统状态"
              secondary="Mem0 智能记忆系统"
            />
            <ListItemSecondaryAction>
              <Chip
                label={available ? '运行中' : '未就绪'}
                color={available ? 'success' : 'default'}
                size="small"
              />
            </ListItemSecondaryAction>
          </ListItem>

          <Divider />

          {/* 统计信息 */}
          {stats && (
            <>
              <ListItem>
                <ListItemText primary="总记忆数" />
                <ListItemSecondaryAction>
                  <Chip label={stats.total || 0} size="small" color="primary" />
                </ListItemSecondaryAction>
              </ListItem>
              {stats.by_category && Object.keys(stats.by_category).length > 0 && (
                <ListItem>
                  <ListItemText primary="分类统计" />
                  <ListItemSecondaryAction>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 400 }}>
                      {Object.entries(stats.by_category).map(([category, count]) => (
                        <Chip
                          key={category}
                          label={`${category}: ${count}`}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </ListItemSecondaryAction>
                </ListItem>
              )}
              <Divider />
            </>
          )}

          {/* 操作按钮 */}
          <ListItem>
            <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={handleRefresh}
                disabled={loading}
              >
                刷新
              </Button>
              <Button
                variant="outlined"
                size="small"
                color="secondary"
                onClick={() => setMigrateDialogOpen(true)}
                disabled={loading}
              >
                导入历史笔记
              </Button>
            </Box>
          </ListItem>

          <Divider />

          {/* 语义搜索 */}
          <ListItem>
            <Box sx={{ width: '100%' }}>
              <Typography variant="subtitle2" gutterBottom>
                语义搜索
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="输入查询内容，例如：紧急任务的处理偏好"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<SearchIcon />}
                  onClick={handleSearch}
                  disabled={searching}
                >
                  搜索
                </Button>
              </Box>
              
              {Array.isArray(searchResults) && searchResults.length > 0 && (
                <Box sx={{ maxHeight: 300, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <List dense disablePadding>
                    {searchResults.map((memory) => (
                      <ListItem key={memory.id} divider>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                            {memory.content}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
                            <Chip
                              label={`${(memory.score * 100).toFixed(0)}%`}
                              size="small"
                              color={memory.score > 0.8 ? 'success' : 'default'}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {formatDate(memory.created_at)}
                            </Typography>
                          </Box>
                        </Box>
                        <ListItemSecondaryAction>
                          <Tooltip title="删除">
                            <IconButton
                              size="small"
                              edge="end"
                              onClick={() => handleDeleteMemory(memory.id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </Box>
          </ListItem>

          <Divider />

          {/* 记忆列表 */}
          <ListItem>
            <Box sx={{ width: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle2">
                  记忆列表 ({Array.isArray(memories) ? memories.length : 0})
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>类别</InputLabel>
                    <Select
                      value={selectedCategory}
                      label="类别"
                      onChange={(e) => setSelectedCategory(e.target.value)}
                    >
                      <MenuItem value="all">全部</MenuItem>
                      <MenuItem value="knowledge">笔记知识</MenuItem>
                      <MenuItem value="task_planning">任务规划</MenuItem>
                      <MenuItem value="note_taking">笔记习惯</MenuItem>
                      <MenuItem value="organization">组织管理</MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    variant="text"
                    color="error"
                    size="small"
                    startIcon={<DeleteIcon />}
                    onClick={() => setClearDialogOpen(true)}
                    disabled={!Array.isArray(memories) || memories.length === 0}
                  >
                    清空
                  </Button>
                </Box>
              </Box>
              
              {!Array.isArray(memories) || memories.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  暂无记忆。使用 AI 任务规划插件时会自动学习您的偏好。
                </Typography>
              ) : (
                <Box sx={{ maxHeight: 400, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <List dense disablePadding>
                    {memories.map((memory) => (
                      <ListItem key={memory.id} divider>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                            {memory.content}
                          </Typography>
                          {memory.metadata && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                              {JSON.stringify(memory.metadata)}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {formatDate(memory.created_at)}
                          </Typography>
                        </Box>
                        <ListItemSecondaryAction>
                          <Tooltip title="删除">
                            <IconButton
                              size="small"
                              edge="end"
                              onClick={() => handleDeleteMemory(memory.id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </Box>
          </ListItem>

          <Divider />

          {/* 技术信息 */}
          <ListItem>
            <Box>
              <Typography variant="subtitle2" gutterBottom color="text.secondary">
                📖 技术说明
              </Typography>
              <Typography variant="body2" color="text.secondary">
                使用 all-MiniLM-L6-v2 模型进行语义编码（384维向量），
                所有数据存储在本地 SQLite 数据库中。
                查询速度：&lt;20ms（10k条记忆以内）
              </Typography>
            </Box>
          </ListItem>
        </List>
      )}

      {/* 清空确认对话框 */}
      <Dialog
        open={clearDialogOpen}
        onClose={() => setClearDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>确认清空所有记忆？</DialogTitle>
        <DialogContent>
          <DialogContentText>
            此操作将删除所有学习的偏好记忆，无法恢复。
            下次使用 AI 任务规划时将重新学习。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>
            取消
          </Button>
          <Button onClick={handleClearAll} color="error" variant="contained">
            确认清空
          </Button>
        </DialogActions>
      </Dialog>

      {/* 导入历史笔记确认对话框 */}
      <Dialog
        open={migrateDialogOpen}
        onClose={() => setMigrateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>导入历史笔记</DialogTitle>
        <DialogContent>
          <DialogContentText>
            这将把你过去90天的所有笔记内容存储为记忆，同时分析待办事项模式。
          </DialogContentText>
          <DialogContentText sx={{ mt: 2 }}>
            每条笔记会创建一个独立记忆，用于语义搜索。此过程可能需要几分钟，确定继续吗？
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMigrateDialogOpen(false)} disabled={loading}>
            取消
          </Button>
          <Button
            onClick={handleMigrateHistoricalData}
            variant="contained"
            color="primary"
            disabled={loading}
          >
            确认导入
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Mem0Settings;
