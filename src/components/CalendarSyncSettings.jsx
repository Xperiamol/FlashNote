import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Tabs,
  Tab,
} from '@mui/material';
import { Sync, CheckCircle, Error as ErrorIcon, CloudSync, CalendarToday } from '@mui/icons-material';
import GoogleCalendarSettings from './GoogleCalendarSettings';

const CalendarSyncSettings = () => {
  const [syncMode, setSyncMode] = useState(0); // 0: CalDAV, 1: Google Calendar
  const [config, setConfig] = useState({
    enabled: false,
    serverUrl: '',
    username: '',
    password: '',
    calendarUrl: '',
    syncInterval: '30',
    syncDirection: 'bidirectional',
  });

  const [status, setStatus] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  // 加载配置
  useEffect(() => {
    loadConfig();
    loadStatus();
  }, []);

  const loadConfig = async () => {
    const result = await window.electronAPI.invoke('caldav:get-config');
    if (result.success) {
      setConfig(result.data);
    }
  };

  const loadStatus = async () => {
    const result = await window.electronAPI.invoke('caldav:get-status');
    if (result.success) {
      setStatus(result.data);
      setLastSync(result.data.lastSync);
    }
  };

  // 测试连接
  const handleTestConnection = async () => {
    if (!config.serverUrl || !config.username || !config.password) {
      setMessage({ type: 'error', text: '请填写服务器地址、用户名和密码' });
      return;
    }

    setTesting(true);
    setMessage(null);

    try {
      const result = await window.electronAPI.invoke('caldav:test-connection', config);

      if (result.success) {
        setCalendars(result.data.calendars);
        setMessage({ type: 'success', text: `连接成功！找到 ${result.data.calendars.length} 个日历` });
      } else {
        // 显示多行错误信息
        const errorLines = result.error.split('\n');
        setMessage({ 
          type: 'error', 
          text: errorLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))
        });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setTesting(false);
    }
  };

  // 保存配置
  const handleSave = async () => {
    try {
      const result = await window.electronAPI.invoke('caldav:save-config', config);

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
      const result = await window.electronAPI.invoke('caldav:sync');

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
  const handleSelectCalendar = (calendarUrl) => {
    setConfig({ ...config, calendarUrl });
  };

  return (
    <Box>
      {/* 同步模式切换 */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={syncMode}
          onChange={(e, newValue) => setSyncMode(newValue)}
          variant="fullWidth"
        >
          <Tab icon={<CloudSync />} label="CalDAV" />
          <Tab label="Google Calendar" />
        </Tabs>
      </Box>

      {/* CalDAV 设置 */}
      {syncMode === 0 && (
        <>
          {message && (
            <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
              {message.text}
            </Alert>
          )}

          <List>
            {/* 启用开关 */}
            <ListItem>
              <ListItemText
                primary="启用日历同步"
                secondary={status && config.enabled && lastSync ? `上次同步: ${new Date(lastSync).toLocaleString('zh-CN')}` : '开启后自动同步日历事件'}
              />
              <ListItemSecondaryAction>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {status && config.enabled && status.syncing && (
                    <CircularProgress size={20} />
                  )}
                  <Switch
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  />
                </Box>
              </ListItemSecondaryAction>
            </ListItem>

            <Divider />

            {/* 服务器配置 */}
            <ListItem>
              <Box sx={{ width: '100%' }}>
                <Typography variant="subtitle2" sx={{ mb: 2 }}>服务器配置</Typography>
                <TextField
                  fullWidth
                  label="CalDAV 服务器地址"
                  placeholder="https://caldav.example.com"
                  value={config.serverUrl}
                  onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
                  sx={{ mb: 2 }}
                  size="small"
                  helperText="Google: https://www.google.com/calendar/dav | iCloud: https://caldav.icloud.com"
                />

                <TextField
                  fullWidth
                  label="用户名"
                  value={config.username}
                  onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  sx={{ mb: 2 }}
                  size="small"
                />

                <TextField
                  fullWidth
                  label="密码/应用专用密码"
                  type="password"
                  value={config.password}
                  onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  sx={{ mb: 2 }}
                  size="small"
                  helperText="建议使用应用专用密码而不是主密码"
                />

                <Button
                  variant="outlined"
                  size="small"
                  startIcon={testing ? <CircularProgress size={16} /> : <CheckCircle />}
                  onClick={handleTestConnection}
                  disabled={testing}
                >
                  测试连接
                </Button>
              </Box>
            </ListItem>

            {/* 日历选择 */}
            {calendars.length > 0 && (
              <>
                <Divider />
                <ListItem>
                  <Box sx={{ width: '100%' }}>
                    <Typography variant="subtitle2" sx={{ mb: 2 }}>选择日历</Typography>
                    <List disablePadding>
                      {calendars.map((cal, index) => (
                        <ListItem
                          key={index}
                          button
                          selected={config.calendarUrl === cal.url}
                          onClick={() => handleSelectCalendar(cal.url)}
                          sx={{
                            border: '1px solid',
                            borderColor: config.calendarUrl === cal.url ? 'primary.main' : 'divider',
                            borderRadius: 1,
                            mb: 1,
                          }}
                        >
                          <ListItemText
                            primary={cal.displayName}
                            secondary={cal.description || cal.url}
                          />
                          {config.calendarUrl === cal.url && <CheckCircle color="primary" />}
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                </ListItem>
              </>
            )}

            <Divider />

            {/* 同步选项 */}
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
                          FlashNote ↔ 日历 (推荐)
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="upload">
                      <Box>
                        <Typography>仅上传</Typography>
                        <Typography variant="caption" color="text.secondary">
                          FlashNote → 日历
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="download">
                      <Box>
                        <Typography>仅下载</Typography>
                        <Typography variant="caption" color="text.secondary">
                          日历 → FlashNote
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
                  disabled={!config.enabled || syncing}
                >
                  立即同步
                </Button>
              </Box>
            </ListItem>

            <Divider />

            {/* 帮助信息 */}
            <ListItem>
              <Box>
                <Typography variant="subtitle2" gutterBottom color="text.secondary">
                  📝 支持的服务商
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  • Google Calendar: https://www.google.com/calendar/dav<br />
                  • iCloud: https://caldav.icloud.com<br />
                  • Nextcloud: https://your-domain.com/remote.php/dav<br />
                  • Radicale: 自托管 CalDAV 服务器
                </Typography>

                <Typography variant="subtitle2" gutterBottom color="text.secondary" sx={{ mt: 2 }}>
                  ⚡ 快速配置指南
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  1. 填写 CalDAV 服务器地址<br />
                  2. 输入账号密码 (建议使用应用专用密码)<br />
                  3. 点击"测试连接"获取日历列表<br />
                  4. 选择要同步的日历<br />
                  5. 选择同步方向和间隔<br />
                  6. 保存配置并开始同步
                </Typography>
              </Box>
            </ListItem>
          </List>
        </>
      )}

      {/* Google Calendar 设置 */}
      {syncMode === 1 && <GoogleCalendarSettings />}
    </Box>
  );
};

export default CalendarSyncSettings;
