import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Switch,
  Alert,
  Divider,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Tooltip,
  keyframes
} from '@mui/material';
import VersionManager from './VersionManager';
import {
  Cloud as CloudIcon,
  CloudOff as CloudOffIcon,
  Sync as SyncIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  Stop as StopIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  History as HistoryIcon
} from '@mui/icons-material';
import {
  getAvailableServices,
  getSyncStatus,
  testConnection,
  switchService,
  disableSync,
  manualSync,
  forceStopSync,
  getConflicts,
  resolveConflict
} from '../api/syncAPI';

// 定义旋转动画
const rotate = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const CloudSyncSettings = () => {
  const [services, setServices] = useState([]);
  const [syncStatus, setSyncStatus] = useState({});
  const [selectedService, setSelectedService] = useState('');
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState(null);
  const [showVersionManager, setShowVersionManager] = useState(false);

  // 加载初始数据
  useEffect(() => {
    loadData();
  }, []);

  // 定期刷新状态
  useEffect(() => {
    const interval = setInterval(loadSyncStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [availableServices, status] = await Promise.all([
        getAvailableServices(),
        getSyncStatus()
      ]);
      
      setServices(availableServices);
      setSyncStatus(status);
      
      if (status.activeService) {
        setSelectedService(status.activeService);
      }
    } catch (error) {
      console.error('加载云同步数据失败:', error);
      setMessage({ type: 'error', text: '加载数据失败' });
    }
  };

  const loadSyncStatus = async () => {
    try {
      const status = await getSyncStatus();
      setSyncStatus(status);
      
      // 检查冲突
      const conflictList = await getConflicts();
      setConflicts(conflictList);
    } catch (error) {
      console.error('刷新同步状态失败:', error);
    }
  };

  const handleServiceChange = (event) => {
    const service = event.target.value;
    setSelectedService(service);
    setConfig({});
    setMessage(null);
  };

  const handleConfigChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTestConnection = async () => {
    if (!selectedService) return;
    
    setTesting(true);
    setMessage(null);
    
    try {
      const result = await testConnection(selectedService, config);
      
      if (result.success) {
        setMessage({ type: 'success', text: '连接测试成功' });
      } else {
        setMessage({ type: 'error', text: result.message || '连接测试失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '连接测试失败' });
    } finally {
      setTesting(false);
    }
  };

  const handleEnableSync = async () => {
    if (!selectedService) return;
    
    setLoading(true);
    setMessage(null);
    
    try {
      const result = await switchService(selectedService, config);
      
      if (result.success) {
        setMessage({ type: 'success', text: '云同步已启用' });
        await loadSyncStatus();
      } else {
        setMessage({ type: 'error', text: result.message || '启用云同步失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '启用云同步失败' });
    } finally {
      setLoading(false);
    }
  };

  const handleDisableSync = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      const result = await disableSync();
      
      if (result.success) {
        setMessage({ type: 'success', text: '云同步已禁用' });
        await loadSyncStatus();
      } else {
        setMessage({ type: 'error', text: result.message || '禁用云同步失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '禁用云同步失败' });
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setMessage(null);
    
    try {
      const result = await manualSync();
      
      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: `同步完成 - 本地更改: ${result.localChanges}, 远程更改: ${result.remoteChanges}` 
        });
        await loadSyncStatus();
      } else {
        setMessage({ type: 'error', text: result.message || '手动同步失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '手动同步失败' });
    } finally {
      setSyncing(false);
    }
  };

  const handleForceStop = async () => {
    try {
      await forceStopSync();
      setMessage({ type: 'info', text: '同步已强制停止' });
      await loadSyncStatus();
    } catch (error) {
      setMessage({ type: 'error', text: '强制停止失败' });
    }
  };

  const handleResolveConflict = async (resolution) => {
    if (!selectedConflict) return;
    
    try {
      const result = await resolveConflict(selectedConflict.id, resolution);
      
      if (result.success) {
        setMessage({ type: 'success', text: '冲突已解决' });
        setShowConflictDialog(false);
        setSelectedConflict(null);
        await loadSyncStatus();
      } else {
        setMessage({ type: 'error', text: result.message || '解决冲突失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '解决冲突失败' });
    }
  };

  const renderServiceConfig = () => {
    if (!selectedService) return null;

    switch (selectedService) {
      case 'nutcloud':
        return (
          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="坚果云用户名"
              value={config.username || ''}
              onChange={(e) => handleConfigChange('username', e.target.value)}
              sx={{ mb: 2 }}
              placeholder="输入坚果云邮箱地址"
            />
            <TextField
              fullWidth
              label="应用密码"
              type="password"
              value={config.password || ''}
              onChange={(e) => handleConfigChange('password', e.target.value)}
              sx={{ mb: 2 }}
              placeholder="输入坚果云应用密码"
              helperText="请在坚果云网页版'账户信息'>'安全选项'中生成应用密码"
            />
          </Box>
        );
      
      case 'onedrive':
        return (
          <Box sx={{ mt: 2 }}>
            <Alert severity="info">
              OneDrive 使用 OAuth 认证，点击"测试连接"将会打开浏览器进行授权
            </Alert>
          </Box>
        );
      
      default:
        return null;
    }
  };

  const getStatusIcon = () => {
    if (!syncStatus.hasActiveService) {
      return <CloudOffIcon color="disabled" />;
    }
    
    if (syncStatus.status?.isSyncing) {
      return <SyncIcon color="primary" sx={{ 
        animation: `${rotate} 1s linear infinite` 
      }} />;
    }
    
    if (syncStatus.status?.isEnabled && syncStatus.status?.isAuthenticated) {
      return <CloudIcon color="success" />;
    }
    
    return <CloudOffIcon color="error" />;
  };

  const getStatusText = () => {
    if (!syncStatus.hasActiveService) {
      return '未启用云同步';
    }
    
    if (syncStatus.status?.isSyncing) {
      return '正在同步...';
    }
    
    if (syncStatus.status?.isEnabled && syncStatus.status?.isAuthenticated) {
      return `已连接到 ${syncStatus.activeServiceDisplayName}`;
    }
    
    return '连接失败';
  };

  const getLastSyncText = () => {
    if (!syncStatus.status?.lastSyncTime) {
      return '从未同步';
    }
    
    const lastSync = new Date(syncStatus.status.lastSyncTime);
    const now = new Date();
    const diffMinutes = Math.floor((now - lastSync) / (1000 * 60));
    
    if (diffMinutes < 1) {
      return '刚刚同步';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} 分钟前同步`;
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      return `${diffHours} 小时前同步`;
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        云同步设置
      </Typography>
      
      {/* 当前状态 */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          {getStatusIcon()}
          <Typography variant="h6" sx={{ ml: 1 }}>
            {getStatusText()}
          </Typography>
        </Box>
        
        {syncStatus.hasActiveService && (
          <Box>
            <Typography variant="body2" color="text.secondary">
              最后同步: {getLastSyncText()}
            </Typography>
            
            {syncStatus.status?.autoSync && (
              <Chip 
                label="自动同步已启用" 
                size="small" 
                color="primary" 
                sx={{ mt: 1 }}
              />
            )}
          </Box>
        )}
        
        {/* 冲突提示 */}
        {conflicts.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            检测到 {conflicts.length} 个同步冲突，需要手动解决
            <Button 
              size="small" 
              onClick={() => setShowConflictDialog(true)}
              sx={{ ml: 1 }}
            >
              查看冲突
            </Button>
          </Alert>
        )}
      </Paper>

      {/* 消息提示 */}
      {message && (
        <Alert 
          severity={message.type} 
          sx={{ mb: 3 }}
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}

      {/* 服务选择 */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          选择云存储服务
        </Typography>
        
        <FormControl component="fieldset">
          <RadioGroup
            value={selectedService}
            onChange={handleServiceChange}
          >
            {services.map((service) => (
              <FormControlLabel
                key={service.name}
                value={service.name}
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="subtitle1">
                      {service.displayName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {service.description}
                    </Typography>
                  </Box>
                }
              />
            ))}
          </RadioGroup>
        </FormControl>

        {renderServiceConfig()}

        {/* 操作按钮 */}
        <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            onClick={handleTestConnection}
            disabled={!selectedService || testing}
            startIcon={testing ? <CircularProgress size={16} /> : <SettingsIcon />}
          >
            {testing ? '测试中...' : '测试连接'}
          </Button>
          
          {!syncStatus.hasActiveService ? (
            <Button
              variant="contained"
              onClick={handleEnableSync}
              disabled={!selectedService || loading}
              startIcon={loading ? <CircularProgress size={16} /> : <CloudIcon />}
            >
              {loading ? '启用中...' : '启用云同步'}
            </Button>
          ) : (
            <Button
              variant="outlined"
              color="error"
              onClick={handleDisableSync}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} /> : <CloudOffIcon />}
            >
              {loading ? '禁用中...' : '禁用云同步'}
            </Button>
          )}
        </Box>
      </Paper>

      {/* 同步操作 */}
      {syncStatus.hasActiveService && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            同步操作
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              onClick={handleManualSync}
              disabled={syncing || syncStatus.status?.isSyncing}
              startIcon={syncing ? <CircularProgress size={16} /> : <RefreshIcon />}
            >
              {syncing ? '同步中...' : '立即同步'}
            </Button>
            
            <Button
              variant="outlined"
              onClick={() => setShowVersionManager(true)}
              startIcon={<HistoryIcon />}
            >
              版本管理
            </Button>
            
            {syncStatus.status?.isSyncing && (
              <Button
                variant="outlined"
                color="error"
                onClick={handleForceStop}
                startIcon={<StopIcon />}
              >
                强制停止
              </Button>
            )}
          </Box>
        </Paper>
      )}

      {/* 冲突解决对话框 */}
      <Dialog 
        open={showConflictDialog} 
        onClose={() => setShowConflictDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>同步冲突</DialogTitle>
        <DialogContent>
          <List>
            {conflicts.map((conflict, index) => (
              <ListItem key={index}>
                <ListItemText
                  primary={`${conflict.table}: ${conflict.local.content || conflict.local.title}`}
                  secondary={`本地修改时间: ${conflict.local.updated_at} | 远程修改时间: ${conflict.remote.updated_at}`}
                />
                <ListItemSecondaryAction>
                  <Tooltip title="使用本地版本">
                    <IconButton 
                      onClick={() => {
                        setSelectedConflict(conflict);
                        handleResolveConflict('local');
                      }}
                    >
                      <DownloadIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="使用远程版本">
                    <IconButton 
                      onClick={() => {
                        setSelectedConflict(conflict);
                        handleResolveConflict('remote');
                      }}
                    >
                      <UploadIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="智能合并">
                    <IconButton 
                      onClick={() => {
                        setSelectedConflict(conflict);
                        handleResolveConflict('merge');
                      }}
                    >
                      <CheckCircleIcon />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowConflictDialog(false)}>
            关闭
          </Button>
        </DialogActions>
      </Dialog>

      {/* 版本管理器 */}
      <VersionManager
        open={showVersionManager}
        onClose={() => setShowVersionManager(false)}
      />
    </Box>
  );
};

export default CloudSyncSettings;