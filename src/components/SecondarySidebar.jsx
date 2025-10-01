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
  Chip
} from '@mui/material';
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
      case 'files':
        return (
          <Box sx={{ p: 2 }}>
            {/* 文件管理的侧边栏内容 */}
            <div>文件夹树</div>
          </Box>
        );
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
      case 'vocabulary':
        return (
          <Box sx={{ p: 2 }}>
            {/* 单词本的侧边栏内容 */}
            <div>单词本列表</div>
          </Box>
        );
      case 'settings':
        return null; // 设置页面不需要侧边栏
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
        zIndex: 50, // 确保在一级侧边栏下方
        transition: theme.transitions.create(['width', 'minWidth', 'maxWidth'], {
          easing: theme.transitions.easing.easeInOut,
          duration: theme.transitions.duration.standard,
        }),
      }}
    >
      <Box
        sx={{
          width: width,
          minWidth: width,
          maxWidth: width,
          height: '100%',
          backgroundColor: 'background.paper',
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
          transform: shouldShow ? 'translateX(0)' : `translateX(-100%)`,
          transition: theme.transitions.create(['transform'], {
            easing: theme.transitions.easing.easeInOut,
            duration: theme.transitions.duration.standard,
          }),
        }}
      >
        {sidebarContent}
      </Box>
    </Box>
  );
};

export default SecondarySidebar;