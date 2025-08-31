import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 搜索管理Hook
 * 遵循SOLID原则中的单一职责原则，专门管理搜索状态和防抖逻辑
 * 遵循DRY原则，避免在组件中重复搜索管理代码
 * 解决React无限更新循环问题
 */
export const useSearchManager = ({
  searchFunction,
  loadFunction,
  searchCondition,
  debounceDelay = 300
}) => {
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const debounceTimerRef = useRef(null);
  
  // 使用useRef存储最新的函数引用，避免依赖项变化导致的无限循环
  const searchFunctionRef = useRef(searchFunction);
  const loadFunctionRef = useRef(loadFunction);
  const searchConditionRef = useRef(searchCondition);
  
  // 更新refs以保持最新值
  useEffect(() => {
    searchFunctionRef.current = searchFunction;
    loadFunctionRef.current = loadFunction;
    searchConditionRef.current = searchCondition;
  });
  
  // 防抖搜索函数 - 使用稳定的依赖项
  const debouncedSearch = useCallback((query) => {
    // 清除之前的定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // 设置新的防抖定时器
    debounceTimerRef.current = setTimeout(() => {
      if (query.trim()) {
        searchFunctionRef.current(query);
      } else {
        loadFunctionRef.current(searchConditionRef.current);
      }
    }, debounceDelay);
  }, [debounceDelay]); // 只依赖debounceDelay，避免无限循环
  
  // 监听搜索查询变化
  useEffect(() => {
    debouncedSearch(localSearchQuery);
    
    // 清理函数
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [localSearchQuery, debouncedSearch]);
  
  // 清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);
  
  return {
    localSearchQuery,
    setLocalSearchQuery
  };
};

export default useSearchManager;