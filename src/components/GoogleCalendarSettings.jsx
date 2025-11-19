import React, { useState, useEffect } from 'react';
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
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Chip,
} from '@mui/material';
import { Sync, CheckCircle, CloudSync, Google as GoogleIcon, LinkOff } from '@mui/icons-material';

const GoogleCalendarSettings = () => {
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
    setMessage({ type: 'info', text: '正在启动授权流程,浏览器即将打开...' });
    
    try {
      // 新版本:本地服务器自动接收授权,无需手动输入授权码
      const result = await window.electronAPI.invoke('google-calendar:start-auth');
      
      if (result.success) {
        // 授权成功,直接获得日历列表
        setCalendars(result.data.calendars);
        setConfig({ ...config, connected: true });
        setMessage({ type: 'success', text: `授权成功！找到 ${result.data.calendars.length} 个日历` });
      } else {
        // 显示详细错误信息
        const errorLines = result.error.split('\n');
        setMessage({ 
          type: 'error', 
          text: errorLines[0] // 显示第一行
        });
        
        // 如果有详细信息,在控制台显示
        if (errorLines.length > 1) {
          console.error('[GoogleCalendar] 详细错误:', result.error);
        }
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
        setMessage({ type: 'success', text: '已断开 Google Calendar 连接' });
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
        setMessage({ type: 'success', text: '配置已保存' });
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
          text: `同步完成！上传: ${result.data.localToRemote}, 下载: ${result.data.remoteToLocal}`,
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
  const handleSelectCalendar = (calendarId) => {
    setConfig({ ...config, calendarId });
  };

  return (
    <Box>
      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <List>
        {/* 启用开关 (仅在连接后显示) */}
        <ListItem disabled={!config.connected}>
          <ListItemText
            primary="启用日历同步"
            secondary={
              !config.connected 
                ? '请先连接 Google 账号' 
                : (status && config.enabled && lastSync ? `上次同步: ${new Date(lastSync).toLocaleString('zh-CN')}` : '开启后自动同步日历事件')
            }
          />
          <ListItemSecondaryAction>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {status && config.enabled && status.syncing && (
                <CircularProgress size={20} />
              )}
              <Switch
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                disabled={!config.connected}
              />
            </Box>
          </ListItemSecondaryAction>
        </ListItem>

        <Divider />

        {/* 账号连接 */}
        <ListItem>
          <Box sx={{ width: '100%' }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>账号连接</Typography>
            
            {!config.connected ? (
              <Box sx={{ textAlign: 'center', py: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  使用 OAuth 2.0 安全授权,无需密码
                </Typography>
                
                {authorizing ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <CircularProgress size={24} sx={{ mb: 1 }} />
                    <Typography variant="caption" color="text.secondary">
                      正在授权,请在浏览器中完成操作...
                    </Typography>
                  </Box>
                ) : (
                  <Button
                    variant="contained"
                    startIcon={<GoogleIcon />}
                    onClick={handleStartAuth}
                    sx={{ bgcolor: '#4285f4', '&:hover': { bgcolor: '#357ae8' } }}
                  >
                    连接 Google 账号
                  </Button>
                )}
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, bgcolor: 'success.lighter', borderRadius: 1, border: '1px solid', borderColor: 'success.light' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <CheckCircle color="success" sx={{ mr: 1 }} />
                  <Typography variant="body2">
                    已连接到 Google Calendar
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  startIcon={<LinkOff />}
                  onClick={handleDisconnect}
                >
                  断开连接
                </Button>
              </Box>
            )}
          </Box>
        </ListItem>

        {/* 日历选择 */}
        {config.connected && calendars.length > 0 && (
          <>
            <Divider />
            <ListItem>
              <Box sx={{ width: '100%' }}>
                <Typography variant="subtitle2" sx={{ mb: 2 }}>选择日历</Typography>
                <List disablePadding>
                  {calendars.map((cal) => (
                    <ListItem
                      key={cal.id}
                      button
                      selected={config.calendarId === cal.id}
                      onClick={() => handleSelectCalendar(cal.id)}
                      sx={{
                        border: '1px solid',
                        borderColor: config.calendarId === cal.id ? 'primary.main' : 'divider',
                        borderRadius: 1,
                        mb: 1,
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {cal.displayName}
                            {cal.primary && <Chip label="主日历" size="small" color="primary" />}
                          </Box>
                        }
                        secondary={cal.description || `访问权限: ${cal.accessRole}`}
                      />
                      {config.calendarId === cal.id && <CheckCircle color="primary" />}
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
                <Typography variant="subtitle2" sx={{ mb: 2 }}>同步选项</Typography>
                <FormControl fullWidth sx={{ mb: 2 }} size="small">
                  <InputLabel>同步方向</InputLabel>
                  <Select
                    value={config.syncDirection}
                    label="同步方向"
                    onChange={(e) => setConfig({ ...config, syncDirection: e.target.value })}
                  >
                    <MenuItem value="bidirectional">
                      <Box>
                        <Typography>双向同步</Typography>
                        <Typography variant="caption" color="text.secondary">
                          FlashNote ↔ Google Calendar (推荐)
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="upload">
                      <Box>
                        <Typography>仅上传</Typography>
                        <Typography variant="caption" color="text.secondary">
                          FlashNote → Google Calendar
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="download">
                      <Box>
                        <Typography>仅下载</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Google Calendar → FlashNote
                        </Typography>
                      </Box>
                    </MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel>自动同步间隔</InputLabel>
                  <Select
                    value={config.syncInterval}
                    label="自动同步间隔"
                    onChange={(e) => setConfig({ ...config, syncInterval: e.target.value })}
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
                  保存配置
                </Button>

                <Button
                  variant="outlined"
                  size="small"
                  startIcon={syncing ? <CircularProgress size={16} /> : <Sync />}
                  onClick={handleSyncNow}
                  disabled={!config.enabled || syncing || !config.calendarId}
                >
                  立即同步
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
              ✨ 特点
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • 使用 OAuth 2.0 安全授权,无需密码<br />
              • 支持双向同步,在两端修改都会同步<br />
              • 自动刷新授权,长期有效<br />
              • 可选择同步到哪个日历<br />
              • 一键授权,浏览器自动完成
            </Typography>
            
            <Typography variant="subtitle2" gutterBottom color="text.secondary" sx={{ mt: 2 }}>
              📖 使用说明
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
