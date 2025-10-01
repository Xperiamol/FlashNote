import React from 'react';
import { IconButton, Tooltip, Collapse } from '@mui/material';
import { FilterList as FilterIcon } from '@mui/icons-material';
import zhCN from '../locales/zh-CN';

const {
  filters: { toggleButton }
} = zhCN;

/**
 * 搜索框筛选器切换按钮组件
 * 提供一致的筛选器显示/隐藏交互
 */
const FilterToggleButton = ({ 
  filtersVisible, 
  onToggle, 
  tooltipTitle = toggleButton.tooltip,
  size = 'small',
  disabled = false 
}) => {
  return (
    <Tooltip title={tooltipTitle}>
      <IconButton
        size={size}
        onClick={onToggle}
        disabled={disabled}
        sx={{
          color: filtersVisible ? 'primary.contrastText' : 'text.secondary',
          backgroundColor: filtersVisible ? 'primary.main' : 'transparent',
          transition: 'all 0.2s ease',
          '&:hover': {
            color: filtersVisible ? 'primary.contrastText' : 'text.primary',
            backgroundColor: filtersVisible ? 'primary.dark' : 'action.hover',
            transform: 'scale(1.1)'
          },
          '&:active': {
            transform: 'scale(0.95)'
          }
        }}
      >
        <FilterIcon sx={{
          transition: 'transform 0.2s ease',
          transform: filtersVisible ? 'rotate(0deg)' : 'rotate(-90deg)'
        }} />
      </IconButton>
    </Tooltip>
  );
};

/**
 * 带筛选器切换功能的搜索框容器组件
 * 标准化搜索框+筛选器的布局和交互
 */
export const SearchWithFilters = ({
  searchField,
  filtersContent,
  filtersVisible,
  onToggleFilters,
  searchBoxSx = {},
  filtersContainerSx = {}
}) => {
  // 克隆搜索框组件，添加筛选器按钮到endAdornment
  const enhancedSearchField = React.cloneElement(searchField, {
    InputProps: {
      ...searchField.props.InputProps,
      endAdornment: (
        <>
          {searchField.props.InputProps?.endAdornment}
          <FilterToggleButton
            filtersVisible={filtersVisible}
            onToggle={onToggleFilters}
          />
        </>
      )
    }
  });

  return (
    <>
      {/* 搜索框 */}
      <div style={searchBoxSx}>
        {enhancedSearchField}
      </div>
      
      {/* 筛选器容器 */}
      <Collapse in={filtersVisible} timeout={200}>
        <div style={filtersContainerSx}>
          {filtersContent}
        </div>
      </Collapse>
    </>
  );
};

export default FilterToggleButton;