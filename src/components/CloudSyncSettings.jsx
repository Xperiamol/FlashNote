import React, { useState, useEffect } from 'react';
import { useTranslation } from '../utils/i18n';
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
  Tabs,
  Tab,
  keyframes,
  FormGroup
} from '@mui/material';
import VersionManager from './VersionManager';
import CalendarSyncSettings from './CalendarSyncSettings';
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
  History as HistoryIcon,
  CalendarToday as CalendarIcon,
  Image as ImageIcon,
  Delete as DeleteIcon
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
  const { t } = useTranslation();
  const [services, setServices] = useState([]);
  const [syncStatus, setSyncStatus] = useState({});
  const [selectedService, setSelectedService] = useState('');
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [cleaningImages, setCleaningImages] = useState(false);
  const [message, setMessage] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState(null);
  const [showVersionManager, setShowVersionManager] = useState(false);
  const [tabValue, setTabValue] = useState(0); // 0=云存储, 1=日历同步
  const [imageSyncEnabled, setImageSyncEnabled] = useState(false); // 本地状态跟踪图片同步开关
  const [savingConfig, setSavingConfig] = useState(false); // 独立的配置保存状态
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [cleanupStats, setCleanupStats] = useState({ orphanedCount: 0, totalSizeMB: 0 });
  const [retentionDays, setRetentionDays] = useState(30);

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
      
      // 立即更新图片同步开关状态，避免UI延迟
      if (status.status?.config?.syncImages !== undefined) {
        setImageSyncEnabled(status.status.config.syncImages);
      }
      
      if (status.activeService) {
        setSelectedService(status.activeService);
      }
    } catch (error) {
      console.error('加载云同步数据失败:', error);
      setMessage({ type: 'error', text: t('cloudSync.loadDataFailed') });
    }
  };

  const loadSyncStatus = async () => {
    try {
      const status = await getSyncStatus();
      setSyncStatus(status);
      
      // 更新图片同步开关状态
      if (status.status?.config?.syncImages !== undefined) {
        setImageSyncEnabled(status.status.config.syncImages);
      }
      
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
        setMessage({ type: 'success', text: t('cloudSync.connectionTestSuccess') });
      } else {
        setMessage({ type: 'error', text: result.message || t('cloudSync.connectionTestFailed') });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || t('cloudSync.connectionTestFailed') });
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
        setMessage({ type: 'success', text: t('cloudSync.cloudSyncEnabled') });
        await loadSyncStatus();
      } else {
        setMessage({ type: 'error', text: result.message || t('cloudSync.enableCloudSyncFailed') });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || t('cloudSync.enableCloudSyncFailed') });
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
        setMessage({ type: 'success', text: t('cloudSync.cloudSyncDisabled') });
        await loadSyncStatus();
      } else {
        setMessage({ type: 'error', text: result.message || t('cloudSync.disableCloudSyncFailed') });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || t('cloudSync.disableCloudSyncFailed') });
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
        setMessage({ type: 'error', text: result.message || t('cloudSync.manualSyncFailed') });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || t('cloudSync.manualSyncFailed') });
    } finally {
      setSyncing(false);
    }
  };

  const handleForceStop = async () => {
    try {
      await forceStopSync();
      setMessage({ type: 'info', text: t('cloudSync.syncForceStopped') });
      await loadSyncStatus();
    } catch (error) {
      setMessage({ type: 'error', text: t('cloudSync.forceStopFailed') });
    }
  };

  const handleCleanupImages = async () => {
    console.log('[前端] handleCleanupImages 开始执行');
    console.log('[前端] window.electronAPI:', window.electronAPI);
    console.log('[前端] cleanupUnusedImages 存在:', typeof window.electronAPI?.sync?.cleanupUnusedImages);
    
    if (!window.electronAPI?.sync?.cleanupUnusedImages) {
      console.log('[前端] 清理功能不可用');
      setMessage({ type: 'error', text: t('cloudSync.cleanupUnavailable') });
      return;
    }

    try {
      console.log('[前端] 设置 cleaningImages = true');
      setCleaningImages(true);
      
      // 先获取统计信息
      console.log('[前端] 调用 getUnusedImagesStats, retentionDays:', retentionDays);
      const statsResult = await window.electronAPI.sync.getUnusedImagesStats(retentionDays);
      console.log('[前端] getUnusedImagesStats 返回:', statsResult);
      
      if (!statsResult.success) {
        console.log('[前端] 获取统计失败:', statsResult.error);
        setMessage({ type: 'error', text: statsResult.error || '获取统计信息失败' });
        return;
      }

      const { orphanedCount, totalSizeMB } = statsResult.data;
      console.log('[前端] orphanedCount:', orphanedCount, 'totalSizeMB:', totalSizeMB);
      
      if (orphanedCount === 0) {
        console.log('[前端] 没有需要清理的图片');
        setMessage({ type: 'info', text: '没有需要清理的未引用图片（包括已删除笔记中的图片）' });
        return;
      }

      // 显示确认对话框
      console.log('[前端] 显示确认对话框...');
      setCleanupStats({ orphanedCount, totalSizeMB });
      setShowCleanupDialog(true);
      
    } catch (error) {
      console.error('清理图片失败:', error);
      setMessage({ type: 'error', text: '清理失败: ' + error.message });
    } finally {
      setCleaningImages(false);
    }
  };

  const handleConfirmCleanup = async () => {
    setShowCleanupDialog(false);
    setCleaningImages(true);
    
    try {
      console.log('[前端] 用户确认，调用 cleanupUnusedImages, retentionDays:', retentionDays);
      const result = await window.electronAPI.sync.cleanupUnusedImages(retentionDays);
      console.log('[前端] cleanupUnusedImages 返回:', result);
      
      if (result.success) {
        const { deletedCount, totalSize } = result.data;
        const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
        setMessage({ 
          type: 'success', 
          text: t('cloudSync.cleanupSuccess', { deletedCount, sizeMB })
        });
      } else {
        setMessage({ type: 'error', text: result.error || t('cloudSync.cleanupFailed') });
      }
    } catch (error) {
      console.error('清理图片失败:', error);
      setMessage({ type: 'error', text: '清理失败: ' + error.message });
    } finally {
      setCleaningImages(false);
    }
  };

  const handleResolveConflict = async (resolution) => {
    if (!selectedConflict) return;
    
    try {
      const result = await resolveConflict(selectedConflict.id, resolution);
      
      if (result.success) {
        setMessage({ type: 'success', text: t('cloudSync.conflictResolved') });
        setShowConflictDialog(false);
        setSelectedConflict(null);
        await loadSyncStatus();
      } else {
        setMessage({ type: 'error', text: result.message || t('cloudSync.resolveConflictFailed') });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || t('cloudSync.resolveConflictFailed') });
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
              label={t('cloudSync.nutcloudUsername')}
              value={config.username || ''}
              onChange={(e) => handleConfigChange('username', e.target.value)}
              sx={{ mb: 2 }}
              placeholder={t('cloudSync.nutcloudUsernamePlaceholder')}
            />
            <TextField
              fullWidth
              label={t('cloudSync.appPassword')}
              type="password"
              value={config.password || ''}
              onChange={(e) => handleConfigChange('password', e.target.value)}
              sx={{ mb: 2 }}
              placeholder={t('cloudSync.appPasswordPlaceholder')}
              helperText={t('cloudSync.appPasswordHelp')}
            />
          </Box>
        );
      
      case 'onedrive':
        return (
          <Box sx={{ mt: 2 }}>
            <Alert severity="info">
              {t('cloudSync.onedriveOAuth')}
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
      return t('cloudSync.notEnabled');
    }
    
    if (syncStatus.status?.isSyncing) {
      return t('cloudSync.syncing');
    }
    
    if (syncStatus.status?.isEnabled && syncStatus.status?.isAuthenticated) {
      return t('cloudSync.connectedTo', { serviceName: syncStatus.activeServiceDisplayName });
    }
    
    return t('cloudSync.connectionFailed');
  };

  const getLastSyncText = () => {
    if (!syncStatus.status?.lastSyncTime) {
      return t('cloudSync.neverSynced');
    }
    
    const lastSync = new Date(syncStatus.status.lastSyncTime);
    const now = new Date();
    const diffMinutes = Math.floor((now - lastSync) / (1000 * 60));
    
    if (diffMinutes < 1) {
      return t('cloudSync.justSynced');
    } else if (diffMinutes < 60) {
      return t('cloudSync.syncedMinutesAgo', { minutes: diffMinutes });
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      return t('cloudSync.syncedHoursAgo', { hours: diffHours });
    }
  };

  return (
    <Box>
      {/* 标签页切换 */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab icon={<CloudIcon />} label={t('cloudSync.cloudStorageSync')} />
          <Tab icon={<CalendarIcon />} label={t('cloudSync.calendarSync')} />
        </Tabs>
      </Box>

      {/* 云存储同步标签页 */}
      {tabValue === 0 && (
        <>
          {/* 当前状态 */}
          <Box sx={{ mb: 3 }}>
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
                label={t('cloudSync.autoSyncEnabled')} 
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
            {t('cloudSync.conflictsDetected', { count: conflicts.length })}
            <Button 
              size="small" 
              onClick={() => setShowConflictDialog(true)}
              sx={{ ml: 1 }}
            >
              {t('cloudSync.viewConflicts')}
            </Button>
          </Alert>
        )}
      </Box>

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
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('cloudSync.selectCloudService')}
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
            {testing ? t('cloudSync.testing') : t('cloudSync.testConnection')}
          </Button>
          
          {!syncStatus.hasActiveService ? (
            <Button
              variant="contained"
              onClick={handleEnableSync}
              disabled={!selectedService || loading}
              startIcon={loading ? <CircularProgress size={16} /> : <CloudIcon />}
            >
              {loading ? t('cloudSync.enabling') : t('cloudSync.enableCloudSync')}
            </Button>
          ) : (
            <Button
              variant="outlined"
              color="error"
              onClick={handleDisableSync}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} /> : <CloudOffIcon />}
            >
              {loading ? t('cloudSync.disabling') : t('cloudSync.disableCloudSync')}
            </Button>
          )}
        </Box>
      </Box>

      {/* 同步操作 */}
      {syncStatus.hasActiveService && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            {t('cloudSync.syncOperations')}
          </Typography>
          
          {/* 图片同步开关 */}
          <Box sx={{ mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
            <FormGroup>
              <FormControlLabel
                disabled={loading || savingConfig}
                control={
                  <Switch
                    checked={imageSyncEnabled}
                    disabled={loading || savingConfig}
                    onChange={async (e) => {
                      try {
                        const newValue = e.target.checked;
                        console.log('切换图片同步:', newValue);
                        
                        // 立即更新UI状态
                        setImageSyncEnabled(newValue);
                        
                        // 使用独立的savingConfig状态，避免影响其他按钮
                        setSavingConfig(true);
                        
                        // 构建配置
                        const newConfig = {
                          syncImages: newValue,
                          autoSync: syncStatus.status?.config?.autoSync !== false
                        };
                        
                        console.log('发送配置:', newConfig);
                        
                        // 更新服务配置
                        const result = await switchService(syncStatus.activeService, newConfig);
                        console.log('更新结果:', result);
                        
                        if (result.success) {
                          // 成功时不显示消息，避免打扰用户，或者显示轻量级提示
                          // setMessage({
                          //   type: 'success',
                          //   text: newValue ? '图片同步已启用' : '图片同步已禁用'
                          // });
                          await loadSyncStatus();
                        } else {
                          // 失败时恢复原状态
                          setImageSyncEnabled(!newValue);
                          setMessage({ type: 'error', text: result.message || '更新配置失败' });
                        }
                      } catch (error) {
                        console.error('更新图片同步配置失败:', error);
                        // 失败时恢复原状态
                        setImageSyncEnabled(!e.target.checked);
                        setMessage({ type: 'error', text: '更新配置失败: ' + error.message });
                      } finally {
                        setSavingConfig(false);
                      }
                    }}
                  />
                }
                label={
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ImageIcon fontSize="small" />
                      <Typography variant="subtitle2">
                        {t('cloudSync.syncImages')}
                      </Typography>
                      <Chip label={t('cloudSync.experimental')} size="small" color="warning" />
                      {savingConfig && <CircularProgress size={12} sx={{ ml: 1 }} />}
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {t('cloudSync.syncImagesDesc')}
                    </Typography>
                  </Box>
                }
              />
            </FormGroup>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              variant="contained"
              onClick={handleManualSync}
              disabled={syncing || syncStatus.status?.isSyncing}
              startIcon={syncing ? <CircularProgress size={16} /> : <RefreshIcon />}
            >
              {syncing ? t('cloudSync.syncingNow') : t('cloudSync.manualSync')}
            </Button>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FormControl size="small">
                <RadioGroup
                  row
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                >
                  <FormControlLabel value={0} control={<Radio size="small" />} label="0天" />
                  <FormControlLabel value={7} control={<Radio size="small" />} label="7天" />
                  <FormControlLabel value={30} control={<Radio size="small" />} label="30天" />
                  <FormControlLabel value={90} control={<Radio size="small" />} label="90天" />
                </RadioGroup>
              </FormControl>
              
              <Button
                variant="outlined"
                onClick={handleCleanupImages}
                disabled={syncing || cleaningImages}
                startIcon={cleaningImages ? <CircularProgress size={16} /> : <DeleteIcon />}
              >
                {cleaningImages ? t('cloudSync.cleaning') : t('cloudSync.cleanupUnusedImages')}
              </Button>
            </Box>
            
            <Button
              variant="outlined"
              onClick={() => setShowVersionManager(true)}
              startIcon={<HistoryIcon />}
            >
              {t('cloudSync.versionManagement')}
            </Button>
            
            {syncStatus.status?.isSyncing && (
              <Button
                variant="outlined"
                color="error"
                onClick={handleForceStop}
                startIcon={<StopIcon />}
              >
                {t('cloudSync.forceStop')}
              </Button>
            )}
          </Box>
        </Box>
      )}

      {/* 冲突解决对话框 */}
      <Dialog 
        open={showConflictDialog} 
        onClose={() => setShowConflictDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{t('cloudSync.syncConflicts')}</DialogTitle>
        <DialogContent>
          <List>
            {conflicts.map((conflict, index) => (
              <ListItem key={index}>
                <ListItemText
                  primary={`${conflict.table}: ${conflict.local.content || conflict.local.title}`}
                  secondary={`${t('cloudSync.localModifiedTime')}: ${conflict.local.updated_at} | ${t('cloudSync.remoteModifiedTime')}: ${conflict.remote.updated_at}`}
                />
                <ListItemSecondaryAction>
                  <Tooltip title={t('cloudSync.useLocalVersion')}>
                    <IconButton 
                      onClick={() => {
                        setSelectedConflict(conflict);
                        handleResolveConflict('local');
                      }}
                    >
                      <DownloadIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('cloudSync.useRemoteVersion')}>
                    <IconButton 
                      onClick={() => {
                        setSelectedConflict(conflict);
                        handleResolveConflict('remote');
                      }}
                    >
                      <UploadIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('cloudSync.smartMerge')}>
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
            {t('cloudSync.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 清理图片确认对话框 */}
      <Dialog open={showCleanupDialog} onClose={() => setShowCleanupDialog(false)}>
        <DialogTitle>{t('cloudSync.cleanupUnusedImagesTitle')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('cloudSync.orphanedImagesFound', { 
              count: cleanupStats.orphanedCount, 
              sizeMB: cleanupStats.totalSizeMB,
              retentionText: retentionDays > 0 ? `，这些图片超过 ${retentionDays} 天未被使用` : ''
            })}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {t('cloudSync.cleanupWarning')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCleanupDialog(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirmCleanup} variant="contained" color="error">
            {t('cloudSync.confirmDelete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 版本管理器 */}
      <VersionManager
        open={showVersionManager}
        onClose={() => setShowVersionManager(false)}
      />
        </>
      )}

      {/* 日历同步标签页 */}
      {tabValue === 1 && (
        <CalendarSyncSettings />
      )}
    </Box>
  );
};

export default CloudSyncSettings;