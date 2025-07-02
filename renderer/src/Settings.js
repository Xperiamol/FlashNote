import React, { useState, useEffect } from 'react';
import { Switch, Row, Col } from 'antd';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

function Settings() {
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [restoreWindows, setRestoreWindows] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.invoke('get-settings').then((settings) => {
        setOpenAtLogin(settings.openAtLogin || false);
        setRestoreWindows(settings.restoreWindows || false);
        setAlwaysOnTop(settings.alwaysOnTop === undefined ? true : settings.alwaysOnTop);
      });
    }
  }, []);

  const handleOpenAtLoginChange = (checked) => {
    setOpenAtLogin(checked);
    if (ipcRenderer) {
      ipcRenderer.send('set-open-at-login', checked);
    }
  };

  const handleRestoreWindowsChange = (checked) => {
    setRestoreWindows(checked);
    if (ipcRenderer) {
      ipcRenderer.send('set-restore-windows', checked);
    }
  };

  const handleAlwaysOnTopChange = (checked) => {
    setAlwaysOnTop(checked);
    if (ipcRenderer) {
      ipcRenderer.send('set-always-on-top', { id: 'main', value: checked });
    }
  };

  return (
    <div className="settings-page" style={{ padding: '20px' }}>
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
    </div>
  );
}

export default Settings;