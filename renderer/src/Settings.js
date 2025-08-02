import React, { useState, useEffect } from 'react';
import { Switch, Row, Col, message, Card, ColorPicker, Button, Upload, Slider } from 'antd';
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

function Settings({ customColors, setCustomColors, backgroundImage, setBackgroundImage, backgroundBlur, setBackgroundBlur, backgroundBrightness, setBackgroundBrightness }) {
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [restoreWindows, setRestoreWindows] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [loading, setLoading] = useState(true);

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
      <Card title="系统设置" size="small">
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
    </div>
  );
}

export default Settings;