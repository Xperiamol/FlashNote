import React, { useState, useEffect } from 'react';
import {
  Box,
  Skeleton,
  Collapse
} from '@mui/material';
import { getTagColor } from '../utils/tagUtils';
import BaseFilter from './BaseFilter';
import FilterChip from './FilterChip';

/**
 * 标签筛选组件
 * 在搜索框下方提供标签筛选功能
 * 支持展开/收起、多选筛选、清空筛选等功能
 */
const TagFilter = ({ 
  selectedTags = [], 
  onTagsChange, 
  showDeleted = false,
  isTodoFilter = false,
  sx = {} 
}) => {
  const [allTags, setAllTags] = useState([]);
  const [popularTags, setPopularTags] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 加载标签数据
  const loadTags = async () => {
    setIsLoading(true);
    try {
      if (isTodoFilter) {
        // 获取待办事项标签统计
        const todoTagsResult = await window.electronAPI.todos.getTodoTagStats();
        if (todoTagsResult.success) {
          const validTags = todoTagsResult.data.filter(tag => tag.usage_count > 0);
          setAllTags(validTags);
          // 对于待办事项，热门标签就是使用次数最多的前几个
          setPopularTags(validTags.slice(0, 10));
        }
      } else {
        if (!window.electronAPI?.tags) return;
        
        // 首先重新计算标签使用次数，确保统计准确
        await window.electronAPI.tags.recalculateUsage();
        
        const [allTagsResult, popularTagsResult] = await Promise.all([
          window.electronAPI.tags.getAll(),
          window.electronAPI.tags.getPopular(8) // 获取前8个热门标签
        ]);
        
        if (allTagsResult?.success) {
          // 过滤掉使用次数为0的标签
          const validTags = allTagsResult.data.filter(tag => tag.usage_count > 0);
          setAllTags(validTags);
        }
        
        if (popularTagsResult?.success) {
          // 过滤掉使用次数为0的标签
          const validPopularTags = popularTagsResult.data.filter(tag => tag.usage_count > 0);
          setPopularTags(validPopularTags);
        }
      }
    } catch (error) {
      console.error('加载标签失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 组件挂载时加载标签
  useEffect(() => {
    loadTags();
  }, []);

  // 切换标签选择状态
  const toggleTag = (tagName) => {
    const newSelectedTags = selectedTags.includes(tagName)
      ? selectedTags.filter(tag => tag !== tagName)
      : [...selectedTags, tagName];
    
    onTagsChange?.(newSelectedTags);
  };

  // 清空所有筛选
  const clearAllFilters = () => {
    onTagsChange?.([]);
  };

  // 渲染标签芯片
  const renderTagChips = (tags) => (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {tags.map(tag => (
        <FilterChip
          key={tag.name}
          label={tag.name}
          value={tag.name}
          isSelected={selectedTags.includes(tag.name)}
          onClick={toggleTag}
          color={getTagColor(tag.name)}
          count={tag.usage_count}
        />
      ))}
    </Box>
  );

  // 渲染加载状态
  const renderLoadingState = () => (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton
          key={index}
          variant="rounded"
          width={Math.random() * 60 + 60}
          height={24}
        />
      ))}
    </Box>
  );

  // 如果没有标签数据，不显示组件
  if (!isLoading && allTags.length === 0) {
    return null;
  }

  // 渲染内容
  const renderContent = () => {
    if (isLoading) {
      return renderLoadingState();
    }

    return (
      <Box>
        {/* 所有标签 */}
        {renderTagChips(allTags)}
      </Box>
    );
  };

  return (
    <BaseFilter
      title="标签筛选"
      selectedItems={selectedTags}
      onClearAll={clearAllFilters}
      expandable={allTags.length > 0}
      isExpanded={isExpanded}
      onToggleExpand={() => setIsExpanded(!isExpanded)}
      sx={sx}
    >
      {renderContent()}
    </BaseFilter>
  );
};

export default TagFilter;