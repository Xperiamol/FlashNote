import React, { useState, useEffect } from 'react';
import { Switch, Row, Col, message, Card, ColorPicker, Button, Upload, Slider, Select } from 'antd';
import { UploadOutlined, DeleteOutlined, ExportOutlined, ImportOutlined, DownloadOutlined } from '@ant-design/icons';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

function Settings({ customColors, setCustomColors, backgroundImage, setBackgroundImage, backgroundBlur, setBackgroundBlur, backgroundBrightness, setBackgroundBrightness, floatingBallSettings, setFloatingBallSettings, todoSettings, setTodoSettings }) {
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [restoreWindows, setRestoreWindows] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  // 颜色处理函数
  const handleColorChange = (colorKey, color) => {
    const colorValue = typeof color === 'string' ? color : color.toHexString();
    console.log('颜色改变:', colorKey, '新值:', colorValue);
    setCustomColors(prev => {
      const newColors = {
        ...prev,
        [colorKey]: colorValue
      };
      console.log('更新后的颜色设置:', newColors);
      return newColors;
    });
  };

  // 重置颜色为默认值
  const resetColors = () => {
    const defaultColors = {
      tabTextColor: '#000000',
      tabIndicatorColor: '#1890ff',
      inputBorderColor: '#1890ff',
      addButtonColor: '#1890ff',
      backgroundColor: '#f5f5f5',
      noteBackgroundColor: '#ffffff'
    };
    console.log('重置颜色为默认值:', defaultColors);
    setCustomColors(defaultColors);
    message.success('颜色已重置为默认值');
  };

  // 处理图片上传
  const handleImageUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageDataUrl = e.target.result;
      setBackgroundImage(imageDataUrl);
      message.success('背景图片已设置');
    };
    reader.readAsDataURL(file);
    return false; // 阻止自动上传
  };

  // 悬浮球设置处理函数
  const handleFloatingBallSettingChange = (key, value) => {
    console.log('悬浮球设置改变:', key, '新值:', value);
    setFloatingBallSettings(prev => {
      const newSettings = {
        ...prev,
        [key]: value
      };
      console.log('更新后的悬浮球设置:', newSettings);
      return newSettings;
    });
  };

  // 处理悬浮球自定义图标上传
  const handleFloatingBallIconUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageDataUrl = e.target.result;
      handleFloatingBallSettingChange('customIcon', imageDataUrl);
      handleFloatingBallSettingChange('useCustomIcon', true);
      message.success('悬浮球图标已设置');
    };
    reader.readAsDataURL(file);
    return false; // 阻止自动上传
  };

  // 移除悬浮球自定义图标
  const removeFloatingBallIcon = () => {
    handleFloatingBallSettingChange('customIcon', '');
    handleFloatingBallSettingChange('useCustomIcon', false);
    message.success('悬浮球图标已重置');
  };

  // 重置悬浮球设置为默认值
  const resetFloatingBallSettings = () => {
    const defaultFloatingBallSettings = {
      size: 50,
      idleOpacity: 0.7,
      activeOpacity: 0.9,
      brightnessChange: 0.2,
      flashColor: '#1890ff',
      todoColor: '#52c41a',
      customIcon: '',
      useCustomIcon: false
    };
    console.log('重置悬浮球设置为默认值:', defaultFloatingBallSettings);
    setFloatingBallSettings(defaultFloatingBallSettings);
    message.success('悬浮球设置已重置为默认值');
  };

  // Todo设置处理函数
  const handleTodoSettingChange = (key, value) => {
    console.log('Todo设置改变:', key, '新值:', value);
    setTodoSettings(prev => {
      const newSettings = {
        ...prev,
        [key]: value
      };
      console.log('更新后的Todo设置:', newSettings);
      return newSettings;
    });
  };

  // 重置Todo设置为默认值
  const resetTodoSettings = () => {
    const defaultTodoSettings = {
      autoSort: true,
      sortBy: 'priority'
    };
    console.log('重置Todo设置为默认值:', defaultTodoSettings);
    setTodoSettings(defaultTodoSettings);
    message.success('Todo设置已重置为默认值');
  };

  // 移除背景图片
  const removeBackgroundImage = () => {
    setBackgroundImage('');
    setBackgroundBlur(0);
    setBackgroundBrightness(100);
    message.success('背景图片已移除');
  };

  // 图片上传前的验证
  const beforeUpload = (file) => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      message.error('只能上传图片文件！');
      return false;
    }
    const isLt10M = file.size / 1024 / 1024 < 10;
    if (!isLt10M) {
      message.error('图片大小不能超过10MB！');
      return false;
    }
    return true;
  };

  // 加载设置
  useEffect(() => {
    if (ipcRenderer) {
      setLoading(true);
      ipcRenderer.invoke('get-settings')
        .then((settings) => {
          console.log('从主进程获取设置:', settings);
          setOpenAtLogin(settings.openAtLogin || false);
          setRestoreWindows(settings.restoreWindows || false);
          setAlwaysOnTop(settings.alwaysOnTop === undefined ? true : settings.alwaysOnTop);
          setLoading(false);
        })
        .catch(error => {
          console.error('获取设置时发生错误:', error);
          message.error('获取设置失败，请重试');
          setLoading(false);
        });

      // 监听开机自启设置结果
      const handleOpenAtLoginResult = (event, result) => {
        if (result.success) {
          message.success(result.message);
        } else {
          message.error(result.message);
          // 如果设置失败，恢复开关状态
          setOpenAtLogin(prev => !prev);
        }
      };

      ipcRenderer.on('open-at-login-result', handleOpenAtLoginResult);

      // 清理监听器
      return () => {
        ipcRenderer.removeListener('open-at-login-result', handleOpenAtLoginResult);
      };
    }
  }, []);

  const handleOpenAtLoginChange = (checked) => {
    setOpenAtLogin(checked);
    if (ipcRenderer) {
      try {
        ipcRenderer.send('set-open-at-login', checked);
        console.log(`设置开机自启: ${checked}`);
        // 不在这里显示成功消息，等待主进程的反馈
      } catch (error) {
        console.error('设置开机自启时发生错误:', error);
        message.error('设置开机自启失败，请重试');
        // 恢复状态
        setOpenAtLogin(!checked);
      }
    }
  };

  const handleRestoreWindowsChange = (checked) => {
    setRestoreWindows(checked);
    if (ipcRenderer) {
      try {
        ipcRenderer.send('set-restore-windows', checked);
        message.success(`启动恢复窗口已${checked ? '开启' : '关闭'}`);
        console.log(`设置恢复窗口: ${checked}`);
      } catch (error) {
        console.error('设置恢复窗口时发生错误:', error);
        message.error('设置恢复窗口失败，请重试');
        // 恢复状态
        setRestoreWindows(!checked);
      }
    }
  };

  const handleAlwaysOnTopChange = (checked) => {
    setAlwaysOnTop(checked);
    if (ipcRenderer) {
      try {
        ipcRenderer.send('set-always-on-top', { id: 'main', value: checked });
        message.success(`置顶已${checked ? '开启' : '关闭'}`);
        console.log(`设置置顶: ${checked}`);
      } catch (error) {
        console.error('设置置顶时发生错误:', error);
        message.error('设置置顶失败，请重试');
        // 恢复状态
        setAlwaysOnTop(!checked);
      }
    }
  };

  // 导出数据
  const handleExportData = async () => {
    if (!ipcRenderer) {
      message.error('无法访问系统功能');
      return;
    }

    setExporting(true);
    try {
      const result = await ipcRenderer.invoke('export-data');
      
      if (result.success) {
        message.success({
          content: `${result.message}\n导出了 ${result.count.notes} 条笔记和 ${result.count.todos} 条待办`,
          duration: 4
        });
      } else {
        message.error(result.message);
      }
    } catch (error) {
      console.error('导出数据时发生错误:', error);
      message.error('导出数据失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  // 导入数据
  const handleImportData = async () => {
    if (!ipcRenderer) {
      message.error('无法访问系统功能');
      return;
    }

    setImporting(true);
    try {
      const result = await ipcRenderer.invoke('import-data');
      
      if (result.success) {
        message.success({
          content: result.message,
          duration: 4
        });
      } else {
        message.error(result.message);
      }
    } catch (error) {
      console.error('导入数据时发生错误:', error);
      message.error('导入数据失败，请重试');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="settings-page" style={{ padding: '20px' }}>
      {/* 颜色自定义设置 */}
      <Card 
        title="颜色自定义" 
        style={{ marginBottom: '16px' }} 
        size="small"
        extra={
          <a onClick={resetColors} style={{ fontSize: '12px' }}>
            重置为默认
          </a>
        }
      >
        <Row align="middle" style={{ marginBottom: '12px' }}>
          <Col span={16}>
            <span style={{ fontSize: '14px' }}>菜单文字颜色</span>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <ColorPicker
              value={customColors.tabTextColor}
              onChange={(color) => handleColorChange('tabTextColor', color)}
              size="small"
              showText
            />
          </Col>
        </Row>
        
        <Row align="middle" style={{ marginBottom: '12px' }}>
          <Col span={16}>
            <span style={{ fontSize: '14px' }}>菜单激活指示器颜色</span>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <ColorPicker
              value={customColors.tabIndicatorColor}
              onChange={(color) => handleColorChange('tabIndicatorColor', color)}
              size="small"
              showText
            />
          </Col>
        </Row>
        
        <Row align="middle" style={{ marginBottom: '12px' }}>
          <Col span={16}>
            <span style={{ fontSize: '14px' }}>输入框选中边框颜色</span>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <ColorPicker
              value={customColors.inputBorderColor}
              onChange={(color) => handleColorChange('inputBorderColor', color)}
              size="small"
              showText
            />
          </Col>
        </Row>
        
        <Row align="middle" style={{ marginBottom: '12px' }}>
          <Col span={16}>
            <span style={{ fontSize: '14px' }}>加号按钮颜色</span>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <ColorPicker
              value={customColors.addButtonColor}
              onChange={(color) => handleColorChange('addButtonColor', color)}
              size="small"
              showText
            />
          </Col>
        </Row>
        
        <Row align="middle" style={{ marginBottom: '16px' }}>
          <Col span={16}>
            <span style={{ fontSize: '14px' }}>主背景</span>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
              {backgroundImage ? '当前使用壁纸' : '当前使用纯色'}
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
              <ColorPicker
                value={customColors.backgroundColor}
                onChange={(color) => handleColorChange('backgroundColor', color)}
                size="small"
                showText
                disabled={!!backgroundImage}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <Upload
                  accept="image/*"
                  beforeUpload={beforeUpload}
                  customRequest={({ file }) => handleImageUpload(file)}
                  showUploadList={false}
                >
                  <Button size="small" icon={<UploadOutlined />}>
                    壁纸
                  </Button>
                </Upload>
                {backgroundImage && (
                  <Button 
                    size="small" 
                    icon={<DeleteOutlined />}
                    onClick={removeBackgroundImage}
                    danger
                  >
                    移除
                  </Button>
                )}
              </div>
            </div>
          </Col>
        </Row>
        
        {backgroundImage && (
          <Row align="middle" style={{ marginBottom: '16px' }}>
            <Col span={16}>
              <span style={{ fontSize: '14px' }}>背景模糊度</span>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                当前模糊: {backgroundBlur}px
              </div>
            </Col>
            <Col span={8} style={{ textAlign: 'right' }}>
              <div style={{ width: '100px' }}>
                <Slider
                  min={0}
                  max={20}
                  value={backgroundBlur}
                  onChange={setBackgroundBlur}
                  size="small"
                />
              </div>
            </Col>
          </Row>
        )}
        
        {backgroundImage && (
          <Row align="middle" style={{ marginBottom: '16px' }}>
            <Col span={16}>
              <span style={{ fontSize: '14px' }}>背景亮度</span>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                当前亮度: {backgroundBrightness}%
              </div>
            </Col>
            <Col span={8} style={{ textAlign: 'right' }}>
              <div style={{ width: '100px' }}>
                <Slider
                  min={20}
                  max={150}
                  value={backgroundBrightness}
                  onChange={setBackgroundBrightness}
                  size="small"
                />
              </div>
            </Col>
          </Row>
        )}
        
        <Row align="middle">
          <Col span={16}>
            <span style={{ fontSize: '14px' }}>笔记背景颜色</span>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <ColorPicker
              value={customColors.noteBackgroundColor}
              onChange={(color) => handleColorChange('noteBackgroundColor', color)}
              size="small"
              showText
            />
          </Col>
        </Row>
      </Card>

      {/* 系统设置 */}
      <Card title="系统设置" style={{ marginBottom: '16px' }} size="small">
        <Row align="middle" style={{ marginBottom: '16px' }}>
          <Col span={18}>
            <p style={{ margin: 0 }}>开机自启</p>
          </Col>
          <Col span={6} style={{ textAlign: 'right' }}>
            <Switch checked={openAtLogin} onChange={handleOpenAtLoginChange} />
          </Col>
        </Row>
        <Row align="middle" style={{ marginBottom: '16px' }}>
          <Col span={18}>
            <p style={{ margin: 0 }}>启动时恢复上一次独立的窗口</p>
          </Col>
          <Col span={6} style={{ textAlign: 'right' }}>
            <Switch checked={restoreWindows} onChange={handleRestoreWindowsChange} />
          </Col>
        </Row>
        <Row align="middle">
          <Col span={18}>
            <p style={{ margin: 0 }}>主程序是否置顶</p>
          </Col>
          <Col span={6} style={{ textAlign: 'right' }}>
            <Switch checked={alwaysOnTop} onChange={handleAlwaysOnTopChange} />
          </Col>
        </Row>
      </Card>

      {/* 悬浮球设置 */}
      <Card 
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>悬浮球设置</span>
            <a onClick={resetFloatingBallSettings} style={{ fontSize: '12px' }}>
              重置为默认
            </a>
          </div>
        } 
        style={{ marginBottom: '16px' }} 
        size="small"
      >
        <Row align="middle" style={{ marginBottom: '12px' }}>
          <Col span={16}>
            <span style={{ fontSize: '14px' }}>悬浮球大小</span>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
              当前大小: {floatingBallSettings.size}px
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <div style={{ width: '100px' }}>
              <Slider
                min={30}
                max={80}
                value={floatingBallSettings.size}
                onChange={(value) => handleFloatingBallSettingChange('size', value)}
                size="small"
              />
            </div>
          </Col>
        </Row>

        <Row align="middle" style={{ marginBottom: '12px' }}>
          <Col span={16}>
            <span style={{ fontSize: '14px' }}>闲置状态透明度</span>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
              鼠标离开悬浮球2秒后的透明度: {Math.round(floatingBallSettings.idleOpacity * 100)}%
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <div style={{ width: '100px' }}>
              <Slider
                min={0.1}
                max={1}
                step={0.1}
                value={floatingBallSettings.idleOpacity}
                onChange={(value) => handleFloatingBallSettingChange('idleOpacity', value)}
                size="small"
              />
            </div>
          </Col>
        </Row>

        <Row align="middle" style={{ marginBottom: '12px' }}>
          <Col span={16}>
            <span style={{ fontSize: '14px' }}>激活状态透明度</span>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
              鼠标悬停在悬浮球上时的透明度: {Math.round(floatingBallSettings.activeOpacity * 100)}%
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <div style={{ width: '100px' }}>
              <Slider
                min={0.1}
                max={1}
                step={0.1}
                value={floatingBallSettings.activeOpacity}
                onChange={(value) => handleFloatingBallSettingChange('activeOpacity', value)}
                size="small"
              />
            </div>
          </Col>
        </Row>

        <Row align="middle" style={{ marginBottom: '12px' }}>
          <Col span={16}>
            <span style={{ fontSize: '14px' }}>激活时亮度变化</span>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
              鼠标悬停时的亮度调整: {floatingBallSettings.brightnessChange > 0 ? '+' : ''}{Math.round(floatingBallSettings.brightnessChange * 100)}%
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <div style={{ width: '100px' }}>
              <Slider
                min={-0.5}
                max={0.5}
                step={0.1}
                value={floatingBallSettings.brightnessChange}
                onChange={(value) => handleFloatingBallSettingChange('brightnessChange', value)}
                size="small"
              />
            </div>
          </Col>
        </Row>

        <Row align="middle" style={{ marginBottom: '12px' }}>
          <Col span={16}>
            <span style={{ fontSize: '14px' }}>闪记模式颜色</span>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
              闪记功能时悬浮球的颜色
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <ColorPicker
              value={floatingBallSettings.flashColor}
              onChange={(color) => handleFloatingBallSettingChange('flashColor', color.toHexString())}
              size="small"
              showText
            />
          </Col>
        </Row>

        <Row align="middle" style={{ marginBottom: '12px' }}>
          <Col span={16}>
            <span style={{ fontSize: '14px' }}>Todo模式颜色</span>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
              Todo功能时悬浮球的颜色
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <ColorPicker
              value={floatingBallSettings.todoColor}
              onChange={(color) => handleFloatingBallSettingChange('todoColor', color.toHexString())}
              size="small"
              showText
            />
          </Col>
        </Row>

        <Row align="middle" style={{ marginBottom: '16px' }}>
          <Col span={16}>
            <span style={{ fontSize: '14px' }}>自定义图标</span>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
              {floatingBallSettings.useCustomIcon ? '已设置自定义图标' : '使用默认图标'}
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', gap: '4px', flexDirection: 'column', alignItems: 'flex-end' }}>
              <Upload
                accept="image/*"
                beforeUpload={beforeUpload}
                customRequest={({ file }) => handleFloatingBallIconUpload(file)}
                showUploadList={false}
              >
                <Button size="small" icon={<UploadOutlined />}>
                  {floatingBallSettings.useCustomIcon ? '更换' : '上传'}
                </Button>
              </Upload>
              {floatingBallSettings.useCustomIcon && (
                <Button 
                  size="small" 
                  icon={<DeleteOutlined />}
                  onClick={removeFloatingBallIcon}
                  danger
                >
                  重置
                </Button>
              )}
              {floatingBallSettings.customIcon && (
                <div style={{ width: '32px', height: '32px', border: '1px solid #d9d9d9', borderRadius: '4px', overflow: 'hidden', marginTop: '4px' }}>
                  <img 
                    src={floatingBallSettings.customIcon} 
                    alt="预览" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              )}
            </div>
          </Col>
        </Row>
      </Card>

      {/* Todo设置 */}
      <Card 
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Todo设置</span>
            <a onClick={resetTodoSettings} style={{ fontSize: '12px' }}>
              重置为默认
            </a>
          </div>
        } 
        style={{ marginBottom: '16px' }} 
        size="small"
      >
        <Row align="middle" style={{ marginBottom: '12px' }}>
          <Col span={18}>
            <span style={{ fontSize: '14px' }}>自动排序</span>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
              {todoSettings.autoSort ? '已启用自动排序' : '已禁用自动排序'}
            </div>
          </Col>
          <Col span={6} style={{ textAlign: 'right' }}>
            <Switch 
              checked={todoSettings.autoSort} 
              onChange={(value) => handleTodoSettingChange('autoSort', value)} 
            />
          </Col>
        </Row>

        {todoSettings.autoSort && (
          <Row align="middle" style={{ marginBottom: '12px' }}>
            <Col span={12}>
              <span style={{ fontSize: '14px' }}>排序方式</span>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                选择Todo项目的排序规则
              </div>
            </Col>
            <Col span={12} style={{ textAlign: 'right' }}>
              <Select
                value={todoSettings.sortBy}
                onChange={(value) => handleTodoSettingChange('sortBy', value)}
                style={{ width: '140px' }}
                size="small"
              >
                <Select.Option value="priority">优先级排序</Select.Option>
                <Select.Option value="deadline">截止日期</Select.Option>
                <Select.Option value="created">创建时间</Select.Option>
              </Select>
            </Col>
          </Row>
        )}
      </Card>

      {/* 数据管理 */}
      <Card title="数据管理" size="small">
        <Row style={{ marginBottom: '16px' }}>
          <Col span={24}>
            <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>
              导出你的笔记和待办数据，或从备份文件中恢复数据
            </p>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <Button
              type="primary"
              icon={<ExportOutlined />}
              onClick={handleExportData}
              loading={exporting}
              block
              size="small"
            >
              {exporting ? '导出中...' : '导出数据'}
            </Button>
          </Col>
          <Col span={12}>
            <Button
              icon={<ImportOutlined />}
              onClick={handleImportData}
              loading={importing}
              block
              size="small"
            >
              {importing ? '导入中...' : '导入数据'}
            </Button>
          </Col>
        </Row>
        <Row style={{ marginTop: '8px' }}>
          <Col span={24}>
            <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>
              💡 导出的数据包含所有笔记、待办和个性化设置，可用于备份或迁移到其他设备
            </p>
          </Col>
        </Row>
      </Card>
    </div>
  );
}

export default Settings;