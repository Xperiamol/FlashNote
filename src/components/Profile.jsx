import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Avatar,
  Button,
  Chip,
  LinearProgress,
  Alert,
  Stack
} from '@mui/material';
import {
  Person as PersonIcon,
  Notes as NotesIcon,
  CheckCircle as CheckCircleIcon,
  Extension as ExtensionIcon,
  Today as TodayIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { useStore } from '../store/useStore';
import { fetchTodoStats } from '../api/todoAPI';
import { fetchInstalledPlugins } from '../api/pluginAPI';
import { createTransitionString, ANIMATIONS } from '../utils/animationConfig';

const Profile = () => {
  const { notes, userAvatar, theme, primaryColor } = useStore();
  const [todoStats, setTodoStats] = useState(null);
  const [installedPlugins, setInstalledPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        setError(null);

        // 获取待办事项统计
        const todoStatsResult = await fetchTodoStats();
        console.log('[Profile] 待办统计结果:', todoStatsResult);
        
        // invoke函数会自动解包数据，直接返回stats对象
        if (todoStatsResult && typeof todoStatsResult === 'object') {
          console.log('[Profile] 待办总数:', todoStatsResult.total);
          console.log('[Profile] 已完成:', todoStatsResult.completed);
          console.log('[Profile] 进行中:', todoStatsResult.pending);
          console.log('[Profile] 逾期:', todoStatsResult.overdue);
          console.log('[Profile] 今日到期:', todoStatsResult.dueToday);
          setTodoStats(todoStatsResult);
        } else {
          console.error('[Profile] 待办统计数据格式错误:', todoStatsResult);
          // 设置默认值
          setTodoStats({
            total: 0,
            completed: 0,
            pending: 0,
            overdue: 0,
            dueToday: 0
          });
        }

        // 获取已安装插件
        const pluginsResult = await fetchInstalledPlugins();
        console.log('[Profile] 插件列表:', pluginsResult);
        if (Array.isArray(pluginsResult)) {
          setInstalledPlugins(pluginsResult);
        }

      } catch (err) {
        console.error('[Profile] 加载统计数据失败:', err);
        setError('加载统计数据失败: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  // 计算笔记统计
  const noteStats = {
    total: notes.length,
    deleted: notes.filter(note => note.is_deleted).length,
    pinned: notes.filter(note => note.is_pinned && !note.is_deleted).length,
    active: notes.filter(note => !note.is_deleted).length
  };

  // 计算待办事项统计
  const todoStatsDisplay = todoStats || {
    total: 0,
    completed: 0,
    pending: 0,
    overdue: 0,
    dueToday: 0
  };

  const completionRate = todoStatsDisplay.total > 0
    ? Math.round((todoStatsDisplay.completed / todoStatsDisplay.total) * 100)
    : 0;

  if (loading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <LinearProgress sx={{ width: '100%', maxWidth: 400 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto', height: '100%', overflow: 'auto' }}>
      {/* 头部信息 */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        mb: 3,
        p: 3,
        borderRadius: 2,
        background: theme === 'dark'
          ? 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)'
          : 'linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%)',
        border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`
      }}>
        <Avatar
          sx={{
            width: 80,
            height: 80,
            mr: 3,
            bgcolor: primaryColor,
            fontSize: '2rem'
          }}
          src={userAvatar}
        >
          <PersonIcon fontSize="large" />
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>
            个人资料
          </Typography>
          <Typography variant="body1" color="text.secondary">
            查看您的使用统计和个人设置
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<EditIcon />}
          sx={{
            transition: createTransitionString(ANIMATIONS.button),
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: 2
            }
          }}
        >
          编辑资料
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* 瀑布流布局 - 使用 CSS columns */}
      <Box
        sx={{
          columnCount: {
            xs: 1,
            sm: 2,
            md: 3,
            lg: 4
          },
          columnGap: 3,
          '& > *': {
            breakInside: 'avoid',
            marginBottom: 3
          }
        }}
      >
        {/* 笔记统计卡片 */}
        <Card sx={{
          transition: createTransitionString(ANIMATIONS.card),
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: 4
          }
        }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <NotesIcon sx={{ fontSize: 32, color: primaryColor, mr: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                笔记统计
              </Typography>
            </Box>
            <Typography variant="h3" sx={{ mb: 2, fontWeight: 600, color: primaryColor }}>
              {noteStats.active}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              活跃笔记
            </Typography>
            <Stack spacing={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">总笔记数</Typography>
                <Chip label={noteStats.total} size="small" variant="outlined" />
              </Box>
              {noteStats.pinned > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">置顶笔记</Typography>
                  <Chip label={noteStats.pinned} size="small" color="primary" />
                </Box>
              )}
              {noteStats.deleted > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">已删除</Typography>
                  <Chip label={noteStats.deleted} size="small" color="error" />
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* 待办事项统计卡片 */}
        <Card sx={{
          transition: createTransitionString(ANIMATIONS.card),
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: 4
          }
        }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 32, color: 'success.main', mr: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                待办事项
              </Typography>
            </Box>
            <Typography variant="h3" sx={{ mb: 2, fontWeight: 600, color: 'success.main' }}>
              {todoStatsDisplay.total}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              总待办数
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption">完成率</Typography>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {completionRate}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={completionRate}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  bgcolor: 'grey.200',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: 'success.main',
                    borderRadius: 4
                  }
                }}
              />
            </Box>
            <Stack spacing={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">已完成</Typography>
                <Chip label={todoStatsDisplay.completed} size="small" color="success" />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">进行中</Typography>
                <Chip label={todoStatsDisplay.pending} size="small" color="warning" />
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* 今日待办卡片 */}
        <Card sx={{
          transition: createTransitionString(ANIMATIONS.card),
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: 4
          }
        }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <TodayIcon sx={{ fontSize: 32, color: 'info.main', mr: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                今日待办
              </Typography>
            </Box>
            <Typography variant="h3" sx={{ mb: 2, fontWeight: 600, color: 'info.main' }}>
              {todoStatsDisplay.dueToday}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              今日到期待办
            </Typography>
            {todoStatsDisplay.dueToday > 0 ? (
              <Chip
                label="需要关注"
                size="small"
                color="info"
                variant="filled"
                sx={{ width: '100%' }}
              />
            ) : (
              <Chip
                label="暂无待办"
                size="small"
                variant="outlined"
                sx={{ width: '100%' }}
              />
            )}
          </CardContent>
        </Card>

        {/* 逾期待办卡片 */}
        <Card sx={{
          transition: createTransitionString(ANIMATIONS.card),
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: 4
          }
        }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <WarningIcon sx={{ fontSize: 32, color: 'error.main', mr: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                逾期待办
              </Typography>
            </Box>
            <Typography variant="h3" sx={{ mb: 2, fontWeight: 600, color: 'error.main' }}>
              {todoStatsDisplay.overdue}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              需要处理的逾期待办
            </Typography>
            {todoStatsDisplay.overdue > 0 ? (
              <Chip
                label="紧急处理"
                size="small"
                color="error"
                variant="filled"
                sx={{ width: '100%' }}
              />
            ) : (
              <Chip
                label="无逾期"
                size="small"
                color="success"
                variant="outlined"
                sx={{ width: '100%' }}
              />
            )}
          </CardContent>
        </Card>

        {/* 插件统计卡片 */}
        <Card sx={{
          transition: createTransitionString(ANIMATIONS.card),
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: 4
          }
        }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <ExtensionIcon sx={{ fontSize: 32, color: primaryColor, mr: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                已安装插件
              </Typography>
            </Box>
            <Typography variant="h3" sx={{ mb: 2, fontWeight: 600, color: primaryColor }}>
              {installedPlugins.length}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              扩展应用功能
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {installedPlugins.slice(0, 3).map((plugin) => (
                <Chip
                  key={plugin.id}
                  label={plugin.manifest?.name || plugin.id}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem' }}
                />
              ))}
              {installedPlugins.length > 3 && (
                <Chip
                  label={`+${installedPlugins.length - 3}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
            </Box>
          </CardContent>
        </Card>

        {/* 使用概览卡片 */}
        <Card sx={{
          transition: createTransitionString(ANIMATIONS.card),
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: 4
          }
        }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <TrendingUpIcon sx={{ fontSize: 32, color: 'success.main', mr: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                使用概览
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              您的生产力数据
            </Typography>
            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">笔记创建</Typography>
                <Typography variant="h6" sx={{ fontWeight: 600, color: primaryColor }}>
                  {noteStats.total}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">任务完成</Typography>
                <Typography variant="h6" sx={{ fontWeight: 600, color: 'success.main' }}>
                  {todoStatsDisplay.completed}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">插件使用</Typography>
                <Typography variant="h6" sx={{ fontWeight: 600, color: primaryColor }}>
                  {installedPlugins.length}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* 笔记详细信息卡片 */}
        <Card sx={{
          transition: createTransitionString(ANIMATIONS.card),
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: 4
          }
        }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
              <NotesIcon sx={{ mr: 1, color: primaryColor }} />
              笔记详情
            </Typography>
            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">总笔记数</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{noteStats.total}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">活跃笔记</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{noteStats.active}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">置顶笔记</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{noteStats.pinned}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">已删除</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{noteStats.deleted}</Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* 待办详细信息卡片 */}
        <Card sx={{
          transition: createTransitionString(ANIMATIONS.card),
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: 4
          }
        }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
              <CheckCircleIcon sx={{ mr: 1, color: 'success.main' }} />
              待办详情
            </Typography>
            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">总任务数</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{todoStatsDisplay.total}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">已完成</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{todoStatsDisplay.completed}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">进行中</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{todoStatsDisplay.pending}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">今日到期</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{todoStatsDisplay.dueToday}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">已逾期</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{todoStatsDisplay.overdue}</Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};

export default Profile;
