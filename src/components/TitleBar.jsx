import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

const TitleBar = () => {
  const theme = useTheme();

  const handleMinimize = async () => {
    if (window.electronAPI) {
      await window.electronAPI.window.minimize();
    }
  };

  const handleMaximize = async () => {
    if (window.electronAPI) {
      await window.electronAPI.window.maximize();
    }
  };

  const handleClose = async () => {
    if (window.electronAPI) {
      await window.electronAPI.window.close();
    }
  };

  return (
    <Box
      sx={{
        height: '28px',
        backgroundColor: theme.palette.mode === 'dark' ? '#2c2c2c' : '#f6f6f6',
        borderBottom: `1px solid ${theme.palette.divider}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 16px',
        WebkitAppRegion: 'drag',
        userSelect: 'none',
        position: 'relative',
        zIndex: 1000,
        background: theme.palette.mode === 'dark' 
          ? 'linear-gradient(180deg, #2c2c2c 0%, #262626 100%)'
          : 'linear-gradient(180deg, #f6f6f6 0%, #ebebeb 100%)',
      }}
    >
      {/* Mac风格的窗口控制按钮 - 左侧 */}
      <Box
        sx={{
          position: 'absolute',
          left: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          WebkitAppRegion: 'no-drag',
        }}
      >
        {/* 关闭按钮 - 红色 */}
        <Box
          onClick={handleClose}
          sx={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#ff5f57',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: '#ff3b30',
              transform: 'scale(1.1)',
            },
            '&:active': {
              transform: 'scale(0.95)',
            },
          }}
        />
        
        {/* 最小化按钮 - 黄色 */}
        <Box
          onClick={handleMinimize}
          sx={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#ffbd2e',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: '#ff9500',
              transform: 'scale(1.1)',
            },
            '&:active': {
              transform: 'scale(0.95)',
            },
          }}
        />
        
        {/* 最大化按钮 - 绿色 */}
        <Box
          onClick={handleMaximize}
          sx={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#28ca42',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: '#20a934',
              transform: 'scale(1.1)',
            },
            '&:active': {
              transform: 'scale(0.95)',
            },
          }}
        />
      </Box>

      {/* 应用标题 - 居中 */}
      <Typography
        variant="body2"
        sx={{
          fontSize: '13px',
          fontWeight: 500,
          color: theme.palette.text.primary,
          opacity: 0.8,
          letterSpacing: '0.3px',
          textAlign: 'center',
        }}
      >
        FlashNote 2.0
      </Typography>
    </Box>
  );
};

export default TitleBar;