import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { keyframes, useTheme } from '@mui/material/styles';
import NoteIcon from '@mui/icons-material/Note';
import ChecklistIcon from '@mui/icons-material/Checklist';
import LaunchIcon from '@mui/icons-material/Launch';
import { useStore } from '../store/useStore';

// 优雅的浮动动画 - 更轻柔的幅度
const elegantFloat = keyframes`
  0%, 100% {
    transform: translate(-50%, -50%) translateY(0px) scale(1);
  }
  50% {
    transform: translate(-50%, -50%) translateY(-3px) scale(1.01);
  }
`;

// 呼吸光晕动画 - 用于边界提示
const glowPulse = keyframes`
  0%, 100% {
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 0 var(--glow-color);
  }
  50% {
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16), 0 0 24px 4px var(--glow-color);
  }
`;

// 图标弹跳动画
const iconBounce = keyframes`
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.15);
  }
`;

/**
 * 拖拽预览组件
 * 显示拖拽过程中的视觉反馈和动画效果
 * 采用毛玻璃风格，与应用整体设计语言一致
 */
const DragPreview = ({ 
  isDragging, 
  draggedItem, 
  draggedItemType, 
  currentPosition, 
  isNearBoundary,
  boundaryPosition,
  previewRef
}) => {
  const { primaryColor } = useStore();
  const muiTheme = useTheme();
  const isDarkMode = muiTheme.palette.mode === 'dark';
  const [showPreview, setShowPreview] = useState(false);
  const [showBoundaryIndicator, setShowBoundaryIndicator] = useState(false);

  useEffect(() => {
    if (isDragging) {
      setShowPreview(true);
    } else {
      const timer = setTimeout(() => setShowPreview(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isDragging, draggedItem]);

  useEffect(() => {
    if (isNearBoundary) {
      setShowBoundaryIndicator(true);
    } else {
      const timer = setTimeout(() => setShowBoundaryIndicator(false), 350);
      return () => clearTimeout(timer);
    }
  }, [isNearBoundary]);

  if (!showPreview || !draggedItem) {
    return null;
  }

  const getItemIcon = () => {
    const iconStyle = {
      fontSize: 20,
      color: primaryColor,
      animation: isNearBoundary ? `${iconBounce} 0.6s ease-in-out infinite` : 'none',
      transition: 'color 0.3s ease'
    };
    
    switch (draggedItemType) {
      case 'note':
        return <NoteIcon sx={iconStyle} />;
      case 'todo':
        return <ChecklistIcon sx={iconStyle} />;
      default:
        return <NoteIcon sx={iconStyle} />;
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
      {/* 拖拽预览卡片 - 毛玻璃风格 */}
      <div
        ref={previewRef}
        style={{
          '--glow-color': `${primaryColor}40`,
          position: 'fixed',
          left: currentPosition.x,
          top: currentPosition.y,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 99999,
          opacity: isDragging ? 1 : 0,
          transition: 'opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease, box-shadow 0.3s ease',
          padding: '14px 16px',
          minWidth: '180px',
          maxWidth: '260px',
          // 毛玻璃背景
          backgroundColor: isDarkMode 
            ? (isNearBoundary ? `${primaryColor}18` : 'rgba(30, 41, 59, 0.88)')
            : (isNearBoundary ? `${primaryColor}12` : 'rgba(255, 255, 255, 0.92)'),
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          // 边框
          border: isNearBoundary 
            ? `1.5px solid ${primaryColor}` 
            : `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
          borderRadius: '12px',
          // 阴影
          boxShadow: isNearBoundary
            ? `0 12px 40px rgba(0, 0, 0, ${isDarkMode ? '0.3' : '0.15'}), 0 0 20px ${primaryColor}30`
            : `0 8px 32px rgba(0, 0, 0, ${isDarkMode ? '0.25' : '0.1'})`,
          // 动画
          animation: isDragging 
            ? (isNearBoundary ? `${glowPulse} 1.5s ease-in-out infinite` : `${elegantFloat} 2.5s ease-in-out infinite`)
            : 'none',
          willChange: 'left, top, transform',
        }}
      >
        {/* 内容区域 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* 图标容器 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: '10px',
              backgroundColor: `${primaryColor}15`,
              flexShrink: 0,
              transition: 'background-color 0.3s ease',
              ...(isNearBoundary && {
                backgroundColor: `${primaryColor}25`,
              })
            }}
          >
            {getItemIcon()}
          </Box>
          
          {/* 文字内容 */}
          <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <Typography 
              variant="subtitle2" 
              sx={{ 
                fontWeight: 600,
                fontSize: '0.875rem',
                color: isDarkMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.87)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.3,
              }}
            >
              {getItemTitle()}
            </Typography>
            <Typography 
              variant="caption" 
              sx={{
                display: 'block',
                fontSize: '0.75rem',
                color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.4,
                mt: 0.25,
              }}
            >
              {getItemSubtitle()}
            </Typography>
          </Box>
          
          {/* 独立窗口图标 */}
          {isNearBoundary && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: '8px',
                backgroundColor: `${primaryColor}20`,
                animation: `${iconBounce} 0.8s ease-in-out infinite`,
              }}
            >
              <LaunchIcon sx={{ fontSize: 16, color: primaryColor }} />
            </Box>
          )}
        </Box>
        
        {/* 释放提示 */}
        {isNearBoundary && (
          <Box
            sx={{
              mt: 1.5,
              pt: 1,
              borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}`,
              textAlign: 'center',
            }}
          >
            <Typography 
              variant="caption" 
              sx={{ 
                fontWeight: 600,
                fontSize: '0.7rem',
                color: primaryColor,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              释放创建独立窗口
            </Typography>
          </Box>
        )}
      </div>

      {/* 边界光晕指示器 */}
      {showBoundaryIndicator && boundaryPosition && (
        <div
          style={{
            position: 'fixed',
            background: `linear-gradient(${
              boundaryPosition === 'top' ? '180deg' :
              boundaryPosition === 'bottom' ? '0deg' :
              boundaryPosition === 'left' ? '90deg' : '270deg'
            }, ${primaryColor}60 0%, transparent 100%)`,
            opacity: isNearBoundary ? 1 : 0,
            zIndex: 99998,
            transition: 'opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: 'none',
            ...(boundaryPosition === 'top' && { top: 0, left: 0, right: 0, height: '60px' }),
            ...(boundaryPosition === 'bottom' && { bottom: 0, left: 0, right: 0, height: '60px' }),
            ...(boundaryPosition === 'left' && { top: 0, left: 0, bottom: 0, width: '60px' }),
            ...(boundaryPosition === 'right' && { top: 0, right: 0, bottom: 0, width: '60px' }),
          }}
        />
      )}
    </>
  );
};

export default DragPreview;