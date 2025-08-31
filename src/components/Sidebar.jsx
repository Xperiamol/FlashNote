import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import {
  StickyNote2,
  CheckBox,
  CalendarToday,
  Settings,
  Person,
  Folder,
  Store,
  MenuBook
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useStore } from '../store/useStore';

const Sidebar = ({ open = true, onClose }) => {
  const theme = useTheme();
  const { currentView, setCurrentView, userAvatar } = useStore();

  // 主侧边栏始终显示，不受open prop控制

  const menuItems = [
    {
      id: 'notes',
      icon: <StickyNote2 />,
      label: '笔记',
      tooltip: '笔记管理'
    },
    {
      id: 'todo',
      icon: <CheckBox />,
      label: 'TODO',
      tooltip: '待办事项'
    },
    {
      id: 'calendar',
      icon: <CalendarToday />,
      label: '日历',
      tooltip: '日历视图'
    },
    {
      id: 'files',
      icon: <Folder />,
      label: '文件',
      tooltip: '文件管理'
    },
    {
      id: 'plugins',
      icon: <Store />,
      label: '插件商店',
      tooltip: '插件商店'
    },
    {
      id: 'vocabulary',
      icon: <MenuBook />,
      label: '单词本',
      tooltip: '单词本'
    },
    {
      id: 'profile',
      icon: <Person />,
      label: '个人',
      tooltip: '个人中心'
    }
  ];

  const handleMenuClick = (itemId) => {
    setCurrentView(itemId);
  };

  return (
    <Box
      sx={{
        width: '60px',
        height: '100%',
        backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f0f0f0',
        borderRight: `1px solid ${theme.palette.divider}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '8px',
        paddingBottom: '8px',
        position: 'relative',
        zIndex: 100,
        background: theme.palette.mode === 'dark'
          ? 'linear-gradient(180deg, #1e1e1e 0%, #181818 100%)'
          : 'linear-gradient(180deg, #f0f0f0 0%, #e8e8e8 100%)',
        boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
        overflow: 'visible',
        minHeight: 0
      }}
    >
      {/* 头像区域 */}
      <Box
        sx={{
          width: '40px',
          height: '40px',
          borderRadius: '8px',
          backgroundColor: userAvatar ? 'transparent' : theme.palette.primary.main,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
          background: userAvatar ? 'none' : `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        {userAvatar ? (
          <Box
            component="img"
            src={userAvatar}
            alt="用户头像"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '8px',
            }}
          />
        ) : (
          <Person sx={{ color: 'white', fontSize: '20px' }} />
        )}
      </Box>

      {/* 分隔线 */}
      <Box
        sx={{
          width: '32px',
          height: '1px',
          backgroundColor: theme.palette.divider,
          marginBottom: '8px',
          opacity: 0.5,
        }}
      />

      {/* 菜单项 */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          flex: 1,
          overflow: 'visible',
          minHeight: 0
        }}
      >
        {menuItems.map((item) => (
          <Tooltip key={item.id} title={item.tooltip} placement="right">
            <IconButton
              onClick={() => handleMenuClick(item.id)}
              sx={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                color: currentView === item.id
                  ? theme.palette.primary.main
                  : theme.palette.text.secondary,
                backgroundColor: currentView === item.id
                  ? theme.palette.mode === 'dark'
                    ? 'rgba(144, 202, 249, 0.12)'
                    : 'rgba(25, 118, 210, 0.08)'
                  : 'transparent',
                border: currentView === item.id
                  ? `2px solid ${theme.palette.primary.main}`
                  : '2px solid transparent',
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: currentView === item.id
                    ? theme.palette.mode === 'dark'
                      ? 'rgba(144, 202, 249, 0.16)'
                      : 'rgba(25, 118, 210, 0.12)'
                    : theme.palette.mode === 'dark'
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(0, 0, 0, 0.04)',
                  color: currentView === item.id
                    ? theme.palette.primary.main
                    : theme.palette.text.primary,
                  transform: 'scale(1.05)',
                },
                '&:active': {
                  transform: 'scale(0.95)',
                },
              }}
            >
              {React.cloneElement(item.icon, {
                sx: {
                  fontSize: '20px',
                  transition: 'all 0.2s ease',
                }
              })}
            </IconButton>
          </Tooltip>
        ))}
      </Box>

      {/* 底部设置按钮 */}
      <Box
        sx={{
          marginTop: 'auto',
          paddingTop: '8px',
        }}
      >
        <Box
          sx={{
            width: '32px',
            height: '1px',
            backgroundColor: theme.palette.divider,
            marginBottom: '8px',
            opacity: 0.5,
          }}
        />
        <Tooltip title="应用设置" placement="right">
          <IconButton
            onClick={() => handleMenuClick('settings')}
            sx={{
              width: '44px',
              height: '44px',
              borderRadius: '8px',
              color: currentView === 'settings'
                ? theme.palette.primary.main
                : theme.palette.text.secondary,
              backgroundColor: currentView === 'settings'
                ? theme.palette.mode === 'dark'
                  ? 'rgba(144, 202, 249, 0.12)'
                  : 'rgba(25, 118, 210, 0.08)'
                : 'transparent',
              border: currentView === 'settings'
                ? `2px solid ${theme.palette.primary.main}`
                : '2px solid transparent',
              transition: 'all 0.2s ease',
              '&:hover': {
                backgroundColor: currentView === 'settings'
                  ? theme.palette.mode === 'dark'
                    ? 'rgba(144, 202, 249, 0.16)'
                    : 'rgba(25, 118, 210, 0.12)'
                  : theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'rgba(0, 0, 0, 0.04)',
                color: currentView === 'settings'
                  ? theme.palette.primary.main
                  : theme.palette.text.primary,
                transform: 'scale(1.05)',
              },
              '&:active': {
                transform: 'scale(0.95)',
              },
            }}
          >
            <Settings sx={{ fontSize: '20px' }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default Sidebar;