import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  Button,
  TextField,
  Alert,
  Snackbar,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Chip
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Palette as PaletteIcon,
  GetApp as ImportIcon,
  Keyboard as KeyboardIcon,
  Brightness4,
  Brightness7,
  Computer,
  Launch,
  AccountCircle,
  PhotoCamera,
  Delete,
  Restore,
  Warning as WarningIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useStore } from '../store/useStore';
import ShortcutInput from './ShortcutInput';
import { 
  DEFAULT_SHORTCUTS, 
  SHORTCUT_CATEGORIES, 
  getShortcutsByCategory,
  checkShortcutConflict,
  resetShortcutsToDefault
} from '../utils/shortcutUtils';
import shortcutManager from '../utils/ShortcutManager';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const Settings = () => {
  const { theme, setTheme, setPrimaryColor, setUserAvatar } = useStore();
  const [tabValue, setTabValue] = useState(0);
  const [settings, setSettings] = useState({
    theme: 'system',
    customThemeColor: '#1976d2',
    autoLaunch: false,
    userAvatar: ''
  });
  const [shortcuts, setShortcuts] = useState(DEFAULT_SHORTCUTS);
  const [shortcutConflicts, setShortcutConflicts] = useState({});
  const [importDialog, setImportDialog] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  useEffect(() => {
    // 加载设置
    loadSettings();
    loadShortcuts();
  }, []);

  const loadSettings = async () => {
    try {
      if (window.electronAPI?.settings) {
        const result = await window.electronAPI.settings.getAll();
        if (result && result.success && result.data) {
          // 确保布尔值类型正确
          const normalizedData = { ...result.data };
          if (normalizedData.autoLaunch !== undefined) {
            normalizedData.autoLaunch = Boolean(normalizedData.autoLaunch);
          }
          setSettings(prev => ({ ...prev, ...normalizedData }));
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadShortcuts = async () => {
    try {
      await shortcutManager.initialize();
      // 确保shortcuts不为空对象
      if (shortcutManager.shortcuts && Object.keys(shortcutManager.shortcuts).length > 0) {
        setShortcuts(shortcutManager.shortcuts);
      } else {
        console.warn('ShortcutManager shortcuts is empty, using default shortcuts');
        setShortcuts(DEFAULT_SHORTCUTS);
      }
    } catch (error) {
      console.error('Failed to load shortcuts:', error);
      setShortcuts(DEFAULT_SHORTCUTS);
    }
  };

  const handleSettingChange = async (key, value) => {
    try {
      setSettings(prev => ({ ...prev, [key]: value }));
      
      // 特殊处理开机自启
      if (key === 'autoLaunch') {
        if (window.electronAPI?.settings) {
          const result = await window.electronAPI.settings.setAutoLaunch(value);
          if (!result.success) {
            // 如果设置失败，恢复原状态
            setSettings(prev => ({ ...prev, [key]: !value }));
            showSnackbar('设置开机自启失败: ' + result.error, 'error');
            return;
          }
        }
      } else {
        // 其他设置使用通用方法
        if (window.electronAPI?.settings) {
          await window.electronAPI.settings.set(key, value);
        }
      }
      
      // 特殊处理主题切换
      if (key === 'theme') {
        setTheme(value);
      }
      
      // 特殊处理主题颜色切换
      if (key === 'customThemeColor') {
        setPrimaryColor(value);
      }
      
      showSnackbar('设置已保存', 'success');
    } catch (error) {
      console.error('Failed to save setting:', error);
      showSnackbar('保存设置失败', 'error');
    }
  };

  const handleImportData = async () => {
    try {
      setImportDialog(true);
      setImportProgress(0);
      setImportStatus('选择文件...');
      
      if (window.electronAPI?.dataImport) {
      const filePath = await window.electronAPI.dataImport.selectFile();
        if (!filePath) {
          setImportDialog(false);
          return;
        }
        
        setImportStatus('正在导入数据...');
        setImportProgress(25);
        
        const result = await window.electronAPI.dataImport.importNotes({ filePath });
        
        setImportProgress(100);
        setImportStatus(`导入完成！成功导入 ${result.count} 条笔记`);
        
        setTimeout(() => {
          setImportDialog(false);
          showSnackbar(`成功导入 ${result.count} 条笔记`, 'success');
        }, 2000);
      }
    } catch (error) {
      console.error('Import failed:', error);
      setImportStatus('导入失败：' + error.message);
      setImportProgress(0);
      showSnackbar('导入失败', 'error');
    }
  };



  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleAvatarChange = async () => {
    try {
      if (window.electronAPI?.system) {
        const result = await window.electronAPI.system.showOpenDialog({
          title: '选择头像图片',
          filters: [
            { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
          ],
          properties: ['openFile']
        });
        
        if (result && !result.canceled && result.filePaths.length > 0) {
          const filePath = result.filePaths[0];
          // 通过Electron API读取文件并转换为base64
          const base64Image = await window.electronAPI.system.readImageAsBase64(filePath);
          
          await handleSettingChange('userAvatar', base64Image);
          setUserAvatar(base64Image); // 同步更新全局状态
          showSnackbar('头像更新成功', 'success');
        }
      }
    } catch (error) {
      console.error('Failed to change avatar:', error);
      showSnackbar('头像更新失败', 'error');
    }
  };

  const handleAvatarDelete = async () => {
    try {
      await handleSettingChange('userAvatar', '');
      setUserAvatar(''); // 同步更新全局状态
      showSnackbar('头像已删除', 'success');
    } catch (error) {
      console.error('Failed to delete avatar:', error);
      showSnackbar('删除头像失败', 'error');
    }
  };

  // 快捷键相关处理函数
  const handleShortcutChange = async (shortcutId, newKey) => {
    try {
      // 检查冲突
      const conflicts = checkShortcutConflict(newKey, shortcuts, shortcutId);
      
      if (conflicts.length > 0) {
        setShortcutConflicts(prev => ({ ...prev, [shortcutId]: conflicts }));
        showSnackbar(`快捷键冲突：与"${conflicts[0].name}"冲突`, 'warning');
        return;
      }
      
      // 清除冲突状态
      setShortcutConflicts(prev => {
        const newConflicts = { ...prev };
        delete newConflicts[shortcutId];
        return newConflicts;
      });
      
      // 更新快捷键
      const updatedShortcuts = {
        ...shortcuts,
        [shortcutId]: {
          ...shortcuts[shortcutId],
          currentKey: newKey
        }
      };
      
      setShortcuts(updatedShortcuts);
      
      // 通过ShortcutManager更新配置
      shortcutManager.updateShortcuts(updatedShortcuts);
      
      // 保存到设置
      if (window.electronAPI?.settings) {
        await window.electronAPI.settings.set('shortcuts', updatedShortcuts);
      }
      
      // 通知主进程更新快捷键
      if (shortcuts[shortcutId].type === 'global' && window.electronAPI?.shortcuts) {
        const action = shortcuts[shortcutId].action;
        await window.electronAPI.shortcuts.update(shortcutId, newKey, action);
      }
      
      showSnackbar('快捷键已更新', 'success');
    } catch (error) {
      console.error('Failed to update shortcut:', error);
      showSnackbar('更新快捷键失败', 'error');
    }
  };
  
  const handleResetAllShortcuts = async () => {
    try {
      const defaultShortcuts = resetShortcutsToDefault();
      setShortcuts(defaultShortcuts);
      setShortcutConflicts({});
      
      if (window.electronAPI?.settings) {
        await window.electronAPI.settings.set('shortcuts', defaultShortcuts);
      }
      
      // 通知主进程重置所有全局快捷键
      if (window.electronAPI?.shortcuts) {
        await window.electronAPI.shortcuts.resetAll();
      }
      
      showSnackbar('所有快捷键已重置为默认值', 'success');
    } catch (error) {
      console.error('Failed to reset shortcuts:', error);
      showSnackbar('重置快捷键失败', 'error');
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 标签页 */}
      <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="设置标签页">
          <Tab label="通用设置" icon={<SettingsIcon />} />
          <Tab label="外观设置" icon={<PaletteIcon />} />
          <Tab label="快捷键设置" icon={<KeyboardIcon />} />
          <Tab label="数据管理" icon={<ImportIcon />} />
          <Tab label="关于" icon={<InfoIcon />} />
        </Tabs>
      </Paper>

      {/* 内容区域 */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {/* 通用设置 */}
        <TabPanel value={tabValue} index={0}>
          <List>
            <ListItem>
              <ListItemText
                primary="开机自动启动"
                secondary="应用将在系统启动时自动运行"
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.autoLaunch}
                  onChange={(e) => handleSettingChange('autoLaunch', e.target.checked)}
                />
              </ListItemSecondaryAction>
            </ListItem>
            
            <Divider />
            
            <ListItem>
              <ListItemText
                primary="主题模式"
                secondary="选择应用的外观主题"
              />
              <ListItemSecondaryAction>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Chip
                    icon={<Brightness7 />}
                    label="浅色"
                    variant={settings.theme === 'light' ? 'filled' : 'outlined'}
                    onClick={() => handleSettingChange('theme', 'light')}
                    size="small"
                  />
                  <Chip
                    icon={<Brightness4 />}
                    label="深色"
                    variant={settings.theme === 'dark' ? 'filled' : 'outlined'}
                    onClick={() => handleSettingChange('theme', 'dark')}
                    size="small"
                  />
                  <Chip
                    icon={<Computer />}
                    label="跟随系统"
                    variant={settings.theme === 'system' ? 'filled' : 'outlined'}
                    onClick={() => handleSettingChange('theme', 'system')}
                    size="small"
                  />
                </Box>
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </TabPanel>

        {/* 外观设置 */}
        <TabPanel value={tabValue} index={1}>
          {/* 头像设置区域 */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 2, 
            mb: 3, 
            p: 2, 
            border: '1px solid', 
            borderColor: 'divider', 
            borderRadius: 2,
            backgroundColor: 'background.paper'
          }}>
            <Box sx={{ position: 'relative' }}>
              {settings.userAvatar ? (
                <Box
                  component="img"
                  src={settings.userAvatar}
                  alt="用户头像"
                  sx={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid',
                    borderColor: 'primary.main'
                  }}
                />
              ) : (
                <AccountCircle 
                  sx={{ 
                    fontSize: 80, 
                    color: 'text.secondary' 
                  }} 
                />
              )}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" gutterBottom>
                个人头像
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {settings.userAvatar ? '点击更换头像或删除当前头像' : '选择一张图片作为您的头像'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<PhotoCamera />}
                  onClick={handleAvatarChange}
                >
                  {settings.userAvatar ? '更换头像' : '选择头像'}
                </Button>
                {settings.userAvatar && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<Delete />}
                    onClick={handleAvatarDelete}
                    color="error"
                  >
                    删除头像
                  </Button>
                )}
              </Box>
            </Box>
          </Box>
          
          <List>
            <ListItem>
              <ListItemText
                primary="主题颜色"
                secondary="自定义应用的主题色彩"
              />
              <ListItemSecondaryAction>
                <TextField
                  type="color"
                  value={settings.customThemeColor}
                  onChange={(e) => handleSettingChange('customThemeColor', e.target.value)}
                  size="small"
                  sx={{ width: 60 }}
                />
              </ListItemSecondaryAction>
            </ListItem>
            

          </List>
        </TabPanel>

        {/* 快捷键设置 */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">快捷键设置</Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Restore />}
              onClick={handleResetAllShortcuts}
            >
              重置所有
            </Button>
          </Box>
          
          {Object.entries(SHORTCUT_CATEGORIES).map(([categoryKey, category]) => {
            // 确保shortcuts不为空，如果为空则使用默认配置
            const currentShortcuts = shortcuts && Object.keys(shortcuts).length > 0 ? shortcuts : DEFAULT_SHORTCUTS;
            const categoryShortcuts = Object.entries(currentShortcuts).filter(
              ([id, config]) => config.category === categoryKey
            );
            
            if (categoryShortcuts.length === 0) return null;
            
            return (
              <Box key={categoryKey} sx={{ mb: 3 }}>
                <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
                  {category.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {category.description}
                </Typography>
                
                <List>
                  {categoryShortcuts.map(([shortcutId, config], index) => (
                    <React.Fragment key={shortcutId}>
                      <ListItem sx={{ px: 0 }}>
                        <Box sx={{ flex: 1 }}>
                          <ListItemText
                            primary={config.name}
                            secondary={config.description}
                          />
                          {shortcutConflicts[shortcutId] && (
                            <Alert 
                              severity="warning" 
                              sx={{ mt: 1, py: 0.5 }}
                              icon={<WarningIcon />}
                            >
                              与 "{shortcutConflicts[shortcutId][0].name}" 冲突
                            </Alert>
                          )}
                        </Box>
                        <Box sx={{ minWidth: 200, ml: 2 }}>
                          <ShortcutInput
                            value={config.currentKey}
                            defaultValue={config.defaultKey}
                            onChange={(newKey) => handleShortcutChange(shortcutId, newKey)}
                            onValidationChange={(isValid) => {
                              // 可以在这里处理验证状态
                            }}
                            disabled={true}
                            label=""
                            placeholder="快捷键设置暂时不可更改"
                          />
                        </Box>
                      </ListItem>
                      {index < categoryShortcuts.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              </Box>
            );
          })}
        </TabPanel>

        {/* 数据管理 */}
        <TabPanel value={tabValue} index={3}>
          <List>
            <ListItem>
              <ListItemText
                primary="导入旧版本数据"
                secondary="从 FlashNote V1.x 的 notes.json 文件导入笔记数据"
              />
              <ListItemSecondaryAction>
                <Button
                  variant="contained"
                  startIcon={<ImportIcon />}
                  onClick={handleImportData}
                >
                  导入数据
                </Button>
              </ListItemSecondaryAction>
            </ListItem>
            
            <Divider />
            
            <ListItem>
              <ListItemText
                primary="数据库位置"
                secondary="notes.db"
              />
              <ListItemSecondaryAction>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Launch />}
                  onClick={() => {
                    if (window.electronAPI?.system) {
      window.electronAPI.system.openDataFolder();
                    }
                  }}
                >
                  打开文件夹
                </Button>
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </TabPanel>

        {/* 关于 */}
        <TabPanel value={tabValue} index={4}>
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h4" gutterBottom>
              FlashNote 2.0
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              一个简洁高效的笔记应用
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
              版本 2.0.0
            </Typography>
            
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
              <Button
                variant="outlined"
                startIcon={<Launch />}
                onClick={() => {
                  if (window.electronAPI?.system) {
                    window.electronAPI.system.openExternal('https://github.com/Xperiamol/FlashNote');
                  }
                }}
              >
                GitHub 仓库
              </Button>
            </Box>
            
            <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
              © 2025 FlashNote. All rights reserved.
            </Typography>
          </Box>
        </TabPanel>
      </Box>

      {/* 导入对话框 */}
      <Dialog open={importDialog} maxWidth="sm" fullWidth>
        <DialogTitle>导入数据</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {importStatus}
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={importProgress} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialog(false)} disabled={importProgress > 0 && importProgress < 100}>
            {importProgress === 100 ? '完成' : '取消'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 提示消息 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Settings;