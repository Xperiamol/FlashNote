import React from 'react';
import {
  Box,
  Drawer,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { useStore } from '../store/useStore';
import NoteList from './NoteList';
import TodoList from './TodoList';

const SecondarySidebar = ({ open, onClose, width = 320, onTodoSelect, onViewModeChange, onShowCompletedChange, viewMode, showCompleted, onMultiSelectChange, onMultiSelectRefChange, todoRefreshTrigger, todoSortBy, onTodoSortByChange, showDeleted }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { currentView } = useStore();

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
        return (
          <Box sx={{ p: 2 }}>
            {/* 日历的侧边栏内容 - 可以放小日历、事件列表等 */}
            <div>日历侧边栏</div>
          </Box>
        );
      case 'files':
        return (
          <Box sx={{ p: 2 }}>
            {/* 文件管理的侧边栏内容 */}
            <div>文件夹树</div>
          </Box>
        );
      case 'plugins':
        return (
          <Box sx={{ p: 2 }}>
            {/* 插件商店的侧边栏内容 */}
            <div>插件分类</div>
          </Box>
        );
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
        height: '100%',
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 50, // 确保在一级侧边栏下方
        transition: theme.transitions.create(['width'], {
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