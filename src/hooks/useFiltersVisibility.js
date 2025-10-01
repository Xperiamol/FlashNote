import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';

/**
 * 筛选器可见性状态管理Hook
 * 支持本地存储同步，在跨会话间记忆状态
 * 使用全局设置作为默认值
 */
export const useFiltersVisibility = (storageKey = 'filters_visible') => {
  const { filtersDefaultVisible } = useStore();
  
  // 从本地存储读取初始状态，如果没有则使用全局设置的默认值
  const getInitialState = () => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored !== null ? JSON.parse(stored) : filtersDefaultVisible;
    } catch (error) {
      console.warn('Failed to read filters visibility from localStorage:', error);
      return filtersDefaultVisible;
    }
  };

  const [filtersVisible, setFiltersVisible] = useState(getInitialState);

  // 状态变化时同步到本地存储
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(filtersVisible));
    } catch (error) {
      console.warn('Failed to save filters visibility to localStorage:', error);
    }
  }, [filtersVisible, storageKey]);

  const toggleFiltersVisibility = () => {
    setFiltersVisible(prev => !prev);
  };

  return {
    filtersVisible,
    toggleFiltersVisibility,
    setFiltersVisible
  };
};