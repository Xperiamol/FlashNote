import { useEffect, useCallback, useRef } from 'react';
import { useMultiSelect } from './useMultiSelect';

/**
 * 多选管理Hook
 * 遵循SOLID原则中的单一职责原则，专门管理多选状态和回调
 * 遵循DRY原则，避免在组件中重复多选管理代码
 * 解决React无限更新循环问题
 */
export const useMultiSelectManager = ({
  items = [],
  itemType = '',
  onMultiSelectChange,
  onMultiSelectRefChange
}) => {
  // 使用useRef存储最新的回调函数引用，避免依赖项变化导致的无限循环
  const onMultiSelectChangeRef = useRef(onMultiSelectChange);
  const onMultiSelectRefChangeRef = useRef(onMultiSelectRefChange);
  const itemsRef = useRef(items);
  const itemTypeRef = useRef(itemType);
  
  // 更新refs以保持最新值
  useEffect(() => {
    onMultiSelectChangeRef.current = onMultiSelectChange;
    onMultiSelectRefChangeRef.current = onMultiSelectRefChange;
    itemsRef.current = items;
    itemTypeRef.current = itemType;
  });
  
  // 使用稳定的回调函数，避免无限循环
  const stableOnSelectionChange = useCallback((selectedIds) => {
    // 使用setTimeout延迟回调，避免在渲染过程中调用setState
    setTimeout(() => {
      onMultiSelectChangeRef.current?.({
        isActive: true, // 有选中项时，多选模式应该是激活的
        selectedIds,
        selectedCount: selectedIds.length,
        totalCount: itemsRef.current.length,
        itemType: itemTypeRef.current
      });
    }, 0);
  }, []); // 空依赖数组，避免无限循环
  
  const stableOnModeChange = useCallback((isActive) => {
    // 使用setTimeout延迟回调，避免在渲染过程中调用setState
    setTimeout(() => {
      // 只在退出多选模式时更新状态
      // 进入多选模式时，状态由 stableOnSelectionChange 管理
      if (!isActive) {
        onMultiSelectChangeRef.current?.({
          isActive: false,
          selectedIds: [],
          selectedCount: 0,
          totalCount: itemsRef.current.length,
          itemType: itemTypeRef.current
        });
      }
    }, 0);
  }, []); // 空依赖数组，避免无限循环
  
  // 创建稳定的getAllIds函数
  const getAllIds = useCallback(() => {
    return itemsRef.current.map(item => item.id);
  }, []); // 空依赖数组，使用ref获取最新值
  
  // 创建多选实例
  const multiSelect = useMultiSelect({
    getAllIds,
    onSelectionChange: stableOnSelectionChange,
    onModeChange: stableOnModeChange
  });
  
  // 管理多选引用传递
  useEffect(() => {
    // 使用setTimeout延迟回调，避免在渲染过程中调用setState
    setTimeout(() => {
      if (multiSelect.isMultiSelectMode) {
        onMultiSelectRefChangeRef.current?.(multiSelect);
      } else {
        onMultiSelectRefChangeRef.current?.(null);
      }
    }, 0);
  }, [multiSelect.isMultiSelectMode]); // 移除onMultiSelectRefChange依赖，避免无限循环
  
  return multiSelect;
};

export default useMultiSelectManager;