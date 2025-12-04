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

/**
 * 同步状态指示器组件
 * 显示云同步和日历同步的实时状态
 */
const SyncStatusIndicator = () => {
  // 云存储同步状态
  const [syncStatus, setSyncStatus] = useState({
    isEnabled: false,
    isSyncing: false,
    lastSyncTime: null,
    error: null,
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
    error: null
  });

  const [anchorEl, setAnchorEl] = useState(null);

  useEffect(() => {
    // 获取初始状态
    loadSyncStatus();
    loadCalendarStatus();

    // 监听云同步事件
    const removeStartListener = window.electronAPI?.sync?.onSyncStart?.(() => {
      setSyncStatus(prev => ({ ...prev, isSyncing: true, error: null }));
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
        error: null
      }));
    });

    const removeErrorListener = window.electronAPI?.sync?.onSyncError?.((error) => {
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        error: error.message || '同步失败'
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
        setSyncStatus(prev => ({
          ...prev,
          isEnabled: response.status.isEnabled || false,
          isSyncing: response.status.isSyncing || false,
          lastSyncTime: response.status.lastSyncTime ? new Date(response.status.lastSyncTime) : null,
          error: response.status.error || null
        }));
      } else {
        // 没有活跃服务时，标记为未启用
        setSyncStatus(prev => ({
          ...prev,
          isEnabled: false,
          isSyncing: false,
          error: null
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
        setCalendarStatus({
          type: 'caldav',
          isEnabled: true,
          isSyncing: caldavStatus?.data?.syncing || false,
          lastSyncTime: caldavStatus?.data?.lastSync,
          error: caldavStatus?.data?.error || null
        });
        return;
      }

      // 检查 Google Calendar
      const googleConfig = await window.electronAPI?.invoke?.('google-calendar:get-config');
      if (googleConfig?.success && googleConfig.data.enabled && googleConfig.data.connected) {
        const googleStatus = await window.electronAPI?.invoke?.('google-calendar:get-status');
        setCalendarStatus({
          type: 'google',
          isEnabled: true,
          isSyncing: googleStatus?.data?.syncing || false,
          lastSyncTime: googleStatus?.data?.lastSync,
          error: googleStatus?.data?.error || null
        });
        return;
      }

      // 均未启用
      setCalendarStatus(prev => ({ ...prev, isEnabled: false, type: null }));
    } catch (error) {
      console.error('加载日历状态失败:', error);
    }
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
        if (calendarStatus.type === 'caldav') {
          await window.electronAPI?.invoke?.('caldav:sync');
        } else if (calendarStatus.type === 'google') {
          await window.electronAPI?.invoke?.('google-calendar:sync');
        }
        // 刷新日历状态
        setTimeout(loadCalendarStatus, 1000);
      }
    } catch (error) {
      console.error('手动同步失败:', error);
    }
  };

  // 计算聚合状态
  const getAggregateState = () => {
    const services = [];
    if (syncStatus.isEnabled) services.push({ name: 'cloud', error: syncStatus.error });
    if (calendarStatus.isEnabled) services.push({ name: 'calendar', error: calendarStatus.error });

    console.log('[SyncStatusIndicator] Aggregate calculation:', {
      syncEnabled: syncStatus.isEnabled,
      syncError: syncStatus.error,
      calendarEnabled: calendarStatus.isEnabled,
      calendarError: calendarStatus.error,
      services
    }); // 调试日志

    if (services.length === 0) return 'disabled'; // 两个都未启用 -> 灰色

    const errorCount = services.filter(s => s.error).length;
    
    if (errorCount === 0) return 'success'; // 两个都正常 -> 绿色
    if (errorCount === services.length) return 'disabled'; // 两个都不正常 -> 灰色
    return 'warning'; // 有一个正常 -> 黑色加感叹号
  };

  const renderMainIcon = () => {
    const state = getAggregateState();
    const isAnySyncing = syncStatus.isSyncing || calendarStatus.isSyncing;

    if (isAnySyncing) {
      return <CircularProgress size={20} color="inherit" />;
    }

    switch (state) {
      case 'success':
        return <CloudDoneIcon fontSize="small" sx={{ color: '#4caf50' }} />; // 绿色
      case 'warning':
        return (
          <Badge 
            badgeContent={<ExclamationIcon sx={{ fontSize: 12, color: '#fff', bgcolor: 'error.main', borderRadius: '50%' }} />}
            overlap="circular"
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          >
            <CloudIcon fontSize="small" sx={{ color: '#000000' }} /> {/* 黑色 */}
          </Badge>
        );
      case 'disabled':
      default:
        return <CloudOffIcon fontSize="small" sx={{ color: 'text.disabled' }} />; // 灰色
    }
  };

  const getStatusText = () => {
    const parts = [];
    if (syncStatus.isEnabled) parts.push(syncStatus.error ? '云端异常' : '云端正常');
    if (calendarStatus.isEnabled) parts.push(calendarStatus.error ? '日历异常' : '日历正常');
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
                      syncStatus.isSyncing ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CircularProgress size={16} />
                          <Typography variant="body2" component="span">正在同步...</Typography>
                        </Box>
                      ) : (
                        '空闲'
                      )
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
                      calendarStatus.isSyncing ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CircularProgress size={16} />
                          <Typography variant="body2" component="span">正在同步...</Typography>
                        </Box>
                      ) : (
                        '空闲'
                      )
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
