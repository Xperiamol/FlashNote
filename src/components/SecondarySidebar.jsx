import React from 'react';
import {
  Box,
  Drawer,
  useMediaQuery,
  useTheme,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Chip,
  ListItemIcon
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Palette as PaletteIcon,
  GetApp as ImportIcon,
  Keyboard as KeyboardIcon,
  Cloud as CloudIcon,
  Psychology as AIIcon,
  Memory as MemoryIcon,
  Wifi as WifiIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useStore } from '../store/useStore';
import NoteList from './NoteList';
import TodoList from './TodoList';
import MyDayPanel from './MyDayPanel';

const SecondarySidebar = ({ open, onClose, width = 320, onTodoSelect, onViewModeChange, onShowCompletedChange, viewMode, showCompleted, onMultiSelectChange, onMultiSelectRefChange, todoRefreshTrigger, todoSortBy, onTodoSortByChange, showDeleted, selectedDate, calendarRefreshTrigger, onTodoUpdated }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const currentView = useStore((state) => state.currentView);
  const pluginStoreFilters = useStore((state) => state.pluginStoreFilters);
  const pluginStoreCategories = useStore((state) => state.pluginStoreCategories);
  const setPluginStoreCategory = useStore((state) => state.setPluginStoreCategory);
  const setPluginStoreTab = useStore((state) => state.setPluginStoreTab);
  const settingsTabValue = useStore((state) => state.settingsTabValue);
  const setSettingsTabValue = useStore((state) => state.setSettingsTabValue);

  // 根据当前视图渲染不同的侧边栏内容
  const renderSidebarContent = () => {
    switch (currentView) {
      case 'notes':
        return <NoteList showDeleted={showDeleted} onMultiSelectChange={onMultiSelectChange} onMultiSelectRefChange={onMultiSelectRefChange} />;
      case 'todo':
        return (
          <TodoList 
            onTodoSelect={onTodoSelect}
            onViewModeChange={onViewModeChange}
            onShowCompletedChange={onShowCompletedChange}
            viewMode={viewMode}
            showCompleted={showCompleted}
            onMultiSelectChange={onMultiSelectChange}
            onMultiSelectRefChange={onMultiSelectRefChange}
            refreshTrigger={todoRefreshTrigger}
            sortBy={todoSortBy}
            onSortByChange={onTodoSortByChange}
          />
        );
      case 'calendar':
        return <MyDayPanel selectedDate={selectedDate} onTodoSelect={onTodoSelect} refreshToken={calendarRefreshTrigger} onTodoUpdated={onTodoUpdated} />;
      case 'plugins': {
        const categories = pluginStoreCategories && pluginStoreCategories.length > 0
          ? [{ id: 'all', name: '全部插件' }, ...pluginStoreCategories]
          : [
              { id: 'all', name: '全部插件' },
              { id: 'featured', name: '精选推荐' },
              { id: 'productivity', name: '效率工具' },
              { id: 'integration', name: '服务集成' },
              { id: 'insights', name: '知识与学习' }
            ]

        const tabs = [
          { id: 'market', label: '插件市场' },
          { id: 'installed', label: '已安装' },
          { id: 'local', label: '本地开发' }
        ]

        return (
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              插件浏览
            </Typography>

            <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
              {tabs.map((tab) => (
                <Chip
                  key={tab.id}
                  label={tab.label}
                  color={pluginStoreFilters.tab === tab.id ? 'primary' : 'default'}
                  variant={pluginStoreFilters.tab === tab.id ? 'filled' : 'outlined'}
                  onClick={() => setPluginStoreTab(tab.id)}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
            </Stack>

            <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
              分类
            </Typography>

            <List dense disablePadding sx={{ overflowY: 'auto' }}>
              {categories.map((category) => (
                <ListItemButton
                  key={category.id || category}
                  selected={pluginStoreFilters.category === (category.id || category)}
                  onClick={() => setPluginStoreCategory(category.id || category)}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5
                  }}
                >
                  <ListItemText
                    primary={category.name || category}
                    primaryTypographyProps={{
                      fontSize: 14,
                      fontWeight: pluginStoreFilters.category === (category.id || category) ? 600 : 400
                    }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>
        )
      }
      case 'settings': {
        const settingsCategories = [
          { id: 0, name: '通用设置', icon: <SettingsIcon /> },
          { id: 1, name: '外观设置', icon: <PaletteIcon /> },
          { id: 2, name: '快捷键设置', icon: <KeyboardIcon /> },
          { id: 3, name: 'AI 功能', icon: <AIIcon /> },
          { id: 4, name: 'MemoryEngine', icon: <MemoryIcon /> },
          { id: 5, name: '云同步', icon: <CloudIcon /> },
          { id: 6, name: '网络代理', icon: <WifiIcon /> },
          { id: 7, name: '数据管理', icon: <ImportIcon /> },
          { id: 8, name: '关于', icon: <InfoIcon /> }
        ]

        return (
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              设置
            </Typography>

            <List dense disablePadding sx={{ overflowY: 'auto' }}>
              {settingsCategories.map((category) => (
                <ListItemButton
                  key={category.id}
                  selected={settingsTabValue === category.id}
                  onClick={() => setSettingsTabValue(category.id)}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {category.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={category.name}
                    primaryTypographyProps={{
                      fontSize: 14,
                      fontWeight: settingsTabValue === category.id ? 600 : 400
                    }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>
        )
      }
      default:
        return null;
    }
  };

  const sidebarContent = renderSidebarContent();
  
  // 如果当前视图不需要侧边栏内容，但仍需要渲染容器以支持动画
  const shouldShow = open && sidebarContent;

  return (
    <Box
      sx={{
        width: shouldShow ? width : 0,
        minWidth: shouldShow ? width : 0,
        maxWidth: shouldShow ? width : 0,
        height: '100%',
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 50,
        opacity: shouldShow ? 1 : 0,
        transition: theme.transitions.create(['width', 'minWidth', 'maxWidth', 'opacity'], {
          easing: theme.transitions.easing.easeInOut,
          duration: theme.transitions.duration.standard,
        }),
      }}
    >
      <Box
        sx={{
          width: width,
          height: '100%',
          backgroundColor: 'background.paper',
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {sidebarContent}
      </Box>
    </Box>
  );
};

export default SecondarySidebar;
