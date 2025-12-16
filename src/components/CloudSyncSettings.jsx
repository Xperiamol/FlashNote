import React, { useState, useEffect } from 'react';
import { useTranslation } from '../utils/i18n';
import {
  Box,
  Typography,
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
  Tabs,
  Tab,
  keyframes,
  FormGroup,
  Select,
  MenuItem,
  InputLabel,
  Stack,
} from '@mui/material';
import CalendarSyncSettings from './CalendarSyncSettings';
import {
  Cloud as CloudIcon,
  CloudOff as CloudOffIcon,
  Sync as SyncIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  Stop as StopIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  History as HistoryIcon,
  CalendarToday as CalendarIcon,
  Image as ImageIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

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

  // UI 状态
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [cleaningImages, setCleaningImages] = useState(false);
  const [message, setMessage] = useState(null);
  const [tabValue, setTabValue] = useState(0); // 0=云存储, 1=日历同步
  const [savingConfig, setSavingConfig] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [cleanupStats, setCleanupStats] = useState({ orphanedCount: 0, totalSizeMB: 0 });
  const [retentionDays, setRetentionDays] = useState(30);

  // V3 同步配置
  const [config, setConfig] = useState({
    username: '',
    password: '',
    baseUrl: 'https://dav.jianguoyun.com/dav',
  });

  // V3 同步状态
  const [syncStatus, setSyncStatus] = useState(null);
  const [autoSync, setAutoSync] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState(5);

  // 加载初始数据
  useEffect(() => {
    loadStatus();
  }, []);

  // 定期刷新状态
  useEffect(() => {
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const status = await window.electronAPI.sync.getStatus();

      if (status.v3) {
        setSyncStatus(status.v3);
        setAutoSync(status.v3.config?.autoSync || false);
        setAutoSyncInterval(status.v3.config?.autoSyncInterval || 5);

        // 如果已启用且有用户名，加载配置
        if (status.v3.enabled && status.v3.config?.username) {
          setConfig({
            username: status.v3.config.username,
            password: '', // 不显示密码
            baseUrl: status.v3.config.baseUrl || 'https://dav.jianguoyun.com/dav',
          });
        }
      }
    } catch (error) {
      console.error('加载同步状态失败:', error);
      setMessage({ type: 'error', text: '加载同步状态失败' });
    }
  };

  const handleTestConnection = async () => {
    if (!config.username || !config.password) {
      setMessage({ type: 'error', text: '请填写用户名和密码' });
      return;
    }

    setTesting(true);
    setMessage(null);

    try {
      const result = await window.electronAPI.sync.testConnection('flashnote-v3', config);
      if (result) {
        setMessage({ type: 'success', text: 'WebDAV 连接测试成功！' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `连接测试失败: ${error.message}` });
    } finally {
      setTesting(false);
    }
  };

  const handleEnableSync = async () => {
    if (!config.username || !config.password) {
      setMessage({ type: 'error', text: '请填写用户名和密码' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      await window.electronAPI.sync.switchService('flashnote-v3', config);
      setMessage({ type: 'success', text: 'V3 原子化同步已启用！' });
      await loadStatus();
    } catch (error) {
      setMessage({ type: 'error', text: `启用失败: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDisableSync = async () => {
    setLoading(true);
    setMessage(null);

    try {
      await window.electronAPI.sync.disable();
      setMessage({ type: 'success', text: 'V3 同步已禁用' });
      setSyncStatus(null);
      setConfig({ username: '', password: '', baseUrl: 'https://dav.jianguoyun.com/dav' });
    } catch (error) {
      setMessage({ type: 'error', text: `禁用失败: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setMessage(null);

    try {
      console.log('[CloudSyncSettings] 开始手动同步...');
      const result = await window.electronAPI.sync.manualSync();
      console.log('[CloudSyncSettings] 同步结果:', result);

      setMessage({
        type: 'success',
        text: `同步完成！上传: ${result.uploaded || 0}, 下载: ${result.downloaded || 0}, 跳过: ${result.skipped || 0}`,
      });
      await loadStatus();
    } catch (error) {
      console.error('[CloudSyncSettings] 同步异常:', error);
      setMessage({ type: 'error', text: `同步失败: ${error.message}` });
    } finally {
      setSyncing(false);
    }
  };

  const handleForceFullSync = async () => {
    if (!window.confirm('确定要强制全量同步吗？这将清空云端并重新上传所有数据。')) {
      return;
    }

    setSyncing(true);
    setMessage(null);

    try {
      const result = await window.electronAPI.sync.forceFullSync();
      setMessage({
        type: 'success',
        text: `强制全量同步完成！上传: ${result.uploaded || 0}`,
      });
      await loadStatus();
    } catch (error) {
      setMessage({ type: 'error', text: `强制全量同步失败: ${error.message}` });
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleAutoSync = async (enabled) => {
    try {
      await window.electronAPI.sync.toggleAutoSync(enabled);
      setAutoSync(enabled);
      setMessage({ type: 'success', text: `自动同步已${enabled ? '启用' : '禁用'}` });
      await loadStatus();
    } catch (error) {
      setMessage({ type: 'error', text: `切换自动同步失败: ${error.message}` });
    }
  };

  const handleSetAutoSyncInterval = async (minutes) => {
    try {
      await window.electronAPI.sync.setAutoSyncInterval(minutes);
      setAutoSyncInterval(minutes);
      setMessage({ type: 'success', text: `自动同步间隔已设置为 ${minutes} 分钟` });
      await loadStatus();
    } catch (error) {
      setMessage({ type: 'error', text: `设置失败: ${error.message}` });
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('确定要清除所有 V3 同步配置和缓存吗？这将禁用 V3 同步并清除本地缓存。')) {
      return;
    }

    setLoading(true);
    try {
      await window.electronAPI.sync.clearAll();
      setMessage({ type: 'success', text: '所有配置和缓存已清除' });
      setSyncStatus(null);
      setConfig({ username: '', password: '', baseUrl: 'https://dav.jianguoyun.com/dav' });
    } catch (error) {
      setMessage({ type: 'error', text: `清除失败: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleCleanupImages = async () => {
    console.log('[前端] handleCleanupImages 开始执行');

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

  const getStatusIcon = () => {
    if (!syncStatus || !syncStatus.enabled) {
      return <CloudOffIcon color="disabled" />;
    }

    if (syncStatus.status === 'syncing') {
      return <SyncIcon color="primary" sx={{
        animation: `${rotate} 1s linear infinite`
      }} />;
    }

    if (syncStatus.status === 'error') {
      return <ErrorIcon color="error" />;
    }

    return <CloudIcon color="success" />;
  };

  const getStatusText = () => {
    if (!syncStatus || !syncStatus.enabled) {
      return '未启用';
    }

    if (syncStatus.status === 'syncing') {
      return '同步中...';
    }

    if (syncStatus.status === 'error') {
      return '同步失败';
    }

    // 显示用户名
    if (config.username) {
      return `已连接坚果云 (${config.username})`;
    }

    return '已连接';
  };

  const getLastSyncText = () => {
    if (!syncStatus || !syncStatus.lastSyncTime || syncStatus.lastSyncTime === 0) {
      return '从未同步';
    }

    const lastSync = new Date(syncStatus.lastSyncTime);
    const now = new Date();
    const diffMinutes = Math.floor((now - lastSync) / (1000 * 60));

    if (diffMinutes < 1) {
      return '刚刚';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} 分钟前`;
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      return `${diffHours} 小时前`;
    }
  };

  const getStatusChip = () => {
    if (!syncStatus || !syncStatus.enabled) {
      return <Chip label="未启用" size="small" />;
    }

    const statusMap = {
      idle: { label: '空闲', color: 'default' },
      syncing: { label: '同步中...', color: 'primary' },
      success: { label: '成功', color: 'success' },
      error: { label: '错误', color: 'error' },
    };

    const status = statusMap[syncStatus.status] || { label: syncStatus.status, color: 'default' };
    return <Chip label={status.label} size="small" color={status.color} />;
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
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {getStatusIcon()}
                <Typography variant="h6" sx={{ ml: 1 }}>
                  {getStatusText()}
                </Typography>
              </Box>
              {getStatusChip()}
            </Box>

            {syncStatus && syncStatus.enabled && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  最后同步: {getLastSyncText()}
                </Typography>

                {autoSync && (
                  <Chip
                    label={`自动同步已启用 (${autoSyncInterval}分钟)`}
                    size="small"
                    color="primary"
                    sx={{ mt: 1 }}
                  />
                )}

                {syncStatus.lastError && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {syncStatus.lastError}
                  </Alert>
                )}
              </Box>
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

          {/* 配置区域 */}
          {!syncStatus || !syncStatus.enabled ? (
            // 未启用时显示配置表单
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                坚果云 WebDAV 配置
              </Typography>
              <Alert severity="info" sx={{ mb: 2 }}>
                FlashNote V3 使用原子化同步系统，支持增量同步和冲突检测。请在坚果云设置中获取应用密码。
              </Alert>

              <Stack spacing={2}>
                <TextField
                  fullWidth
                  label="WebDAV 地址"
                  value={config.baseUrl}
                  onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                  size="small"
                />
                <TextField
                  fullWidth
                  label="用户名"
                  value={config.username}
                  onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  size="small"
                  placeholder="您的坚果云账号"
                />
                <TextField
                  fullWidth
                  label="应用密码"
                  type="password"
                  value={config.password}
                  onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  size="small"
                  placeholder="不是登录密码，需要在坚果云设置中生成"
                  helperText="前往坚果云网页版 > 账户信息 > 安全选项 > 添加应用"
                />

                <Box display="flex" gap={1}>
                  <Button
                    variant="outlined"
                    onClick={handleTestConnection}
                    disabled={testing || loading}
                    startIcon={testing && <CircularProgress size={16} />}
                    size="small"
                  >
                    {testing ? '测试中...' : '测试连接'}
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleEnableSync}
                    disabled={loading}
                    startIcon={loading && <CircularProgress size={16} />}
                  >
                    {loading ? '启用中...' : '启用同步'}
                  </Button>
                </Box>
              </Stack>
            </Box>
          ) : (
            // 已启用时显示控制面板
            <>
              {/* 账户管理 */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  账户管理
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    color="error"
                    onClick={handleDisableSync}
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={16} /> : <CloudOffIcon />}
                  >
                    {loading ? '断开中...' : '断开账户'}
                  </Button>
                </Box>
              </Box>

              <Divider sx={{ my: 3 }} />

              {/* 自动同步设置 */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  自动同步
                </Typography>
                <Stack spacing={2}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={autoSync}
                        onChange={(e) => handleToggleAutoSync(e.target.checked)}
                      />
                    }
                    label="启用自动同步"
                  />
                  {autoSync && (
                    <FormControl size="small" fullWidth>
                      <InputLabel>同步间隔</InputLabel>
                      <Select
                        value={autoSyncInterval}
                        label="同步间隔"
                        onChange={(e) => handleSetAutoSyncInterval(e.target.value)}
                      >
                        <MenuItem value={1}>1 分钟</MenuItem>
                        <MenuItem value={5}>5 分钟</MenuItem>
                        <MenuItem value={10}>10 分钟</MenuItem>
                        <MenuItem value={30}>30 分钟</MenuItem>
                        <MenuItem value={60}>1 小时</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                </Stack>
              </Box>

              <Divider sx={{ my: 3 }} />

              {/* 同步操作 */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  同步操作
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleManualSync}
                    disabled={syncing}
                    startIcon={syncing ? <CircularProgress size={16} /> : <RefreshIcon />}
                  >
                    {syncing ? '同步中...' : '立即同步'}
                  </Button>

                  <Button
                    variant="outlined"
                    size="small"
                    color="warning"
                    onClick={handleForceFullSync}
                    disabled={syncing}
                    startIcon={<RefreshIcon />}
                  >
                    强制全量同步
                  </Button>
                </Box>
              </Box>

              <Divider sx={{ my: 3 }} />

              {/* 维护 */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  {t('cloudSync.maintenance')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  {t('cloudSync.maintenanceDesc')}
                </Typography>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
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

                  <Box sx={{ flex: 1 }} />

                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleCleanupImages}
                    disabled={syncing || cleaningImages}
                    startIcon={cleaningImages ? <CircularProgress size={16} /> : <DeleteIcon />}
                  >
                    {cleaningImages ? t('cloudSync.cleaning') : t('cloudSync.cleanupUnusedImages')}
                  </Button>
                </Box>
              </Box>

              <Divider sx={{ my: 3 }} />

              {/* 危险操作 */}
              <Box>
                <Typography variant="subtitle2" gutterBottom color="error">
                  危险操作
                </Typography>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleClearAll}
                  disabled={loading}
                  size="small"
                  startIcon={<DeleteIcon />}
                >
                  清除所有配置和缓存
                </Button>
              </Box>
            </>
          )}

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
              <Button size="small" onClick={() => setShowCleanupDialog(false)}>
                {t('common.cancel')}
              </Button>
              <Button size="small" onClick={handleConfirmCleanup} variant="contained" color="error">
                {t('cloudSync.confirmDelete')}
              </Button>
            </DialogActions>
          </Dialog>
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
