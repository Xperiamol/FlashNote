/**
 * 历史数据迁移到 Mem0 记忆系统
 * 分析用户过往的笔记和待办事项,提取有价值的模式和偏好
 */

const path = require('path');
const Database = require('better-sqlite3');
const { app } = require('electron');

// 获取数据库路径
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'database', 'flashnote.db');

console.log('📊 开始分析历史数据...');
console.log('数据库路径:', dbPath);

const db = new Database(dbPath);

// 导入 Mem0 服务
const Mem0Service = require('../electron/services/Mem0Service');
const mem0Service = new Mem0Service(db, userDataPath);

async function main() {
  try {
    // 初始化 Mem0 服务
    console.log('\n🔧 初始化 Mem0 服务...');
    await mem0Service.initialize();
    
    const userId = 'current_user';
    
    // 1. 分析待办事项模式
    console.log('\n📋 分析待办事项模式...');
    await analyzeTodoPatterns(userId);
    
    // 2. 分析笔记主题
    console.log('\n📝 分析笔记主题和关键词...');
    await analyzeNoteThemes(userId);
    
    // 3. 分析完成情况和时间管理
    console.log('\n⏰ 分析任务完成模式...');
    await analyzeCompletionPatterns(userId);
    
    // 4. 分析标签使用习惯
    console.log('\n🏷️  分析标签使用习惯...');
    await analyzeTagUsage(userId);
    
    console.log('\n✅ 历史数据分析完成!');
    console.log('💡 现在 AI 助手可以根据你的历史习惯提供更个性化的建议了!');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error);
  } finally {
    db.close();
  }
}

/**
 * 分析待办事项模式
 */
async function analyzeTodoPatterns(userId) {
  // 获取所有待办事项
  const todos = db.prepare(`
    SELECT * FROM todos 
    WHERE created_at >= date('now', '-90 days')
    ORDER BY created_at DESC
  `).all();
  
  console.log(`  找到 ${todos.length} 个待办事项`);
  
  if (todos.length === 0) return;
  
  // 统计优先级偏好
  const importantCount = todos.filter(t => t.is_important === 1).length;
  const urgentCount = todos.filter(t => t.is_urgent === 1).length;
  const importantRatio = (importantCount / todos.length * 100).toFixed(0);
  const urgentRatio = (urgentCount / todos.length * 100).toFixed(0);
  
  if (importantCount > todos.length * 0.3) {
    await mem0Service.addMemory(userId, 
      `用户在过去90天创建了${todos.length}个待办事项,其中${importantRatio}%标记为重要,显示出对重要任务的重视`, 
      {
        category: 'task_planning',
        metadata: { source: 'historical_analysis', type: 'priority_pattern' }
      }
    );
  }
  
  if (urgentCount > todos.length * 0.3) {
    await mem0Service.addMemory(userId, 
      `用户有${urgentRatio}%的任务标记为紧急,倾向于处理时间敏感的工作`, 
      {
        category: 'task_planning',
        metadata: { source: 'historical_analysis', type: 'urgency_pattern' }
      }
    );
  }
  
  // 分析常见任务类型
  const taskTypes = new Map();
  todos.forEach(todo => {
    const keywords = todo.content.split(/[,，、\s]+/).filter(w => w.length > 1);
    keywords.forEach(kw => {
      taskTypes.set(kw, (taskTypes.get(kw) || 0) + 1);
    });
  });
  
  // 找出高频关键词 (出现5次以上)
  const frequentKeywords = Array.from(taskTypes.entries())
    .filter(([_, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([kw]) => kw);
  
  if (frequentKeywords.length > 0) {
    await mem0Service.addMemory(userId, 
      `用户经常创建与这些主题相关的任务：${frequentKeywords.join('、')}`, 
      {
        category: 'task_planning',
        metadata: { source: 'historical_analysis', type: 'frequent_topics', keywords: frequentKeywords }
      }
    );
  }
  
  // 分析截止日期习惯
  const todosWithDueDate = todos.filter(t => t.due_date).length;
  const dueDateRatio = (todosWithDueDate / todos.length * 100).toFixed(0);
  
  if (dueDateRatio > 70) {
    await mem0Service.addMemory(userId, 
      `用户习惯为大部分任务(${dueDateRatio}%)设置截止日期,显示出良好的时间规划意识`, 
      {
        category: 'task_planning',
        metadata: { source: 'historical_analysis', type: 'time_management' }
      }
    );
  }
  
  console.log(`  ✓ 已分析优先级模式、任务类型和时间管理习惯`);
}

/**
 * 分析笔记主题
 */
async function analyzeNoteThemes(userId) {
  // 获取最近的笔记
  const notes = db.prepare(`
    SELECT content, tags, created_at 
    FROM notes 
    WHERE created_at >= date('now', '-90 days')
    AND length(content) > 20
    ORDER BY created_at DESC
    LIMIT 200
  `).all();
  
  console.log(`  找到 ${notes.length} 篇笔记`);
  
  if (notes.length === 0) return;
  
  // 提取关键主题
  const themes = new Map();
  notes.forEach(note => {
    // 提取内容中的关键词 (简单分词)
    const words = note.content
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && w.length <= 10);
    
    words.forEach(word => {
      themes.set(word, (themes.get(word) || 0) + 1);
    });
  });
  
  // 找出高频主题 (出现10次以上)
  const topThemes = Array.from(themes.entries())
    .filter(([_, count]) => count >= 10)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([theme]) => theme);
  
  if (topThemes.length > 0) {
    await mem0Service.addMemory(userId, 
      `用户经常记录关于${topThemes.slice(0, 8).join('、')}等主题的笔记`, 
      {
        category: 'note_taking',
        metadata: { source: 'historical_analysis', type: 'note_themes', themes: topThemes }
      }
    );
  }
  
  // 分析笔记频率
  const notesPerWeek = (notes.length / 13).toFixed(1); // 90天约13周
  
  if (notes.length > 20) {
    await mem0Service.addMemory(userId, 
      `用户保持着良好的笔记习惯,平均每周记录${notesPerWeek}篇笔记`, 
      {
        category: 'note_taking',
        metadata: { source: 'historical_analysis', type: 'note_frequency' }
      }
    );
  }
  
  console.log(`  ✓ 已分析笔记主题和记录习惯`);
}

