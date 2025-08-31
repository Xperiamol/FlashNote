import { useState, useCallback } from 'react';

/**
 * 通用搜索Hook
 * 遵循SOLID原则中的单一职责原则，专门处理搜索逻辑
 * 遵循DRY原则，避免在不同组件中重复搜索代码
 * @param {Object} options - 搜索配置选项
 * @param {Function} options.searchAPI - 搜索API函数
 * @param {Function} options.onSearchResult - 搜索结果处理回调
 * @param {Function} options.onError - 错误处理回调
 * @param {number} options.debounceDelay - 防抖延迟时间，默认300ms
 * @returns {Object} 搜索状态和方法
 */
export const useSearch = (options = {}) => {
  const {
    searchAPI,
    onSearchResult,
    onError,
    debounceDelay = 300
  } = options;

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState(null);

  // 执行搜索
  const performSearch = useCallback(async (query) => {
    if (!searchAPI) {
      console.warn('searchAPI not provided to useSearch hook');
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const result = await searchAPI(query);
      
      if (result?.success) {
        const results = result.data || [];
        setSearchResults(results);
        onSearchResult?.(results, query);
      } else {
        const error = result?.error || 'Search failed';
        setSearchError(error);
        onError?.(error);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchError(error.message);
      onError?.(error);
    } finally {
      setIsSearching(false);
    }
  }, [searchAPI, onSearchResult, onError]);

  // 带防抖的搜索
  const debouncedSearch = useCallback((query) => {
    setSearchQuery(query);
    
    // 清除之前的定时器
    if (debouncedSearch.timeoutId) {
      clearTimeout(debouncedSearch.timeoutId);
    }

    // 如果查询为空，清空结果
    if (!query.trim()) {
      setSearchResults([]);
      setSearchError(null);
      onSearchResult?.([], query);
      return;
    }

    // 设置新的防抖定时器
    debouncedSearch.timeoutId = setTimeout(() => {
      performSearch(query);
    }, debounceDelay);
  }, [performSearch, debounceDelay, onSearchResult]);

  // 清空搜索
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
    
    if (debouncedSearch.timeoutId) {
      clearTimeout(debouncedSearch.timeoutId);
    }
    
    onSearchResult?.([], '');
  }, [onSearchResult]);

  // 立即搜索（不防抖）
  const immediateSearch = useCallback((query) => {
    setSearchQuery(query);
    if (query.trim()) {
      performSearch(query);
    } else {
      clearSearch();
    }
  }, [performSearch, clearSearch]);

  return {
    // 状态
    isSearching,
    searchQuery,
    searchResults,
    searchError,
    
    // 方法
    search: debouncedSearch,
    immediateSearch,
    clearSearch,
    performSearch
  };
};

export default useSearch;