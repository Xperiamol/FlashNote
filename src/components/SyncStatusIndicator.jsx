import React, { useState, useEffect } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  CircularProgress,
  Popover,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  Alert,
  Divider,
  Badge
} from '@mui/material';
import {
  Cloud as CloudIcon,
  CloudDone as CloudDoneIcon,
  CloudOff as CloudOffIcon,
  Sync as SyncIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  PriorityHigh as ExclamationIcon
} from '@mui/icons-material';
import { useStore } from '../store/useStore';

/**
 * 同步状态指示器组件
 * 显示云同步和日历同步的实时状态
 */
const SyncStatusIndicator = () => {
  // 从store获取loadNotes函数，用于同步后刷新笔记
  const loadNotes = useStore(state => state.loadNotes);
  const loadTodos = useStore(state => state.loadTodos);
  
  // 云存储同步状态
  const [syncStatus, setSyncStatus] = useState({
    isEnabled: false,
    isSyncing: false,
    lastSyncTime: null,
    error: null,
    syncIntervalMinutes: null,
    stats: {
      pushed: 0,
      pulled: 0,
      conflicts: 0
    }
  });

  // 日历同步状态
  const [calendarStatus, setCalendarStatus] = useState({
    type: null, // 'caldav' | 'google' | null
    isEnabled: false,
    isSyncing: false,
    lastSyncTime: null,
    error: null,
    syncIntervalMinutes: null
  });

  const [anchorEl, setAnchorEl] = useState(null);

  useEffect(() => {
    // 获取初始状态
    loadSyncStatus();
    loadCalendarStatus();

    // 监听云同步事件
    const removeStartListener = window.electronAPI?.sync?.onSyncStart?.(() => {
      // 注意：不清除error，让错误保留直到同步真正成功
      // 这样用户可以看到上次同步失败的原因，即使开始了新的同步
      setSyncStatus(prev => ({ ...prev, isSyncing: true }));
    });

    const removeCompleteListener = window.electronAPI?.sync?.onSyncComplete?.((result) => {
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: new Date(),
        stats: {
          pushed: result.localChanges || 0,
          pulled: result.remoteChanges || 0,
          conflicts: result.conflicts || 0
        },
        error: null  // 只有真正成功才清除错误
      }));
      console.log('[SyncStatusIndicator] 同步成功，清除错误状态');
      
      // 如果有远程更改，刷新笔记和待办列表
      if (result.remoteChanges > 0) {
        console.log('[SyncStatusIndicator] 检测到远程更改，刷新数据列表');
        loadNotes?.();
        loadTodos?.();
      }
    });

    const removeErrorListener = window.electronAPI?.sync?.onSyncError?.((error) => {
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        error: error.message || '同步失败'
        // 注意：不更新 lastSyncTime，只有成功的同步才更新
      }));
    });

    // 定期刷新状态
    const interval = setInterval(() => {
      loadSyncStatus();
      loadCalendarStatus();
    }, 30000); // 每30秒刷新

    return () => {
      removeStartListener?.();
      removeCompleteListener?.();
      removeErrorListener?.();
      clearInterval(interval);
    };
  }, []);

  const loadSyncStatus = async () => {
    try {
      const response = await window.electronAPI?.sync?.getStatus?.();
      console.log('[SyncStatusIndicator] getStatus response:', response); // 调试日志
      
      // 后端返回格式：{ hasActiveService, activeService, status: { isEnabled, isSyncing, ... } }
      if (response && response.hasActiveService && response.status) {
        setSyncStatus(prev => {
          // 如果前端有错误且后端没有错误，保留前端的错误
          // 因为后端可能没有持久化错误状态
          const shouldKeepError = prev.error && !response.status.error && !response.status.isSyncing;

          const nextSyncIntervalMinutes = (() => {
            const raw = response.status?.config?.syncInterval;
            const n = parseInt(raw, 10);
            return Number.isFinite(n) && n > 0 ? n : prev.syncIntervalMinutes;
          })();
          
          return {
            ...prev,
            isEnabled: response.status.isEnabled || false,
            isSyncing: response.status.isSyncing || false,
            lastSyncTime: response.status.lastSyncTime ? new Date(response.status.lastSyncTime) : prev.lastSyncTime,
            error: shouldKeepError ? prev.error : (response.status.error || null),
            syncIntervalMinutes: nextSyncIntervalMinutes
          };
        });
      } else {
        // 没有活跃服务时，标记为未启用
        setSyncStatus(prev => ({
          ...prev,
          isEnabled: false,
          isSyncing: false,
          error: null,
          syncIntervalMinutes: null
        }));
      }
    } catch (error) {
      console.error('加载同步状态失败:', error);
    }
  };

  const loadCalendarStatus = async () => {
    try {
      // 检查 CalDAV
      const caldavConfig = await window.electronAPI?.invoke?.('caldav:get-config');
      if (caldavConfig?.success && caldavConfig.data.enabled) {
        const caldavStatus = await window.electronAPI?.invoke?.('caldav:get-status');
        const intervalMinutes = (() => {
          const n = parseInt(caldavConfig?.data?.syncInterval, 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        })();
        setCalendarStatus(prev => {
          // 如果前端有错误且后端没有错误，保留前端的错误
          const shouldKeepError = prev.error && !caldavStatus?.data?.error && !caldavStatus?.data?.syncing;
          
          return {
            type: 'caldav',
            isEnabled: true,
            isSyncing: caldavStatus?.data?.syncing || false,
            lastSyncTime: caldavStatus?.data?.lastSync || prev.lastSyncTime,
            error: shouldKeepError ? prev.error : (caldavStatus?.data?.error || null),
            syncIntervalMinutes: intervalMinutes
          };
        });
        return;
      }

      // 检查 Google Calendar
      const googleConfig = await window.electronAPI?.invoke?.('google-calendar:get-config');
      if (googleConfig?.success && googleConfig.data.enabled && googleConfig.data.connected) {
        const googleStatus = await window.electronAPI?.invoke?.('google-calendar:get-status');
        const intervalMinutes = (() => {
          const n = parseInt(googleConfig?.data?.syncInterval, 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        })();
        setCalendarStatus(prev => {
          // 如果前端有错误且后端没有错误，保留前端的错误
          const shouldKeepError = prev.error && !googleStatus?.data?.error && !googleStatus?.data?.syncing;
          
          return {
            type: 'google',
            isEnabled: true,
            isSyncing: googleStatus?.data?.syncing || false,
            lastSyncTime: googleStatus?.data?.lastSync || prev.lastSyncTime,
            error: shouldKeepError ? prev.error : (googleStatus?.data?.error || null),
            syncIntervalMinutes: intervalMinutes
          };
        });
        return;
      }

      // 均未启用
      setCalendarStatus(prev => ({ ...prev, isEnabled: false, type: null, syncIntervalMinutes: null }));
    } catch (error) {
      console.error('加载日历状态失败:', error);
    }
  };

  const getTimeoutMsFromIntervalMinutes = (intervalMinutes) => {
    const DEFAULT_MINUTES = 10;
    const minutes = Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : DEFAULT_MINUTES;
    return minutes * 60 * 1000;
  };

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleManualSync = async () => {
    try {
      // 触发云同步
      if (syncStatus.isEnabled) {
        await window.electronAPI?.sync?.manualSync?.();
      }
      
      // 触发日历同步
      if (calendarStatus.isEnabled) {
        // 设置同步中状态（清除旧错误，因为这是用户手动触发的新同步）
        setCalendarStatus(prev => ({ ...prev, isSyncing: true, error: null }));
        
        try {
          let result;
          if (calendarStatus.type === 'caldav') {
            result = await window.electronAPI?.invoke?.('caldav:sync');
          } else if (calendarStatus.type === 'google') {
            result = await window.electronAPI?.invoke?.('google-calendar:sync');
          }
          
          // 检查返回结果
          if (result && !result.success) {
            // 后端返回失败，抛出错误
            throw new Error(result.error || '日历同步失败');
          }
          
          // 同步成功，更新状态
          setCalendarStatus(prev => ({
            ...prev,
            isSyncing: false,
            lastSyncTime: new Date(),
            error: null
          }));
        } catch (calendarError) {
          // 日历同步失败，记录错误，不更新 lastSyncTime
          console.error('日历同步失败:', calendarError);
          setCalendarStatus(prev => ({
            ...prev,
            isSyncing: false,
            error: calendarError.message || '日历同步失败'
          }));
        }
        
        // 注意：不再刷新状态，避免覆盖前端设置的错误
        // 后端可能没有持久化错误状态，所以不能重新加载
      }
    } catch (error) {
      console.error('手动同步失败:', error);
    }
  };

  // 计算聚合状态
  const getAggregateState = () => {
    const services = [];
    const now = new Date();
    const cloudTimeoutMs = getTimeoutMsFromIntervalMinutes(syncStatus.syncIntervalMinutes);
    const calendarTimeoutMs = getTimeoutMsFromIntervalMinutes(calendarStatus.syncIntervalMinutes);
    
    // 检查云同步状态
    if (syncStatus.isEnabled) {
      let hasIssue = false;
      
      // 1. 检查是否有错误
      if (syncStatus.error) {
        hasIssue = true;
      }
      
      // 2. 检查是否超过10分钟未同步
      if (syncStatus.lastSyncTime) {
        const timeSinceLastSync = now - new Date(syncStatus.lastSyncTime);
        if (timeSinceLastSync > cloudTimeoutMs) {
          hasIssue = true;
        }
      } else {
        // 启用了但从未同步过，也算异常
        hasIssue = true;
      }
      
      services.push({ name: 'cloud', error: hasIssue });
    }
    
    // 检查日历同步状态
    if (calendarStatus.isEnabled) {
      let hasIssue = false;
      
      // 1. 检查是否有错误
      if (calendarStatus.error) {
        hasIssue = true;
      }
      
      // 2. 检查是否超过10分钟未同步
      if (calendarStatus.lastSyncTime) {
        const timeSinceLastSync = now - new Date(calendarStatus.lastSyncTime);
        if (timeSinceLastSync > calendarTimeoutMs) {
          hasIssue = true;
        }
      } else {
        // 启用了但从未同步过，也算异常
        hasIssue = true;
      }
      
      services.push({ name: 'calendar', error: hasIssue });
    }

    console.log('[SyncStatusIndicator] Aggregate calculation:', {
      syncEnabled: syncStatus.isEnabled,
      syncLastTime: syncStatus.lastSyncTime,
      syncError: syncStatus.error,
      calendarEnabled: calendarStatus.isEnabled,
      calendarLastTime: calendarStatus.lastSyncTime,
      calendarError: calendarStatus.error,
      services,
      now: now.toISOString()
    }); // 调试日志

    if (services.length === 0) return 'disabled'; // 两个都未启用 -> 灰色

    const errorCount = services.filter(s => s.error).length;
    
    // 修复：只要有一个服务有问题，就不能是绿色
    if (errorCount === 0) return 'success'; // 所有启用的服务都正常 -> 绿色
    if (errorCount === services.length) return 'error'; // 所有启用的服务都异常 -> 红色感叹号
    return 'warning'; // 部分服务异常 -> 橙色感叹号
  };

  const renderMainIcon = () => {
    const state = getAggregateState();
    const isAnySyncing = syncStatus.isSyncing || calendarStatus.isSyncing;

    if (isAnySyncing) {
      return <CircularProgress size={20} color="inherit" />;
    }

    switch (state) {
      case 'success':
        return <CloudDoneIcon fontSize="small" sx={{ color: '#4caf50' }} />; // 绿色勾
      case 'warning':
        // 部分服务异常 - 橙色云图标 + 感叹号
        return (
          <Box sx={{ position: 'relative', display: 'inline-flex', width: 20, height: 20 }}>
            <CloudIcon fontSize="small" sx={{ 
              color: '#ff9800',
              position: 'absolute',
              top: 0,
              left: 0
            }} />
            <Box sx={{
              position: 'absolute',
              top: '52%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: 12,
              fontWeight: 'bold',
              color: '#fff',
              textShadow: '0 0 2px rgba(0,0,0,0.8)',
              lineHeight: 1
            }}>!</Box>
          </Box>
        );
      case 'error':
        // 全部服务异常 - 红色云图标 + 感叹号
        return (
          <Box sx={{ position: 'relative', display: 'inline-flex', width: 20, height: 20 }}>
            <CloudIcon fontSize="small" sx={{ 
              color: '#f44336',
              position: 'absolute',
              top: 0,
              left: 0
            }} />
            <Box sx={{
              position: 'absolute',
              top: '52%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: 12,
              fontWeight: 'bold',
              color: '#fff',
              textShadow: '0 0 2px rgba(0,0,0,0.8)',
              lineHeight: 1
            }}>!</Box>
          </Box>
        );
      case 'disabled':
      default:
        return <CloudOffIcon fontSize="small" sx={{ color: 'text.disabled' }} />; // 灰色
    }
  };

  const getStatusText = () => {
    const parts = [];
    const now = new Date();
    const cloudTimeoutMs = getTimeoutMsFromIntervalMinutes(syncStatus.syncIntervalMinutes);
    const calendarTimeoutMs = getTimeoutMsFromIntervalMinutes(calendarStatus.syncIntervalMinutes);
    
    if (syncStatus.isEnabled) {
      if (syncStatus.isSyncing) {
        parts.push('云端: 同步中...');
      } else if (syncStatus.error) {
        parts.push('云端异常: ' + syncStatus.error);
      } else if (!syncStatus.lastSyncTime) {
        parts.push('云端: 等待首次同步');
      } else {
        const timeSinceLastSync = now - new Date(syncStatus.lastSyncTime);
        if (timeSinceLastSync > cloudTimeoutMs) {
          const minutesAgo = Math.floor(timeSinceLastSync / 60000);
          parts.push(`云端: ${minutesAgo}分钟前（超时）`);
        } else {
          const minutesAgo = Math.floor(timeSinceLastSync / 60000);
          if (minutesAgo < 1) {
            parts.push('云端: 刚刚同步');
          } else {
            parts.push(`云端: ${minutesAgo}分钟前`);
          }
        }
      }
    } else {
      parts.push('云端: 未启用');
    }
    
    if (calendarStatus.isEnabled) {
      if (calendarStatus.isSyncing) {
        parts.push('日历: 同步中...');
      } else if (calendarStatus.error) {
        parts.push('日历异常: ' + calendarStatus.error);
      } else if (!calendarStatus.lastSyncTime) {
        parts.push('日历: 等待首次同步');
      } else {
        const timeSinceLastSync = now - new Date(calendarStatus.lastSyncTime);
        if (timeSinceLastSync > calendarTimeoutMs) {
          const minutesAgo = Math.floor(timeSinceLastSync / 60000);
          parts.push(`日历: ${minutesAgo}分钟前（超时）`);
        } else {
          const minutesAgo = Math.floor(timeSinceLastSync / 60000);
          if (minutesAgo < 1) {
            parts.push('日历: 刚刚同步');
          } else {
            parts.push(`日历: ${minutesAgo}分钟前`);
          }
        }
      }
    } else if (!syncStatus.isEnabled) {
      // 只有两个都未启用时才显示
      parts.push('日历: 未启用');
    }
    
    if (parts.length === 0) return '同步未启用';
    return parts.join(' | ');
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <Tooltip title={getStatusText()}>
        <Box 
          onClick={handleClick}
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            width: 32,
            height: 32,
            '&:hover': { bgcolor: 'action.hover' }
          }}
        >
          {renderMainIcon()}
        </Box>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: (theme) => ({
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            backgroundColor: theme.palette.mode === 'dark'
              ? 'rgba(30, 41, 59, 0.85)'
              : 'rgba(255, 255, 255, 0.85)',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '8px'
          })
        }}
      >
        <Box sx={{ p: 2, minWidth: 320 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">同步状态</Typography>
            <IconButton
              size="small"
              onClick={handleManualSync}
              disabled={(syncStatus.isSyncing || !syncStatus.isEnabled) && (calendarStatus.isSyncing || !calendarStatus.isEnabled)}
              title="立即同步所有"
            >
              <SyncIcon />
            </IconButton>
          </Box>

          {/* 云存储同步部分 */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            云存储同步
          </Typography>
          
          {syncStatus.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {syncStatus.error}
            </Alert>
          )}

          <List dense disablePadding>
            <ListItem>
              <ListItemText
                primary="服务状态"
                secondary={
                  <Chip
                    label={syncStatus.isEnabled ? '已启用' : '未启用'}
                    size="small"
                    color={syncStatus.isEnabled ? 'success' : 'default'}
                  />
                }
                secondaryTypographyProps={{
                  component: 'div'
                }}
              />
            </ListItem>

            {syncStatus.isEnabled && (
              <>
                <ListItem>
                  <ListItemText
                    primary="同步状态"
                    secondary={
                      (() => {
                        const now = new Date();
                        const timeoutMs = getTimeoutMsFromIntervalMinutes(syncStatus.syncIntervalMinutes);
                        
                        if (syncStatus.isSyncing) {
                          return (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <CircularProgress size={16} />
                              <Typography variant="body2" component="span">正在同步</Typography>
                            </Box>
                          );
                        }
                        
                        // 检查是否处于挂起状态：有错误或超时未同步
                        const isPending = syncStatus.error || 
                                        (!syncStatus.lastSyncTime) ||
                                        (syncStatus.lastSyncTime && (now - new Date(syncStatus.lastSyncTime)) > timeoutMs);
                        
                        if (isPending) {
                          return (
                            <Typography variant="body2" color="warning.main">
                              挂起
                              {syncStatus.error && ` (上次同步失败)`}
                              {!syncStatus.error && !syncStatus.lastSyncTime && ` (等待首次同步)`}
                              {!syncStatus.error && syncStatus.lastSyncTime && (now - new Date(syncStatus.lastSyncTime)) > timeoutMs && ` (超时未同步)`}
                            </Typography>
                          );
                        }
                        
                        return <Typography variant="body2" color="success.main">空闲</Typography>;
                      })()
                    }
                    secondaryTypographyProps={{
                      component: 'div'
                    }}
                  />
                </ListItem>

                {syncStatus.lastSyncTime && (
                  <ListItem>
                    <ListItemText
                      primary="上次同步"
                      secondary={new Date(syncStatus.lastSyncTime).toLocaleString('zh-CN')}
                    />
                  </ListItem>
                )}

                {syncStatus.error && (
                  <ListItem>
                    <ListItemText
                      primary="错误信息"
                      secondary={
                        <Typography variant="body2" color="error">
                          {syncStatus.error}
                        </Typography>
                      }
                      secondaryTypographyProps={{
                        component: 'div'
                      }}
                    />
                  </ListItem>
                )}
              </>
            )}
          </List>

          <Divider sx={{ my: 2 }} />

          {/* 日历同步部分 */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            日历同步 ({calendarStatus.type === 'caldav' ? 'CalDAV' : calendarStatus.type === 'google' ? 'Google' : '未配置'})
          </Typography>

          {calendarStatus.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {calendarStatus.error}
            </Alert>
          )}

          <List dense disablePadding>
            <ListItem>
              <ListItemText
                primary="服务状态"
                secondary={
                  <Chip
                    label={calendarStatus.isEnabled ? '已启用' : '未启用'}
                    size="small"
                    color={calendarStatus.isEnabled ? 'success' : 'default'}
                  />
                }
                secondaryTypographyProps={{
                  component: 'div'
                }}
              />
            </ListItem>

            {calendarStatus.isEnabled && (
              <>
                <ListItem>
                  <ListItemText
                    primary="同步状态"
                    secondary={
                      (() => {
                        const now = new Date();
                        const timeoutMs = getTimeoutMsFromIntervalMinutes(calendarStatus.syncIntervalMinutes);
                        
                        if (calendarStatus.isSyncing) {
                          return (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <CircularProgress size={16} />
                              <Typography variant="body2" component="span">正在同步</Typography>
                            </Box>
                          );
                        }
                        
                        // 检查是否处于挂起状态：有错误或超时未同步
                        const isPending = calendarStatus.error || 
                                        (!calendarStatus.lastSyncTime) ||
                                        (calendarStatus.lastSyncTime && (now - new Date(calendarStatus.lastSyncTime)) > timeoutMs);
                        
                        if (isPending) {
                          return (
                            <Typography variant="body2" color="warning.main">
                              挂起
                              {calendarStatus.error && ` (上次同步失败)`}
                              {!calendarStatus.error && !calendarStatus.lastSyncTime && ` (等待首次同步)`}
                              {!calendarStatus.error && calendarStatus.lastSyncTime && (now - new Date(calendarStatus.lastSyncTime)) > timeoutMs && ` (超时未同步)`}
                            </Typography>
                          );
                        }
                        
                        return <Typography variant="body2" color="success.main">空闲</Typography>;
                      })()
                    }
                    secondaryTypographyProps={{
                      component: 'div'
                    }}
                  />
                </ListItem>

                {calendarStatus.lastSyncTime && (
                  <ListItem>
                    <ListItemText
                      primary="上次同步"
                      secondary={new Date(calendarStatus.lastSyncTime).toLocaleString('zh-CN')}
                    />
                  </ListItem>
                )}

                {calendarStatus.error && (
                  <ListItem>
                    <ListItemText
                      primary="错误信息"
                      secondary={
                        <Typography variant="body2" color="error">
                          {calendarStatus.error}
                        </Typography>
                      }
                      secondaryTypographyProps={{
                        component: 'div'
                      }}
                    />
                  </ListItem>
                )}
              </>
            )}
          </List>

          {!syncStatus.isEnabled && !calendarStatus.isEnabled && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
              请在设置中启用同步服务
            </Typography>
          )}
        </Box>
      </Popover>
    </>
  );
};

export default SyncStatusIndicator;
