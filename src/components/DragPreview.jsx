import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, Fade, Zoom } from '@mui/material';
import { styled, keyframes } from '@mui/material/styles';
import NoteIcon from '@mui/icons-material/Note';
import ChecklistIcon from '@mui/icons-material/Checklist';
import LaunchIcon from '@mui/icons-material/Launch';
import { useStore } from '../store/useStore';

// 拖拽预览动画
const dragFloat = keyframes`
  0%, 100% {
    transform: translateY(0px) rotate(0deg);
  }
  50% {
    transform: translateY(-5px) rotate(2deg);
  }
`;

// 边界提示动画
const boundaryPulse = keyframes`
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(25, 118, 210, 0.7);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(25, 118, 210, 0);
  }
`;

// 样式化的拖拽预览容器
const DragPreviewContainer = styled(Paper, {
  shouldForwardProp: (prop) => !['isDragging', 'isNearBoundary', 'primaryColor'].includes(prop),
})(({ theme, isDragging, isNearBoundary, primaryColor }) => ({
  position: 'fixed',
  pointerEvents: 'none',
  zIndex: 9999,
  padding: theme.spacing(1.5),
  minWidth: 200,
  maxWidth: 280,
  backgroundColor: theme.palette.background.paper,
  border: `2px solid ${primaryColor}`,
  borderRadius: theme.spacing(1),
  transform: 'translate(-50%, -50%)',
  transition: 'transform 0.1s ease-out', // 减少过渡时间，提高流畅度
  animation: isDragging ? `${dragFloat} 2s ease-in-out infinite` : 'none',
  // 确保内容不会溢出
  overflow: 'hidden',
  wordWrap: 'break-word',
  wordBreak: 'break-all',
  // 添加阴影效果
  boxShadow: theme.shadows[8],
  ...(isNearBoundary && {
    animation: `${boundaryPulse} 1s ease-in-out infinite, ${dragFloat} 2s ease-in-out infinite`,
    borderColor: primaryColor,
    backgroundColor: `${primaryColor}20`, // 20% 透明度
    boxShadow: `0 0 20px ${primaryColor}40`, // 发光效果
  }),
}));

// 边界指示器
const BoundaryIndicator = styled(Box, {
  shouldForwardProp: (prop) => !['position', 'primaryColor'].includes(prop),
})(({ theme, position, primaryColor }) => {
  const baseStyles = {
    position: 'fixed',
    backgroundColor: primaryColor,
    opacity: 0.8,
    zIndex: 9998,
    transition: 'all 0.3s ease-out',
  };

  switch (position) {
    case 'top':
      return {
        ...baseStyles,
        top: 0,
        left: 0,
        right: 0,
        height: 4,
      };
    case 'bottom':
      return {
        ...baseStyles,
        bottom: 0,
        left: 0,
        right: 0,
        height: 4,
      };
    case 'left':
      return {
        ...baseStyles,
        top: 0,
        left: 0,
        bottom: 0,
        width: 4,
      };
    case 'right':
      return {
        ...baseStyles,
        top: 0,
        right: 0,
        bottom: 0,
        width: 4,
      };
    default:
      return baseStyles;
  }
});

/**
 * 拖拽预览组件
 * 显示拖拽过程中的视觉反馈和动画效果
 */
const DragPreview = ({ 
  isDragging, 
  draggedItem, 
  draggedItemType, 
  currentPosition, 
  isNearBoundary,
  boundaryPosition 
}) => {
  const { primaryColor } = useStore();
  const [showPreview, setShowPreview] = useState(false);
  const [showBoundaryIndicator, setShowBoundaryIndicator] = useState(false);

  useEffect(() => {
    if (isDragging) {
      setShowPreview(true);
    } else {
      // 延迟隐藏预览，让动画完成
      const timer = setTimeout(() => setShowPreview(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isDragging]);

  useEffect(() => {
    if (isNearBoundary) {
      setShowBoundaryIndicator(true);
    } else {
      const timer = setTimeout(() => setShowBoundaryIndicator(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isNearBoundary]);

  if (!showPreview || !draggedItem) {
    return null;
  }

  const getItemIcon = () => {
    switch (draggedItemType) {
      case 'note':
        return <NoteIcon color="primary" />;
      case 'todo':
        return <ChecklistIcon color="primary" />;
      default:
        return <NoteIcon color="primary" />;
    }
  };

  const getItemTitle = () => {
    if (draggedItemType === 'note') {
      return draggedItem.title || '无标题笔记';
    } else if (draggedItemType === 'todo') {
      return 'Todo列表';
    }
    return '未知项目';
  };

  const getItemSubtitle = () => {
    if (draggedItemType === 'note') {
      const contentPreview = draggedItem.content 
        ? draggedItem.content.substring(0, 50) + (draggedItem.content.length > 50 ? '...' : '')
        : '空笔记';
      return contentPreview;
    } else if (draggedItemType === 'todo') {
      return `${draggedItem.todos?.length || 0} 个任务`;
    }
    return '';
  };

  return (
    <>
      {/* 拖拽预览 */}
      <Fade in={isDragging} timeout={200}>
        <DragPreviewContainer
          isDragging={isDragging}
          isNearBoundary={isNearBoundary}
          primaryColor={primaryColor}
          style={{
            left: currentPosition.x,
            top: currentPosition.y,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            {getItemIcon()}
            <Typography 
              variant="subtitle2" 
              sx={{ 
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '180px' // 限制标题最大宽度
              }}
            >
              {getItemTitle()}
            </Typography>
            {isNearBoundary && (
              <Zoom in={isNearBoundary}>
                <LaunchIcon color="success" fontSize="small" />
              </Zoom>
            )}
          </Box>
          
          <Typography 
            variant="caption" 
            color="text.secondary" 
            sx={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%' // 确保副标题不会溢出
            }}
          >
            {getItemSubtitle()}
          </Typography>
          
          {isNearBoundary && (
            <Fade in={isNearBoundary}>
              <Typography 
                variant="caption" 
                color="success.main" 
                sx={{ 
                  display: 'block', 
                  mt: 0.5, 
                  fontWeight: 'bold',
                  textAlign: 'center'
                }}
              >
                释放以创建独立窗口
              </Typography>
            </Fade>
          )}
        </DragPreviewContainer>
      </Fade>

      {/* 边界指示器 */}
      {showBoundaryIndicator && boundaryPosition && (
        <Fade in={isNearBoundary} timeout={300}>
          <BoundaryIndicator position={boundaryPosition} primaryColor={primaryColor} />
        </Fade>
      )}
    </>
  );
};

export default DragPreview;