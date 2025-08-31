import React, { useState, useEffect, useRef } from 'react';
import {
  TextField,
  Chip,
  Box,
  Paper,
  List,
  ListItem,
  ListItemText,
  Popper,
  ClickAwayListener,
  InputAdornment,
  IconButton
} from '@mui/material';
import { Tag as TagIcon, Clear as ClearIcon } from '@mui/icons-material';
import { parseTags, formatTags, validateTags, getTagColor } from '../utils/tagUtils';

/**
 * 标签输入组件
 * 支持自动完成、标签建议、验证等功能
 * 遵循SOLID原则，专门处理标签输入相关的UI逻辑
 */
const TagInput = ({
  value = '',
  onChange,
  placeholder = '标签 (用逗号分隔)',
  disabled = false,
  maxTags = 10,
  showSuggestions = true,
  getSuggestions, // 新增：自定义获取建议的函数
  size = 'small',
  variant = 'outlined',
  fullWidth = true,
  error = false,
  helperText = '',
  inline = false, // 新增：是否内嵌显示标签
  sx = {}
}) => {
  const [inputValue, setInputValue] = useState('');
  const [tags, setTags] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestionList, setShowSuggestionList] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  
  const inputRef = useRef(null);
  const anchorRef = useRef(null);
  const suggestionTimeoutRef = useRef(null);

  // 初始化标签
  useEffect(() => {
    const parsedTags = parseTags(value);
    setTags(parsedTags);
  }, [value]);

  // 获取标签建议
  const fetchSuggestions = async (query) => {
    if (!showSuggestions) return;
    
    try {
      setIsLoading(true);
      
      let suggestions = [];
      
      if (getSuggestions) {
        // 使用自定义的获取建议函数
        suggestions = await getSuggestions(query);
      } else if (window.electronAPI?.tags) {
        // 使用默认的标签API
        // 如果是首次获取建议（无查询条件），先重新计算标签使用次数
        if (!query || !query.trim()) {
          await window.electronAPI.tags.recalculateUsage();
        }
        
        const result = await window.electronAPI.tags.getSuggestions(query, 10);
        if (result?.success) {
          suggestions = result.data;
        }
      }
      
      // 过滤掉已存在的标签
      const filteredSuggestions = suggestions.filter(
        suggestion => !tags.includes(suggestion)
      );
      setSuggestions(filteredSuggestions);
    } catch (error) {
      console.error('获取标签建议失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 防抖获取建议
  const debouncedFetchSuggestions = (query) => {
    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
    }
    
    suggestionTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(query);
    }, 300);
  };

  // 处理输入变化
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    // 检查是否输入了逗号，如果是则添加标签
    if (newValue.includes(',')) {
      const newTags = newValue.split(',').map(tag => tag.trim()).filter(tag => tag);
      if (newTags.length > 0) {
        addTags(newTags);
        setInputValue('');
        return;
      }
    }
    
    // 获取建议
    if (newValue.trim()) {
      debouncedFetchSuggestions(newValue.trim());
      setShowSuggestionList(true);
    } else {
      setShowSuggestionList(false);
      setSuggestions([]);
    }
    
    setSelectedSuggestionIndex(-1);
  };

  // 添加标签
  const addTags = (newTags) => {
    const validation = validateTags(newTags);
    
    if (validation.errors.length > 0) {
      console.warn('标签验证失败:', validation.errors);
      // 这里可以显示错误提示
    }
    
    const uniqueTags = [...new Set([...tags, ...validation.validTags])];
    
    if (uniqueTags.length > maxTags) {
      console.warn(`最多只能添加 ${maxTags} 个标签`);
      return;
    }
    
    setTags(uniqueTags);
    onChange?.(formatTags(uniqueTags));
  };

  // 删除标签
  const removeTag = (tagToRemove) => {
    const newTags = tags.filter(tag => tag !== tagToRemove);
    setTags(newTags);
    onChange?.(formatTags(newTags));
  };

  // 处理键盘事件
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        // 选择建议的标签
        addTags([suggestions[selectedSuggestionIndex]]);
        setInputValue('');
        setShowSuggestionList(false);
        setSelectedSuggestionIndex(-1);
      } else if (inputValue.trim()) {
        // 添加输入的标签
        addTags([inputValue.trim()]);
        setInputValue('');
        setShowSuggestionList(false);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Escape') {
      setShowSuggestionList(false);
      setSelectedSuggestionIndex(-1);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      // 删除最后一个标签
      removeTag(tags[tags.length - 1]);
    }
  };

  // 选择建议
  const selectSuggestion = (suggestion) => {
    addTags([suggestion]);
    setInputValue('');
    setShowSuggestionList(false);
    setSelectedSuggestionIndex(-1);
    inputRef.current?.focus();
  };

  // 清空所有标签
  const clearAllTags = () => {
    setTags([]);
    onChange?.('');
    inputRef.current?.focus();
  };

  return (
    <ClickAwayListener onClickAway={() => setShowSuggestionList(false)}>
      <Box sx={{ position: 'relative', ...sx }}>
        {/* 非内嵌模式：标签显示在输入框上方 */}
        {!inline && tags.length > 0 && (
          <Box sx={{ mb: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {tags.map((tag, index) => (
              <Chip
                key={`${tag}-${index}`}
                label={tag}
                size="small"
                onDelete={() => removeTag(tag)}
                sx={{
                  backgroundColor: getTagColor(tag),
                  color: 'white',
                  '& .MuiChip-deleteIcon': {
                    color: 'rgba(255, 255, 255, 0.7)',
                    '&:hover': {
                      color: 'white'
                    }
                  }
                }}
              />
            ))}
          </Box>
        )}
        
        {/* 输入框 */}
        <TextField
          ref={inputRef}
          fullWidth={fullWidth}
          size={size}
          variant={variant}
          placeholder={tags.length === 0 ? placeholder : ''}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          error={error}
          helperText={helperText}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <TagIcon sx={{ color: 'action.active' }} />
              </InputAdornment>
            ),
            // 内嵌模式：标签显示在输入框内部
            ...(inline && tags.length > 0 && {
              startAdornment: (
                <InputAdornment position="start" sx={{ maxWidth: 'none' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TagIcon sx={{ color: 'action.active', mr: 0.5 }} />
                    <Box 
                      sx={{ 
                        display: 'flex', 
                        gap: 0.5, 
                        overflowX: 'auto',
                        maxWidth: '200px',
                        scrollbarWidth: 'thin',
                        '&::-webkit-scrollbar': {
                          height: '4px'
                        },
                        '&::-webkit-scrollbar-track': {
                          background: 'transparent'
                        },
                        '&::-webkit-scrollbar-thumb': {
                          background: 'rgba(0,0,0,0.2)',
                          borderRadius: '2px'
                        }
                      }}
                    >
                      {tags.map((tag, index) => (
                        <Chip
                          key={`${tag}-${index}`}
                          label={tag}
                          size="small"
                          onDelete={() => removeTag(tag)}
                          sx={{
                            backgroundColor: getTagColor(tag),
                            color: 'white',
                            minWidth: 'fit-content',
                            flexShrink: 0,
                            '& .MuiChip-deleteIcon': {
                              color: 'rgba(255, 255, 255, 0.7)',
                              '&:hover': {
                                color: 'white'
                              }
                            },
                            '& .MuiChip-label': {
                              fontSize: '0.75rem'
                            }
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                </InputAdornment>
              )
            }),
            endAdornment: tags.length > 0 && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={clearAllTags}
                  disabled={disabled}
                  sx={{ p: 0.5 }}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            )
          }}
          inputRef={anchorRef}
        />
        
        {/* 建议列表 */}
        <Popper
          open={showSuggestionList && suggestions.length > 0}
          anchorEl={anchorRef.current}
          placement="bottom-start"
          style={{ zIndex: 1300, width: anchorRef.current?.offsetWidth }}
        >
          <Paper elevation={3} sx={{ maxHeight: 200, overflow: 'auto' }}>
            <List dense>
              {suggestions.map((suggestion, index) => (
                <ListItem
                  key={suggestion}
                  button
                  selected={index === selectedSuggestionIndex}
                  onClick={() => selectSuggestion(suggestion)}
                  sx={{
                    '&.Mui-selected': {
                      backgroundColor: 'primary.light',
                      color: 'primary.contrastText'
                    }
                  }}
                >
                  <ListItemText
                    primary={suggestion}
                    sx={{
                      '& .MuiListItemText-primary': {
                        fontSize: '0.875rem'
                      }
                    }}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Popper>
        
        {/* 标签计数提示 */}
        {tags.length > 0 && (
          <Box sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
            {tags.length}/{maxTags} 个标签
          </Box>
        )}
      </Box>
    </ClickAwayListener>
  );
};

export default TagInput;