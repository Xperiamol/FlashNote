import React from 'react';
import { Box } from '@mui/material';
import TagFilter from './TagFilter';
import PriorityFilter from './PriorityFilter';

/**
 * 筛选容器组件
 * 统一管理不同类型的筛选组件
 * 遵循单一职责原则，专门负责筛选UI的布局和组织
 */
const FilterContainer = ({
  // 通用属性
  showTagFilter = false,
  showPriorityFilter = false,
  
  // 标签筛选相关
  selectedTags = [],
  onTagsChange,
  showDeleted = false,
  isTodoFilter = false,
  
  // 优先级筛选相关
  selectedPriorities = [],
  onPrioritiesChange,
  
  // 样式
  sx = {}
}) => {
  // 如果没有启用任何筛选，不渲染组件
  if (!showTagFilter && !showPriorityFilter) {
    return null;
  }

  return (
    <Box sx={{ 
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      ...sx 
    }}>
      {/* 标签筛选 */}
      {showTagFilter && (
        <TagFilter
          selectedTags={selectedTags}
          onTagsChange={onTagsChange}
          showDeleted={showDeleted}
          isTodoFilter={isTodoFilter}
        />
      )}
      
      {/* 优先级筛选 */}
      {showPriorityFilter && (
        <PriorityFilter
          selectedPriorities={selectedPriorities}
          onPrioritiesChange={onPrioritiesChange}
        />
      )}
    </Box>
  );
};

export default FilterContainer;