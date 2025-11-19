import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
} from '@mui/material';
import { CheckCircle, Error as ErrorIcon, Wifi, WifiOff } from '@mui/icons-material';

const ProxySettings = ({ showSnackbar }) => {
  const [config, setConfig] = useState({
    enabled: false,
    host: '127.0.0.1',
    port: '7890',
    protocol: 'http',
  });

  const [testing, setTesting] = useState(false);

  // 加载配置
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const result = await window.electronAPI.invoke('proxy:get-config');
      console.log('[ProxySettings] 收到配置:', result);
      if (result.success && result.data) {
        // 确保 protocol 是字符串
        const normalizedConfig = {
          ...result.data,
          protocol: typeof result.data.protocol === 'string' 
            ? result.data.protocol 
            : 'http'
        };
        console.log('[ProxySettings] 标准化配置:', normalizedConfig);
        setConfig(normalizedConfig);
      }
    } catch (error) {
      console.error('加载代理配置失败:', error);
    }
  };

  // 保存配置
  const handleSave = async () => {
    try {
      // 确保发送的数据格式正确
      const configToSave = {
        enabled: config.enabled,
        protocol: typeof config.protocol === 'string' ? config.protocol : 'http',
        host: config.host,
        port: config.port
      };
      console.log('[ProxySettings] 保存配置:', configToSave);
      
      const result = await window.electronAPI.invoke('proxy:save-config', configToSave);

      if (result.success) {
        if (showSnackbar) showSnackbar('代理配置已保存！重启应用后生效。', 'success');
      } else {
        if (showSnackbar) showSnackbar(result.error || '保存失败', 'error');
      }
    } catch (error) {
      if (showSnackbar) showSnackbar(error.message, 'error');
    }
  };

  // 测试代理
  const handleTest = async () => {
    setTesting(true);
    if (showSnackbar) showSnackbar('正在测试代理连接...', 'info');

    try {
      // 确保发送的数据格式正确
      const configToTest = {
        enabled: config.enabled,
        protocol: typeof config.protocol === 'string' ? config.protocol : 'http',
        host: config.host,
        port: config.port
      };
      console.log('[ProxySettings] 测试配置:', configToTest);
      
      const result = await window.electronAPI.invoke('proxy:test', configToTest);

      if (result.success) {
        if (showSnackbar) showSnackbar(`代理测试成功！延迟: ${result.data.latency}ms`, 'success');
      } else {
        if (showSnackbar) showSnackbar(result.error || '代理连接失败', 'error');
      }
    } catch (error) {
      if (showSnackbar) showSnackbar('测试失败: ' + error.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  // 获取当前代理状态
  const getProxyUrl = () => {
    if (!config.enabled) return '未启用';
    return `${config.protocol}://${config.host}:${config.port}`;
  };

  return (
    <Box>
      <List>
        {/* 当前状态 */}
        <ListItem>
          <ListItemText
            primary="代理状态"
            secondary={config.enabled ? `已启用 - ${getProxyUrl()}` : '未启用'}
          />
          <ListItemSecondaryAction>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {config.enabled ? (
                <CheckCircle color="success" />
              ) : (
                <WifiOff color="disabled" />
              )}
            </Box>
          </ListItemSecondaryAction>
        </ListItem>

        <Divider />

        {/* 启用开关 */}
        <ListItem>
          <ListItemText
            primary="启用代理"
            secondary="开启后需要重启应用生效"
          />
          <ListItemSecondaryAction>
            <Switch
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            />
          </ListItemSecondaryAction>
        </ListItem>

        <Divider />

        {/* 主机地址 */}
        <ListItem>
          <ListItemText
            primary="主机地址"
            secondary="代理服务器的地址"
          />
          <ListItemSecondaryAction>
            <TextField
              value={config.host}
              onChange={(e) => setConfig({ ...config, host: e.target.value })}
              placeholder="127.0.0.1"
              disabled={!config.enabled}
              size="small"
              sx={{ width: 200 }}
            />
          </ListItemSecondaryAction>
        </ListItem>

        <Divider />

        {/* 端口 */}
        <ListItem>
          <ListItemText
            primary="端口"
            secondary="代理服务器的端口号"
          />
          <ListItemSecondaryAction>
            <TextField
              value={config.port}
              onChange={(e) => setConfig({ ...config, port: e.target.value })}
              placeholder="7890"
              disabled={!config.enabled}
              size="small"
              sx={{ width: 120 }}
            />
          </ListItemSecondaryAction>
        </ListItem>

        <Divider />

        {/* 常用配置 */}
        <ListItem>
          <Box sx={{ width: '100%' }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              常用代理配置
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label="Clash: 7890"
                size="small"
                onClick={() => setConfig({ ...config, host: '127.0.0.1', port: '7890' })}
                sx={{ cursor: 'pointer' }}
              />
              <Chip
                label="V2rayN: 10809"
                size="small"
                onClick={() => setConfig({ ...config, host: '127.0.0.1', port: '10809' })}
                sx={{ cursor: 'pointer' }}
              />
              <Chip
                label="Shadowsocks: 1080"
                size="small"
                onClick={() => setConfig({ ...config, host: '127.0.0.1', port: '1080' })}
                sx={{ cursor: 'pointer' }}
              />
            </Box>
          </Box>
        </ListItem>

        <Divider />

        {/* 操作按钮 */}
        <ListItem>
          <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
            <Button
              variant="contained"
              onClick={handleSave}
            >
              保存配置
            </Button>

            <Button
              variant="outlined"
              onClick={handleTest}
              disabled={!config.enabled || testing}
            >
              {testing ? '测试中...' : '测试代理'}
            </Button>
          </Box>
        </ListItem>

        <Divider />

        {/* 帮助信息 */}
        <ListItem>
          <Box>
            <Typography variant="subtitle2" gutterBottom color="text.secondary">
              📖 使用说明
            </Typography>
            <Typography variant="body2" color="text.secondary">
              1. 启用代理并填写代理地址<br />
              2. 点击"保存配置"按钮<br />
              3. 重启 FlashNote 使配置生效<br />
              4. 可选：点击"测试代理"验证连接
            </Typography>
            <Typography variant="subtitle2" gutterBottom color="text.secondary" sx={{ mt: 2 }}>
              ⚠️ 注意事项
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • 配置需要重启应用后才会生效<br />
              • 确保你的代理软件正在运行<br />
              • 用于访问 Google Calendar 等国际服务
            </Typography>
          </Box>
        </ListItem>
      </List>
    </Box>
  );
};

export default ProxySettings;
