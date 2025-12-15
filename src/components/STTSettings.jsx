import React, { useState, useEffect } from 'react';
import { useTranslation } from '../utils/i18n';
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
  CircularProgress,
  Link,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction
} from '@mui/material';
import {
  RecordVoiceOver as STTIcon,
  Check as CheckIcon,
  Info as InfoIcon
} from '@mui/icons-material';

const STTSettings = ({ showSnackbar }) => {
  const { t } = useTranslation();
  const [config, setConfig] = useState({
    enabled: false,
    provider: 'openai',
    apiKey: '',
    apiUrl: '',
    model: 'whisper-1',
    language: 'auto'
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
      if (window.electronAPI?.stt) {
        const result = await window.electronAPI.stt.getConfig();
        if (result?.success && result.data) {
          setConfig(result.data);
          updateSelectedProvider(result.data.provider);
        }
      }
    } catch (error) {
      console.error('加载STT配置失败:', error);
      if (showSnackbar) showSnackbar(t('stt.loadConfigFailed'), 'error');
    }
  };

  const loadProviders = async () => {
    try {
      if (window.electronAPI?.stt) {
        const result = await window.electronAPI.stt.getProviders();
        if (result?.success && result.data) {
          setProviders(result.data);
          if (result.data.length > 0) {
            updateSelectedProvider(config.provider);
          }
        }
      }
    } catch (error) {
      console.error('加载STT提供商列表失败:', error);
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
      const result = await window.electronAPI.stt.saveConfig(configToSave);
      if (!result?.success) {
        if (showSnackbar) showSnackbar(result.error || t('stt.saveFailed'), 'error');
      } else {
        if (showSnackbar) showSnackbar(t('stt.configSaved'), 'success');
      }
    } catch (error) {
      console.error('保存STT配置失败:', error);
      if (showSnackbar) showSnackbar(t('stt.saveFailed'), 'error');
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
      // 切换提供商时，更新默认模型和语言
      model: (provider && provider.models && provider.models.length > 0) ? provider.models[0] : config.model,
      language: 'auto'
    };

    setConfig(newConfig);
    saveConfigToBackend(newConfig);
  };

  const handleTestConnection = async () => {
    if (!config.apiKey) {
      if (showSnackbar) showSnackbar(t('stt.enterApiKey'), 'warning');
      return;
    }

    if (config.provider === 'custom' && !config.apiUrl) {
      if (showSnackbar) showSnackbar(t('stt.enterCustomApiUrl'), 'warning');
      return;
    }

    setTesting(true);

    try {
      const result = await window.electronAPI.stt.testConnection(config);
      if (result?.success) {
        if (showSnackbar) showSnackbar(result.message || t('stt.connectionTestSuccess'), 'success');
      } else {
        if (showSnackbar) showSnackbar(result.error || t('stt.connectionTestFailed'), 'error');
      }
    } catch (error) {
      if (showSnackbar) showSnackbar(error.message || t('stt.connectionTestFailed'), 'error');
    } finally {
      setTesting(false);
    }
  };

  const getProviderDocLink = (providerId) => {
    const links = {
      openai: 'https://platform.openai.com/api-keys',
      aliyun: 'https://www.aliyun.com/product/speech'
    };
    return links[providerId] || null;
  };

  return (
    <Box>
      <List>
        {/* STT 功能开关 */}
        <ListItem>
          <ListItemText
            primary={t('stt.speechToTextFeature')}
            secondary={t('stt.speechToTextDesc')}
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
            <FormControl fullWidth size="small">
              <InputLabel>{t('stt.sttProvider')}</InputLabel>
              <Select
                value={config.provider}
                label={t('stt.sttProvider')}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {providers.map(provider => (
                  <MenuItem key={provider.id} value={provider.id}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {provider.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
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
              size="small"
              label={t('stt.apiKey')}
              type="password"
              value={config.apiKey}
              onChange={(e) => handleConfigChange('apiKey', e.target.value)}
              onBlur={handleTextBlur}
              placeholder={t('stt.apiKeyPlaceholder')}
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
                    {t('stt.howToGetApiKey')}
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
                  size="small"
                  label={t('stt.apiUrl')}
                  value={config.apiUrl}
                  onChange={(e) => handleConfigChange('apiUrl', e.target.value)}
                  onBlur={handleTextBlur}
                  placeholder={t('stt.apiUrlPlaceholder')}
                  helperText={t('stt.apiUrlDesc')}
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
              <FormControl fullWidth size="small">
                <InputLabel>{t('stt.model')}</InputLabel>
                <Select
                  value={config.model}
                  label={t('stt.model')}
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
                size="small"
                label={t('stt.modelName')}
                value={config.model}
                onChange={(e) => handleConfigChange('model', e.target.value)}
                onBlur={handleTextBlur}
                placeholder={t('stt.modelPlaceholder')}
              />
            )}
          </Box>
        </ListItem>

        <Divider />

        {/* 语言选择 */}
        <ListItem>
          <Box sx={{ width: '100%', pt: 1, pb: 1 }}>
            {selectedProvider && selectedProvider.languages && selectedProvider.languages.length > 0 ? (
              <FormControl fullWidth size="small">
                <InputLabel>{t('stt.recognitionLanguage')}</InputLabel>
                <Select
                  value={config.language}
                  label={t('stt.recognitionLanguage')}
                  onChange={(e) => handleConfigChange('language', e.target.value)}
                >
                  {selectedProvider.languages.map(lang => (
                    <MenuItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <TextField
                fullWidth
                size="small"
                label={t('stt.languageCode')}
                value={config.language}
                onChange={(e) => handleConfigChange('language', e.target.value)}
                onBlur={handleTextBlur}
                placeholder={t('stt.languageCodePlaceholder')}
                helperText={t('stt.languageCodeDesc')}
              />
            )}
          </Box>
        </ListItem>

        <Divider />

        {/* 操作按钮 */}
        <ListItem>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pt: 1, pb: 1, width: '100%' }}>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="outlined"
              size="small"
              onClick={handleTestConnection}
              disabled={!config.apiKey || testing}
              startIcon={testing ? <CircularProgress size={16} /> : <CheckIcon />}
            >
              {testing ? t('stt.testing') : t('stt.testConnection')}
            </Button>
          </Box>
        </ListItem>
      </List>

      {/* 使用说明 */}
      <Alert severity="info" icon={<InfoIcon />} sx={{ mt: 3 }}>
        <Typography variant="body2" gutterBottom>
          <strong>{t('stt.usageInstructions')}：</strong>
        </Typography>
        <Typography variant="body2" component="div">
          <Box component="ul" sx={{ m: 0, pl: 3 }}>
            {t('stt.usageInstructionsList', { returnObjects: true }).map((item, index) => (
              <Box component="li" key={index}>
                {item}
              </Box>
            ))}
          </Box>
        </Typography>
      </Alert>
    </Box>
  );
};

export default STTSettings;
