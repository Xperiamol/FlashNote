import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Switch,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Divider,
  Slider,
  CircularProgress,
  Link,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction
} from '@mui/material';
import {
  Psychology as AIIcon,
  Check as CheckIcon,
  Info as InfoIcon
} from '@mui/icons-material';

const AISettings = ({ showSnackbar }) => {
  const [config, setConfig] = useState({
    enabled: false,
    provider: 'openai',
    apiKey: '',
    apiUrl: '',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 2000
  });

  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
    loadProviders();
  }, []);

  const loadConfig = async () => {
    try {
      if (window.electronAPI?.ai) {
        const result = await window.electronAPI.ai.getConfig();
        if (result?.success && result.data) {
          setConfig(result.data);
          updateSelectedProvider(result.data.provider);
        }
      }
    } catch (error) {
      console.error('加载AI配置失败:', error);
      if (showSnackbar) showSnackbar('加载配置失败', 'error');
    }
  };

  const loadProviders = async () => {
    try {
      if (window.electronAPI?.ai) {
        const result = await window.electronAPI.ai.getProviders();
        if (result?.success && result.data) {
          setProviders(result.data);
          if (result.data.length > 0) {
            updateSelectedProvider(config.provider);
          }
        }
      }
    } catch (error) {
      console.error('加载AI提供商列表失败:', error);
    }
  };

  const updateSelectedProvider = (providerId) => {
    const provider = providers.find(p => p.id === providerId);
    setSelectedProvider(provider);
  };

  const handleConfigChange = async (field, value) => {
    const newConfig = {
      ...config,
      [field]: value
    };
    setConfig(newConfig);
    
    // 自动保存逻辑：除了文本输入框外，其他修改立即保存
    // 文本输入框(apiKey, apiUrl)在 onBlur 时保存，避免频繁IO
    if (!['apiKey', 'apiUrl'].includes(field)) {
      await saveConfigToBackend(newConfig);
    }
  };

  const handleTextBlur = async () => {
    await saveConfigToBackend(config);
  };

  const saveConfigToBackend = async (configToSave) => {
    setSaving(true);
    try {
      const result = await window.electronAPI.ai.saveConfig(configToSave);
      if (!result?.success) {
        if (showSnackbar) showSnackbar(result.error || '保存失败', 'error');
      } else {
        if (showSnackbar) showSnackbar('配置已保存', 'success');
      }
    } catch (error) {
      console.error('保存AI配置失败:', error);
      if (showSnackbar) showSnackbar('保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleProviderChange = (providerId) => {
    const provider = providers.find(p => p.id === providerId);
    setSelectedProvider(provider);
    
    const newConfig = {
      ...config,
      provider: providerId,
      // 切换提供商时，更新默认模型
      model: (provider && provider.models && provider.models.length > 0) ? provider.models[0] : config.model
    };
    
    setConfig(newConfig);
    saveConfigToBackend(newConfig);
  };

  const handleTestConnection = async () => {
    if (!config.apiKey) {
      if (showSnackbar) showSnackbar('请先输入API密钥', 'warning');
      return;
    }

    if (config.provider === 'custom' && !config.apiUrl) {
      if (showSnackbar) showSnackbar('请先输入自定义API地址', 'warning');
      return;
    }

    setTesting(true);

    try {
      const result = await window.electronAPI.ai.testConnection(config);
      if (result?.success) {
        if (showSnackbar) showSnackbar(result.message || '连接测试成功', 'success');
      } else {
        if (showSnackbar) showSnackbar(result.error || '连接测试失败', 'error');
      }
    } catch (error) {
      if (showSnackbar) showSnackbar(error.message || '连接测试失败', 'error');
    } finally {
      setTesting(false);
    }
  };

  const getProviderDocLink = (providerId) => {
    const links = {
      openai: 'https://platform.openai.com/api-keys',
      deepseek: 'https://platform.deepseek.com/api_keys',
      qwen: 'https://dashscope.console.aliyun.com/apiKey'
    };
    return links[providerId] || null;
  };

  return (
    <Box>
      <List>
        {/* AI 功能开关 */}
        <ListItem>
          <ListItemText
            primary="AI 功能"
            secondary="启用AI功能为后续功能提供智能支持"
          />
          <ListItemSecondaryAction>
            <Switch
              checked={config.enabled}
              onChange={(e) => handleConfigChange('enabled', e.target.checked)}
              color="primary"
            />
          </ListItemSecondaryAction>
        </ListItem>

        <Divider />

        {/* 提供商选择 */}
        <ListItem>
          <Box sx={{ width: '100%', pt: 1, pb: 1 }}>
            <FormControl fullWidth>
              <InputLabel>AI 服务提供商</InputLabel>
              <Select
                value={config.provider}
                label="AI 服务提供商"
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {providers.map(provider => (
                  <MenuItem key={provider.id} value={provider.id}>
                    <Box>
                      <Typography variant="body1">{provider.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {provider.description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </ListItem>

        <Divider />

        {/* API Key */}
        <ListItem>
          <Box sx={{ width: '100%', pt: 1, pb: 1 }}>
            <TextField
              fullWidth
              label="API Key"
              type="password"
              value={config.apiKey}
              onChange={(e) => handleConfigChange('apiKey', e.target.value)}
              onBlur={handleTextBlur}
              placeholder="请输入API密钥"
              helperText={
                selectedProvider && getProviderDocLink(config.provider) && (
                  <Link 
                    href="#" 
                    onClick={(e) => {
                      e.preventDefault();
                      if (window.electronAPI?.system) {
                        window.electronAPI.system.openExternal(getProviderDocLink(config.provider));
                      }
                    }}
                  >
                    如何获取API Key?
                  </Link>
                )
              }
            />
          </Box>
        </ListItem>

        {/* 自定义 API URL */}
        {config.provider === 'custom' && (
          <>
            <Divider />
            <ListItem>
              <Box sx={{ width: '100%', pt: 1, pb: 1 }}>
                <TextField
                  fullWidth
                  label="API URL"
                  value={config.apiUrl}
                  onChange={(e) => handleConfigChange('apiUrl', e.target.value)}
                  onBlur={handleTextBlur}
                  placeholder="https://api.example.com/v1/chat/completions"
                  helperText="兼容OpenAI API格式的自定义服务地址"
                />
              </Box>
            </ListItem>
          </>
        )}

        <Divider />

        {/* 模型选择 */}
        <ListItem>
          <Box sx={{ width: '100%', pt: 1, pb: 1 }}>
            {selectedProvider && selectedProvider.models && selectedProvider.models.length > 0 ? (
              <FormControl fullWidth>
                <InputLabel>模型</InputLabel>
                <Select
                  value={config.model}
                  label="模型"
                  onChange={(e) => handleConfigChange('model', e.target.value)}
                >
                  {selectedProvider.models.map(model => (
                    <MenuItem key={model} value={model}>
                      {model}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <TextField
                fullWidth
                label="模型名称"
                value={config.model}
                onChange={(e) => handleConfigChange('model', e.target.value)}
                onBlur={handleTextBlur}
                placeholder="gpt-3.5-turbo"
              />
            )}
          </Box>
        </ListItem>

        <Divider />

        {/* Temperature */}
        <ListItem>
          <Box sx={{ width: '100%', pt: 2, pb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Temperature (创造性): {config.temperature}
            </Typography>
            <Slider
              value={config.temperature}
              onChange={(e, value) => handleConfigChange('temperature', value)}
              min={0}
              max={2}
              step={0.1}
              marks={[
                { value: 0, label: '0' },
                { value: 1, label: '1' },
                { value: 2, label: '2' }
              ]}
              valueLabelDisplay="auto"
            />
            <Typography variant="caption" color="text.secondary">
              较低的值使输出更确定，较高的值使输出更有创造性
            </Typography>
          </Box>
        </ListItem>

        <Divider />

        {/* Max Tokens */}
        <ListItem>
          <Box sx={{ width: '100%', pt: 2, pb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              最大Token数: {config.maxTokens}
            </Typography>
            <Slider
              value={config.maxTokens}
              onChange={(e, value) => handleConfigChange('maxTokens', value)}
              min={100}
              max={4000}
              step={100}
              marks={[
                { value: 100, label: '100' },
                { value: 2000, label: '2000' },
                { value: 4000, label: '4000' }
              ]}
              valueLabelDisplay="auto"
            />
            <Typography variant="caption" color="text.secondary">
              控制AI响应的最大长度
            </Typography>
          </Box>
        </ListItem>

        <Divider />

        {/* 操作按钮 */}
        <ListItem>
          <Box sx={{ display: 'flex', gap: 2, pt: 1, pb: 1 }}>
            <Button
              variant="outlined"
              onClick={handleTestConnection}
              disabled={!config.apiKey || testing}
              startIcon={testing ? <CircularProgress size={16} /> : <CheckIcon />}
            >
              {testing ? '测试中...' : '测试连接'}
            </Button>
          </Box>
        </ListItem>
      </List>

      {/* 使用说明 */}
      <Alert severity="info" icon={<InfoIcon />} sx={{ mt: 3 }}>
        <Typography variant="body2" gutterBottom>
          <strong>使用说明：</strong>
        </Typography>
        <Typography variant="body2" component="div">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>配置完成后，AI功能将可供后续功能/插件调用</li>
            <li>建议先测试连接确保配置正确</li>
            <li>API密钥将安全存储在本地数据库中</li>
            <li>不同的AI提供商可能有不同的定价策略，请查看官方文档</li>
          </ul>
        </Typography>
      </Alert>
    </Box>
  );
};

export default AISettings;