/**
 * 分析完成情况和时间管理
 */
async function analyzeCompletionPatterns(userId) {
  // 获取已完成的待办事项
  const completedTodos = db.prepare(`
    SELECT 
      content,
      is_important,
      is_urgent,
      created_at,
      completed_at,
      due_date,
      JULIANDAY(completed_at) - JULIANDAY(created_at) as completion_days
    FROM todos 
    WHERE is_completed = 1 
    AND completed_at >= date('now', '-90 days')
  `).all();
  
  console.log(`  找到 ${completedTodos.length} 个已完成任务`);
  
  if (completedTodos.length === 0) return;
  
  // 计算平均完成时间
  const avgCompletionDays = (
    completedTodos.reduce((sum, t) => sum + (t.completion_days || 0), 0) / completedTodos.length
  ).toFixed(1);
  
  if (completedTodos.length >= 10) {
    await mem0Service.addMemory(userId, 
      `用户平均在${avgCompletionDays}天内完成任务,显示出稳定的执行力`, 
      {
        category: 'task_planning',
        metadata: { source: 'historical_analysis', type: 'completion_speed' }
      }
    );
  }
  
  // 分析按时完成率
  const todosWithDueDate = completedTodos.filter(t => t.due_date);
  if (todosWithDueDate.length > 5) {
    const onTimeTodos = todosWithDueDate.filter(t => 
      t.completed_at && t.due_date && t.completed_at <= t.due_date
    );
    const onTimeRate = (onTimeTodos.length / todosWithDueDate.length * 100).toFixed(0);
    
    await mem0Service.addMemory(userId, 
      `用户有${onTimeRate}%的任务在截止日期前完成,${onTimeRate > 70 ? '时间管理能力优秀' : '建议改进时间规划'}`, 
      {
        category: 'task_planning',
        metadata: { source: 'historical_analysis', type: 'on_time_rate', rate: parseInt(onTimeRate) }
      }
    );
  }
  
  // 分析优先级完成模式
  const completedImportant = completedTodos.filter(t => t.is_important === 1).length;
  const completedUrgent = completedTodos.filter(t => t.is_urgent === 1).length;
  
  if (completedImportant > completedTodos.length * 0.4) {
    await mem0Service.addMemory(userId, 
      `用户倾向优先完成重要任务,展现出良好的优先级管理能力`, 
      {
        category: 'task_planning',
        metadata: { source: 'historical_analysis', type: 'priority_execution' }
      }
    );
  }
  
  console.log(`  ✓ 已分析任务完成模式和时间管理能力`);
}

/**
 * 分析标签使用习惯
 */
async function analyzeTagUsage(userId) {
  // 获取所有标签
  const tags = db.prepare(`
    SELECT name, COUNT(*) as usage_count
    FROM (
      SELECT TRIM(value) as name 
      FROM notes, json_each('["' || REPLACE(REPLACE(tags, ',', '","'), ' ', '') || '"]')
      WHERE tags != '' AND tags IS NOT NULL
      UNION ALL
      SELECT TRIM(value) as name
      FROM todos, json_each('["' || REPLACE(REPLACE(tags, ',', '","'), ' ', '') || '"]')
      WHERE tags != '' AND tags IS NOT NULL
    )
    WHERE name != ''
    GROUP BY name
    ORDER BY usage_count DESC
    LIMIT 20
  `).all();
  
  console.log(`  找到 ${tags.length} 个常用标签`);
  
  if (tags.length === 0) return;
  
  // 记录常用标签
  const topTags = tags.slice(0, 10).map(t => t.name);
  
  if (topTags.length >= 3) {
    await mem0Service.addMemory(userId, 
      `用户习惯使用标签来组织内容,常用标签包括：${topTags.join('、')}`, 
      {
        category: 'organization',
        metadata: { source: 'historical_analysis', type: 'tag_usage', tags: topTags }
      }
    );
  }
  
  // 分析标签使用频率
  const totalTagUsage = tags.reduce((sum, t) => sum + t.usage_count, 0);
  const avgTagUsage = (totalTagUsage / tags.length).toFixed(1);
  
  if (tags.length > 5) {
    await mem0Service.addMemory(userId, 
      `用户创建了${tags.length}个标签进行分类管理,显示出良好的组织习惯`, 
      {
        category: 'organization',
        metadata: { source: 'historical_analysis', type: 'organization_skill' }
      }
    );
  }
  
  console.log(`  ✓ 已分析标签使用习惯`);
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
