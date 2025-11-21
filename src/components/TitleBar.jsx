import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { createTransitionString, ANIMATIONS } from '../utils/animationConfig';
import { useStore } from '../store/useStore';
import SyncStatusIndicator from './SyncStatusIndicator';

const TitleBar = () => {
  const theme = useTheme();
  const { currentView, titleBarStyle } = useStore();

  // 根据当前视图获取对应的标题
  const getViewTitle = () => {
    switch (currentView) {
      case 'notes':
        return 'FlashNote';
      case 'todo':
        return '待办事项';
      case 'calendar':
        return '日历';
      case 'settings':
        return '设置';
      case 'plugins':
        return '插件';
      case 'profile':
        return '个人中心';
      default:
        return 'FlashNote';
    }
  };

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
        width: '100%',
        height: '32px',
        backgroundColor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        WebkitAppRegion: 'drag',
        userSelect: 'none',
        position: 'relative',
        zIndex: 1000,
        background: theme.palette.mode === 'dark'
          ? 'rgba(30, 41, 59, 0.6)'
          : 'rgba(255, 255, 255, 0.6)',
        backdropFilter: 'blur(30px) saturate(180%)',
        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        borderBottom: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'}`,
      }}
    >
      {titleBarStyle === 'mac' ? (
        /* Mac风格的窗口控制按钮 - 左侧 */
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
              transition: createTransitionString(ANIMATIONS.button),
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
              transition: createTransitionString(ANIMATIONS.button),
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
              transition: createTransitionString(ANIMATIONS.button),
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
      ) : (
        /* Windows风格的窗口控制按钮 - 右侧 */
        <Box
          sx={{
            position: 'absolute',
            right: '0',
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            WebkitAppRegion: 'no-drag',
          }}
        >
          {/* 最小化按钮 */}
          <Box
            onClick={handleMinimize}
            sx={{
              width: '46px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: createTransitionString(ANIMATIONS.button),
              '&:hover': {
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              },
              '&:active': {
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
              },
            }}
          >
            <Box
              sx={{
                width: '10px',
                height: '2px',
                backgroundColor: theme.palette.mode === 'dark' ? '#ffffff' : '#1a1a1a',
              }}
            />
          </Box>

          {/* 最大化按钮 */}
          <Box
            onClick={handleMaximize}
            sx={{
              width: '46px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: createTransitionString(ANIMATIONS.button),
              '&:hover': {
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              },
              '&:active': {
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
              },
            }}
          >
            <Box
              sx={{
                width: '9px',
                height: '9px',
                border: `2px solid ${theme.palette.mode === 'dark' ? '#ffffff' : '#1a1a1a'}`,
                borderRadius: '1px',
              }}
            />
          </Box>

          {/* 关闭按钮 */}
          <Box
            onClick={handleClose}
            sx={{
              width: '46px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
              zIndex: 10000,
              transition: createTransitionString(ANIMATIONS.button),
              '&:hover': {
                backgroundColor: '#e81123',
                '& .close-icon': {
                  backgroundColor: '#fff !important',
                }
              },
              '&:active': {
                backgroundColor: '#c50d1d',
              },
            }}
          >
            <Box sx={{ position: 'relative', width: '12px', height: '12px' }}>
              <Box
                className="close-icon"
                sx={{
                  position: 'absolute',
                  width: '12px',
                  height: '1.5px',
                  backgroundColor: '#e81123',
                  top: '5.25px',
                  left: '-3px',
                  transform: 'rotate(45deg)',
                }}
              />
              <Box
                className="close-icon"
                sx={{
                  position: 'absolute',
                  width: '12px',
                  height: '1.5px',
                  backgroundColor: '#e81123',
                  top: '5.25px',
                  left: '-3px',
                  transform: 'rotate(-45deg)',
                }}
              />
            </Box>
          </Box>
        </Box>
      )}

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
        {getViewTitle()}
      </Typography>

      {/* 同步状态指示器 - 右侧（Windows样式时） */}
      {titleBarStyle === 'windows' && (
        <Box
          sx={{
            position: 'absolute',
            right: '150px', // 留出空间给窗口控制按钮
            WebkitAppRegion: 'no-drag',
          }}
        >
          <SyncStatusIndicator />
        </Box>
      )}

      {/* 同步状态指示器 - 右侧（Mac样式时） */}
      {titleBarStyle === 'mac' && (
        <Box
          sx={{
            position: 'absolute',
            right: '12px',
            WebkitAppRegion: 'no-drag',
          }}
        >
          <SyncStatusIndicator />
        </Box>
      )}
    </Box>
  );
};

export default TitleBar;
