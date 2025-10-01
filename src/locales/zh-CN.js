const zhCN = {
  todo: {
    dialog: {
      editTitle: '编辑待办事项',
      createTitle: '新建待办事项',
      cancel: '取消',
      create: '创建',
      save: '保存',
      saving: '保存中...'
    },
    fields: {
      contentLabel: '待办内容',
      contentPlaceholder: '请输入待办事项',
      importantLabel: '重要',
      urgentLabel: '紧急',
      tagsPlaceholder: '标签（用逗号分隔）',
      repeatTitle: '重复设置',
      dateLabel: '截止日期',
      timeLabel: '截止时间'
    },
    validation: {
      contentRequired: '待办内容不能为空',
      dateInvalid: '请选择有效的截止日期',
      dateRequiredForRepeat: '设置重复前请先选择截止日期',
      timeWithoutDate: '请选择截止时间前请先选择日期',
      timeInvalid: '请选择有效的截止时间'
    }
  },
  filters: {
    toggleButton: {
      show: '显示筛选器',
      hide: '隐藏筛选器',
      tooltip: '显示/隐藏筛选器'
    },
    placeholder: {
      searchNotes: '搜索笔记...',
      searchNotesDeleted: '搜索回收站...',
      searchTodos: '搜索待办事项...'
    }
  }
};

export default zhCN;
