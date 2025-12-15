import React, { useState, useEffect } from 'react';
import { useTranslation } from '../utils/i18n';
import {
  Box,
  Typography,
  Button,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Chip,
} from '@mui/material';
import { Sync, CheckCircle, CloudSync, Google as GoogleIcon, LinkOff } from '@mui/icons-material';

const GoogleCalendarSettings = () => {
  const { t } = useTranslation();
  const [config, setConfig] = useState({
    enabled: false,
    connected: false,
    calendarId: '',
    syncInterval: '30',
    syncDirection: 'bidirectional',
  });

  const [status, setStatus] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [message, setMessage] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  // 加载配置
  useEffect(() => {
    loadConfig();
    loadStatus();
  }, []);

  const loadConfig = async () => {
    const result = await window.electronAPI.invoke('google-calendar:get-config');
    if (result.success) {
      setConfig(result.data);
      
      // 如果已连接,加载日历列表
      if (result.data.connected) {
        loadCalendars();
      }
    }
  };

  const loadStatus = async () => {
    const result = await window.electronAPI.invoke('google-calendar:get-status');
    if (result.success) {
      setStatus(result.data);
      setLastSync(result.data.lastSync);
    }
  };

  const loadCalendars = async () => {
    try {
      const result = await window.electronAPI.invoke('google-calendar:list-calendars');
      if (result.success) {
        setCalendars(result.data.calendars);
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      console.error('加载日历列表失败:', error);
    }
  };

  // 开始 OAuth 授权 (使用本地服务器自动接收)
  const handleStartAuth = async () => {
    setAuthorizing(true);
    setMessage({ type: 'info', text: t('googleCalendar.startAuthInfo') });
    
    try {
      // 新版本:本地服务器自动接收授权,无需手动输入授权码
      const result = await window.electronAPI.invoke('google-calendar:start-auth');
      
      if (result.success) {
        // 授权成功,直接获得日历列表
        setCalendars(result.data.calendars);
        setConfig({ ...config, connected: true });
        setMessage({
          type: 'success',
          text: t('googleCalendar.authSuccess', { count: result.data.calendars.length })
        });
      } else {
        // 显示详细错误信息
        console.error('[GoogleCalendar] 授权失败:', result.error);
        
        // 解析错误信息
        const errorMsg = result.error || '授权失败';
        const isInvalidRequest = errorMsg.toLowerCase().includes('invalid');
        
        // 构建用户友好的错误提示
        let displayMsg = errorMsg;
        if (isInvalidRequest) {
          displayMsg = '授权请求无效。这通常是因为：\n\n' +
            '1. 重定向 URI 未在 Google Cloud Console 中配置\n' +
            '2. 客户端 ID 或密钥配置错误\n' +
            '3. 网络连接问题\n\n' +
            '请查看文档 docs/GOOGLE_CALENDAR_OAUTH_SETUP.md 了解详细配置步骤。\n\n' +
            '或者按 Ctrl+Shift+I 打开开发者工具查看详细日志。';
        }
        
        setMessage({ 
          type: 'error', 
          text: displayMsg
        });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setAuthorizing(false);
    }
  };

  // 断开连接
  const handleDisconnect = async () => {
    try {
      const result = await window.electronAPI.invoke('google-calendar:disconnect');
      
      if (result.success) {
        setConfig({ ...config, enabled: false, connected: false, calendarId: '' });
        setCalendars([]);
        setMessage({ type: 'success', text: t('googleCalendar.disconnectSuccess') });
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  // 保存配置
  const handleSave = async () => {
    try {
      const result = await window.electronAPI.invoke('google-calendar:save-config', config);

      if (result.success) {
        setMessage({ type: 'success', text: t('googleCalendar.saveSuccess') });
        await loadStatus();
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  // 立即同步
  const handleSyncNow = async () => {
    setSyncing(true);
    setMessage(null);

    try {
      const result = await window.electronAPI.invoke('google-calendar:sync');

      if (result.success) {
        setMessage({
          type: 'success',
          text: t('googleCalendar.syncComplete', {
            up: result.data.localToRemote,
            down: result.data.remoteToLocal
          })
        });
        await loadStatus();
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSyncing(false);
    }
  };

  // 选择日历
  const handleSelectCalendar = async (calendarId) => {
    setConfig({ ...config, calendarId });
    // 立即保存以保持与 SyncStatusIndicator 同步
    try {
      const result = await window.electronAPI.invoke('google-calendar:save-config', {
        ...config,
        calendarId
      });
      if (result.success) {
        await loadStatus();
      }
    } catch (error) {
      console.error('保存配置失败:', error);
    }
  };

  return (
    <Box>
      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <List>
        {/* 同步开关 - 移到最上面 */}
        <ListItem disabled={!config.connected}>
          <ListItemText
            primary={t('googleCalendar.enableSync')}
            secondary={
              !config.connected
                ? t('googleCalendar.needConnectFirst')
                : (status && config.enabled && lastSync
                    ? t('googleCalendar.lastSync', { time: new Date(lastSync).toLocaleString('zh-CN') })
                    : t('googleCalendar.enableSyncDesc'))
            }
          />
          <ListItemSecondaryAction>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {status && config.enabled && status.syncing && <CircularProgress size={20} />}
              <Switch
                checked={config.enabled}
                onChange={async (e) => {
                  const newEnabled = e.target.checked;
                  setConfig({ ...config, enabled: newEnabled });
                  // 立即保存以保持与 SyncStatusIndicator 同步
                  try {
                    const result = await window.electronAPI.invoke('google-calendar:save-config', {
                      ...config,
                      enabled: newEnabled
                    });
                    if (result.success) {
                      await loadStatus();
                    }
                  } catch (error) {
                    console.error('保存配置失败:', error);
                  }
                }}
                disabled={!config.connected}
              />
            </Box>
          </ListItemSecondaryAction>
        </ListItem>

        <Divider />

        {/* 账号连接 */}
        <ListItem>
          <Box sx={{ width: '100%' }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('googleCalendar.accountConnection')}
            </Typography>
            
            {!config.connected ? (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 2,
                  px: 2,
                }}
              >
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {t('googleCalendar.oauthHint')}
                </Typography>
                
                {authorizing ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <CircularProgress size={24} sx={{ mb: 1 }} />
                    <Typography variant="caption" color="text.secondary">
                      {t('googleCalendar.authorizing')}
                    </Typography>
                  </Box>
                ) : (
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<GoogleIcon />}
                    onClick={handleStartAuth}
                  >
                    {t('googleCalendar.connectAccount')}
                  </Button>
                )}
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <CheckCircle color="success" sx={{ mr: 1 }} />
                  <Typography variant="body2">
                    {t('googleCalendar.connected')}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  startIcon={<LinkOff />}
                  onClick={handleDisconnect}
                >
                  {t('googleCalendar.disconnect')}
                </Button>
              </Box>
            )}
          </Box>
        </ListItem>

        <Divider />



        {/* 日历选择 */}
        {config.connected && calendars.length > 0 && (
          <>
            <Divider />
            <ListItem>
              <Box sx={{ width: '100%' }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t('googleCalendar.selectCalendar')}
                </Typography>
                <List disablePadding>
                  {calendars.map((cal) => (
                    <ListItem
                      key={cal.id}
                      disablePadding
                      sx={{ mb: 1 }}
                    >
                      <ListItemButton
                        selected={config.calendarId === cal.id}
                        onClick={() => handleSelectCalendar(cal.id)}
                        sx={{
                          border: '1px solid',
                          borderColor: config.calendarId === cal.id ? 'primary.main' : 'divider',
                          borderRadius: 1,
                        }}
                      >
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {cal.displayName}
                              {cal.primary && <Chip label={t('googleCalendar.primaryCalendar')} size="small" color="primary" />}
                            </Box>
                          }
                          primaryTypographyProps={{ component: 'div' }}
                          secondary={cal.description || `访问权限: ${cal.accessRole}`}
                        />
                        {config.calendarId === cal.id && <CheckCircle color="primary" />}
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </Box>
            </ListItem>
          </>
        )}

        {/* 同步选项 */}
        {config.connected && (
          <>
            <Divider />
            <ListItem>
              <Box sx={{ width: '100%' }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t('googleCalendar.syncOptions')}
                </Typography>
                <FormControl fullWidth sx={{ mb: 2 }} size="small">
                  <InputLabel>{t('googleCalendar.syncDirection')}</InputLabel>
                  <Select
                    value={config.syncDirection}
                    label={t('googleCalendar.syncDirection')}
                    onChange={async (e) => {
                      const newDirection = e.target.value;
                      setConfig({ ...config, syncDirection: newDirection });
                      // 立即保存以保持与 SyncStatusIndicator 同步
                      try {
                        const result = await window.electronAPI.invoke('google-calendar:save-config', {
                          ...config,
                          syncDirection: newDirection
                        });
                        if (result.success) {
                          await loadStatus();
                        }
                      } catch (error) {
                        console.error('保存配置失败:', error);
                      }
                    }}
                  >
                    <MenuItem value="bidirectional">
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {t('googleCalendar.directionBidirectionalTitle')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {t('googleCalendar.directionBidirectionalDesc')}
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="upload">
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {t('googleCalendar.directionUploadTitle')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {t('googleCalendar.directionUploadDesc')}
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="download">
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {t('googleCalendar.directionDownloadTitle')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {t('googleCalendar.directionDownloadDesc')}
                        </Typography>
                      </Box>
                    </MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel>{t('googleCalendar.syncInterval')}</InputLabel>
                  <Select
                    value={config.syncInterval}
                    label={t('googleCalendar.syncInterval')}
                    onChange={async (e) => {
                      const newInterval = e.target.value;
                      setConfig({ ...config, syncInterval: newInterval });
                      // 立即保存以保持与 SyncStatusIndicator 同步
                      try {
                        const result = await window.electronAPI.invoke('google-calendar:save-config', {
                          ...config,
                          syncInterval: newInterval
                        });
                        if (result.success) {
                          await loadStatus();
                        }
                      } catch (error) {
                        console.error('保存配置失败:', error);
                      }
                    }}
                  >
                    <MenuItem value="15">15 分钟</MenuItem>
                    <MenuItem value="30">30 分钟</MenuItem>
                    <MenuItem value="60">1 小时</MenuItem>
                    <MenuItem value="180">3 小时</MenuItem>
                    <MenuItem value="360">6 小时</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </ListItem>

            <Divider />

            {/* 操作按钮 */}
            <ListItem>
              <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<CheckCircle />}
                  onClick={handleSave}
                >
                  {t('googleCalendar.saveConfig')}
                </Button>

                <Button
                  variant="outlined"
                  size="small"
                  startIcon={syncing ? <CircularProgress size={16} /> : <Sync />}
                  onClick={handleSyncNow}
                  disabled={!config.enabled || syncing || !config.calendarId}
                >
                  {t('googleCalendar.syncNow')}
                </Button>
              </Box>
            </ListItem>
          </>
        )}

        <Divider />

        {/* 帮助信息 */}
        <ListItem>
          <Box>
            <Typography variant="subtitle2" gutterBottom color="text.secondary">
              特点
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • 使用 OAuth 2.0 安全授权,无需密码<br />
              • 支持双向同步,在两端修改都会同步<br />
              • 自动刷新授权,长期有效<br />
              • 可选择同步到哪个日历<br />
              • 一键授权,浏览器自动完成
            </Typography>
            
            <Typography variant="subtitle2" gutterBottom color="text.secondary" sx={{ mt: 2 }}>
              使用说明
            </Typography>
            <Typography variant="body2" color="text.secondary">
              1. 点击"连接 Google 账号"按钮<br />
              2. 浏览器会自动打开 Google 授权页面<br />
              3. 登录并点击"允许"授予权限<br />
              4. 授权成功后自动返回,无需手动操作<br />
              5. 选择日历并配置同步选项
            </Typography>
          </Box>
        </ListItem>
      </List>
    </Box>
  );
};

export default GoogleCalendarSettings;
