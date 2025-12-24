// ai-task-planner.js (模块化重构版，CommonJS)
// 可无缝替换原插件文件：保留原命令 ID 与对外行为，但内部模块化重构
// 主要模块：Context / Logger / MemoryManager / Generator / Learner

// -------------------- 配置 --------------------
const DEFAULT_CONFIG = {
  MAX_MEMORY_SEARCH_RESULTS: 8,
  MEMORY_SIMILARITY_THRESHOLD_ADD: 0.8, // 若相似度 >= 则合并（update）
  MEMORY_SEARCH_THRESHOLD: 0.55,
  GENERATE_TEMPERATURE: 0.6,
  GENERATE_MAX_TOKENS: 1500,
  DEBUG_LOG: false // 可通过 runtime.config 或环境变量启用
}

// -------------------- 工具：Context --------------------
function getUserIdFromRuntime(runtime) {
  // 尝试多种 runtime API 来获取当前用户 id，回退到 'current_user'
  try {
    if (runtime.user && typeof runtime.user.getCurrent === 'function') {
      const u = runtime.user.getCurrent()
      if (u && u.id) return u.id
    }
    if (runtime.context && typeof runtime.context.get === 'function') {
      const u = runtime.context.get('user') || runtime.context.get('currentUser')
      if (u && u.id) return u.id
    }
  } catch (e) {
    // ignore
  }
  // fallback
  return 'current_user'
}

function todayISODate() {
  // YYYY-MM-DD
  return new Date().toISOString().split('T')[0]
}

function ensureFutureDueDate(dueStr, minIso) {
  // 若 dueStr 为空或早于 minIso，则返回 minIso（默认 minIso 为 ISO date + time）
  if (!dueStr) return minIso
  try {
    // 解析时间字符串（支持带 Z 的 UTC 格式和不带时区的本地格式）
    let d
    if (dueStr.endsWith('Z')) {
      // UTC 时间，转换为本地时间
      d = new Date(dueStr)
    } else {
      // 假设为本地时间格式，添加本地时区偏移
      d = new Date(dueStr)
    }

    const m = new Date(minIso)
    if (isNaN(d.getTime()) || d < m) return minIso

    // 获取本地时间的小时（0-23）
    const localHour = d.getHours()

    // 检查小时是否在合理范围（8:00-23:59）
    if (localHour >= 0 && localHour < 8) {
      // 如果在凌晨0-7点，调整到当天早上9点
      d.setHours(9, 0, 0, 0)
      console.log(`[Time Adjust] 调整凌晨时间 ${dueStr} (${localHour}:00) -> ${d.toISOString()}`)
    }

    // 返回本地时间的 ISO 格式（不含毫秒和时区）
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const seconds = String(d.getSeconds()).padStart(2, '0')

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
  } catch (e) {
    console.error('[Time Parse Error]', e)
    return minIso
  }
}

// -------------------- 工具：Logger --------------------
function createLogger(runtime, debugFlag) {
  const DEBUG = debugFlag === true || (runtime && runtime.config && runtime.config.get && runtime.config.get('debugMode') === true)
  return {
    info: (...args) => { if (DEBUG) runtime.logger.info(...args) },
    warn: (...args) => runtime.logger.warn(...args),
    error: (...args) => runtime.logger.error(...args),
    debug: (...args) => { if (DEBUG) runtime.logger.debug(...args) },
  }
}

// -------------------- 模块：MemoryManager --------------------
function MemoryManagerFactory(runtime, cfg, logger) {
  const memApi = runtime.mem0

  async function isAvailable() {
    try {
      if (!memApi || typeof memApi.isAvailable !== 'function') return false
      return await memApi.isAvailable()
    } catch (e) {
      logger.warn('[MemoryManager] mem0.isAvailable error', e)
      return false
    }
  }

  async function search(userId, query, opts = {}) {
    if (!await isAvailable()) return { memories: [] }
    const limit = opts.limit || cfg.MAX_MEMORY_SEARCH_RESULTS
    const category = opts.category
    const threshold = opts.threshold || cfg.MEMORY_SEARCH_THRESHOLD
    try {
      // runtime.mem0.search(userId, query, { limit, category, threshold })
      return await memApi.search(userId, query, { limit, category, threshold })
    } catch (e) {
      logger.warn('[MemoryManager] search failed', e)
      return { memories: [] }
    }
  }

  async function add(userId, text, options = {}) {
    if (!await isAvailable()) return null
    try {
      // API name differences: support both add and addMemory (compat)
      if (typeof memApi.add === 'function') {
        return await memApi.add(userId, text, options)
      } else if (typeof memApi.addMemory === 'function') {
        return await memApi.addMemory(userId, text, options)
      } else {
        throw new Error('mem0 client has no add method')
      }
    } catch (e) {
      logger.warn('[MemoryManager] add failed', e)
      return null
    }
  }

  async function update(memoryId, text, options = {}) {
    if (!await isAvailable()) return null
    try {
      if (typeof memApi.update === 'function') {
        return await memApi.update(memoryId, text, options)
      } else {
        // fallback: remove and add (not ideal) - but try to call update if available
        logger.warn('[MemoryManager] mem0.update missing; skipping update')
        return null
      }
    } catch (e) {
      logger.warn('[MemoryManager] update failed', e)
      return null
    }
  }

  async function get(userId, opts = {}) {
    if (!await isAvailable()) return []
    try {
      if (typeof memApi.get === 'function') {
        return await memApi.get(userId, opts)
      } else if (typeof memApi.list === 'function') {
        // some runtimes call it list
        return await memApi.list(userId, opts)
      } else {
        return []
      }
    } catch (e) {
      logger.warn('[MemoryManager] get failed', e)
      return []
    }
  }

  async function clear(userId) {
    if (!await isAvailable()) return false
    try {
      if (typeof memApi.clear === 'function') {
        await memApi.clear(userId)
        return true
      } else {
        logger.warn('[MemoryManager] clear not supported')
        return false
      }
    } catch (e) {
      logger.warn('[MemoryManager] clear failed', e)
      return false
    }
  }

  return {
    isAvailable,
    search,
    add,
    update,
    get,
    clear
  }
}

// -------------------- 模块：Generator（生成任务计划） --------------------
function GeneratorFactory(runtime, cfg, logger, memoryManager) {
  const ai = runtime.ai

  async function isAIAvailable() {
    try {
      if (!ai || typeof ai.isAvailable !== 'function') return false
      return await ai.isAvailable()
    } catch (e) {
      logger.warn('[Generator] ai.isAvailable error', e)
      return false
    }
  }

  function buildPrompt(taskDescription, memoryContext, nowIsoMin, upcomingEvents) {
    // 注意：尽量把格式样例 JSON 用字符串插入，不用 code block
    const today = todayISODate()
    const now = new Date()
    const currentHour = now.getHours()

    // 生成一个合理的示例时间（如果当前时间在凌晨，使用上午9点；否则使用当前时间）
    let exampleHour = currentHour >= 8 && currentHour < 24 ? currentHour : 9
    let exampleMinute = currentHour >= 8 && currentHour < 24 ? now.getMinutes() : 0
    const exampleTime = `${String(exampleHour).padStart(2, '0')}:${String(exampleMinute).padStart(2, '0')}:00`

    const example = [
      {
        content: '第一步任务',
        description: '具体怎么做',
        is_important: true,
        is_urgent: false,
        due_date: `${today}T${exampleTime}`
      }
    ]

    // 格式化未来事件信息
    let eventsContext = '';
    if (upcomingEvents && upcomingEvents.length > 0) {
      eventsContext = '\n未来一周的日程安排（请避免与这些时间冲突）：\n';
      upcomingEvents.forEach((event, idx) => {
        const dueDate = event.due_date ? new Date(event.due_date).toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit'
        }) : '无截止日期';
        const urgentTag = event.is_urgent && event.is_important ? '[紧急重要]' : event.is_important ? '[重要]' : event.is_urgent ? '[紧急]' : '';
        const status = event.is_completed ? '[已完成]' : '[待处理]';
        eventsContext += `${idx + 1}. ${status}${urgentTag} ${event.content} - ${dueDate}\n`;
      });
    }

    // 格式化精确的当前时间（使用已有的 now 变量）
    const currentTime = now.toLocaleString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    return `
你是生活规划专家，擅长将用户的想法转化为具体可执行的行动计划。

今天日期：${today}
当前时间：${currentTime}

用户需求：${taskDescription}

${memoryContext || '无参考信息'}
${eventsContext}

**核心原则**：
根据用户需求类型，生成不同风格的任务：

1. **旅行/出游类**（如"去武汉玩"、"周末旅行"）：
   - 必须给出实际的**景点名称**和**游玩活动**
   - 例如：Day1 上午游览黄鹤楼 → Day1 下午逛户部巷品尝小吃 → Day2 游东湖等
   - 包含具体的地点推荐，不要只说"规划路线"、"确定景点"这种抽象任务
   - 如果用户问"去哪玩"，你需要推荐具体的景点

2. **学习类**（如"学习React"）：
   - 给出具体的学习内容和步骤
   - 例如：学习React组件基础 → 练习Hooks用法 → 完成一个小项目

3. **日常事务类**（如"整理房间"、"准备会议"）：
   - 给出具体的执行步骤
   - 例如：整理书桌杂物 → 收纳书籍 → 擦拭家具等

**重要**：不要生成"确定XXX"、"规划XXX"、"调研XXX"这类空泛的准备任务，而是直接给出**实际要做的事情**。

格式要求：
- 返回 JSON 数组
- content: 任务标题（具体描述要做什么，10-40字）
- description: 地点详情、注意事项或具体步骤
- is_important: true/false
- is_urgent: true/false  
- due_date: YYYY-MM-DDTHH:MM:SS 格式

时间安排：
- 当前时间 ${nowIsoMin}，所有任务不能早于此时间
- 旅行类：按天分配，每天 2-3 个活动
- 日常类：同一天完成，间隔 1-2 小时
- 时间限制：08:00-23:59

直接返回纯 JSON 数组：
${JSON.stringify(example, null, 2)}
`.trim()
  }

  function formatMemoryContext(planningMemories, knowledgeMemories) {
    const parts = []

    // 知识记忆优先展示（笔记内容更有价值）
    if (knowledgeMemories && knowledgeMemories.length) {
      const maxKnowledgeLen = 600  // 单条最大 600 字符
      const maxTotalKnowledge = 3000  // 总计最大 3000 字符
      let usedLen = 0
      const knowledgeLines = []

      // 按相似度排序（确保最相关的内容优先显示）
      const sortedMemories = [...knowledgeMemories].sort((a, b) => (b.score || 0) - (a.score || 0))

      for (const m of sortedMemories) {
        if (usedLen >= maxTotalKnowledge) break
        const availableLen = Math.min(maxKnowledgeLen, maxTotalKnowledge - usedLen)
        const content = m.content.substring(0, availableLen).trim()

        // 降低过滤阈值：只要内容有意义就保留（>=3 字符）
        if (content.length >= 3) {
          const scoreInfo = m.score ? ` [相关度: ${(m.score * 100).toFixed(0)}%]` : ''
          knowledgeLines.push(`- ${content}${m.content.length > availableLen ? '...' : ''}${scoreInfo}`)
          usedLen += content.length
        }
      }

      if (knowledgeLines.length) {
        parts.push('【用户笔记中的相关知识】')
        parts.push('以下是用户笔记中与任务相关的内容，请参考其中的步骤、流程、注意事项：')
        parts.push(knowledgeLines.join('\n'))
      }
    }

    // 规划偏好次要展示
    if (planningMemories && planningMemories.length) {
      parts.push('【用户历史规划偏好】')
      parts.push(planningMemories.map((m, i) => `${i + 1}. ${m.content}`).join('\n'))
    }

    return parts.join('\n\n')
  }

  async function searchRelevantMemory(userId, taskDescription) {
    if (!(await memoryManager.isAvailable())) {
      console.log('[Generator] 记忆服务不可用，跳过搜索')
      return { planning: [], knowledge: [] }
    }
    try {
      console.log('[Generator] 开始搜索记忆，用户:', userId, '任务描述:', taskDescription)

      // 减少规划记忆数量（抽象偏好不需要太多），提高阈值过滤低质量匹配
      const planningRes = await memoryManager.search(userId, `${taskDescription} 规划`, { limit: 2, category: 'task_planning', threshold: 0.5 })
      console.log('[Generator] 规划记忆搜索结果:', planningRes?.memories?.length || 0)

      // 增加知识记忆数量（笔记内容更有价值），降低阈值以召回更多相关内容
      const knowledgeRes = await memoryManager.search(userId, taskDescription, { limit: 10, category: 'knowledge', threshold: 0.30 })
      console.log('[Generator] 知识记忆搜索结果:', knowledgeRes?.memories?.length || 0)

      return {
        planning: planningRes?.memories || [],
        knowledge: knowledgeRes?.memories || []
      }
    } catch (e) {
      logger.warn('[Generator] memory search failed', e)
      console.error('[Generator] 记忆搜索失败:', e)
      return { planning: [], knowledge: [] }
    }
  }

  async function callAI(prompt) {
    if (!await isAIAvailable()) throw new Error('AI 服务不可用')
    try {
      const resp = await ai.chat([{ role: 'user', content: prompt }], { temperature: cfg.GENERATE_TEMPERATURE, max_tokens: cfg.GENERATE_MAX_TOKENS })
      // resp may contain different shapes depending on runtime
      if (resp && resp.success && resp.data && resp.data.content) return resp.data.content
      if (resp && resp.content) return resp.content
      if (resp && resp.message) return resp.message
      // fallback: try JSON stringify
      return typeof resp === 'string' ? resp : JSON.stringify(resp)
    } catch (e) {
      logger.error('[Generator] AI call failed', e)
      throw e
    }
  }

  async function parseTasksFromAI(rawContent) {
    // robust extraction of JSON array
    if (!rawContent || typeof rawContent !== 'string') {
      throw new Error('AI 返回内容为空或非字符串')
    }

    // remove possible code fences
    let clean = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim()

    // try direct JSON parse
    try {
      if (clean.startsWith('[') && clean.endsWith(']')) {
        const arr = JSON.parse(clean)
        if (Array.isArray(arr)) return arr
      }
    } catch (e) {
      // continue to regex extraction
    }

    const match = clean.match(/\[[\s\S]*\]/)
    if (!match) {
      throw new Error('未从 AI 响应中提取到 JSON 数组')
    }

    try {
      const arr = JSON.parse(match[0])
      if (!Array.isArray(arr)) throw new Error('解析出的 JSON 不是数组')
      return arr
    } catch (e) {
      throw new Error('解析 JSON 数组失败: ' + e.message)
    }
  }

  async function generatePlan(userId, taskDescription) {
    const now = new Date()
    const minIso = new Date(now.getTime()).toISOString().split('.')[0] // 精确到秒，不含毫秒

    // Step 1: retrieve memory context
    let memContext = ''
    try {
      const mems = await searchRelevantMemory(userId, taskDescription)

      // 详细日志：显示搜索结果
      console.log('[Generator] 记忆搜索完成:', {
        planningCount: mems.planning?.length || 0,
        knowledgeCount: mems.knowledge?.length || 0
      })
      if (mems.knowledge?.length > 0) {
        console.log('[Generator] 知识记忆示例:', mems.knowledge.slice(0, 2).map(m => ({
          score: m.score?.toFixed(3),
          preview: m.content?.substring(0, 80) + '...'
        })))
      }

      memContext = formatMemoryContext(mems.planning, mems.knowledge)
      console.log('[Generator] 格式化后的记忆上下文长度:', memContext.length)
      if (memContext.length > 0) {
        console.log('[Generator] 记忆上下文预览:', memContext.substring(0, 500))
      }
    } catch (e) {
      logger.warn('[Generator] failed to get memory context', e)
    }

    // Step 1.5: retrieve upcoming events (next 7 days)
    let upcomingEvents = []
    try {
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const allTodos = await runtime.todos.list({ includeCompleted: false })
      upcomingEvents = allTodos.filter(todo => {
        if (!todo.due_date) return false
        const dueDate = new Date(todo.due_date)
        return dueDate >= now && dueDate <= sevenDaysLater
      }).sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      logger.info('[Generator] 未来7天待办数量:', upcomingEvents.length)
      if (upcomingEvents.length > 0) {
        logger.info('[Generator] 示例事件:', upcomingEvents.slice(0, 3).map(e => `${e.content} @ ${e.due_date}`))
      }
    } catch (e) {
      logger.warn('[Generator] failed to get upcoming events', e)
    }

    // Step 2: build prompt and call AI
    const prompt = buildPrompt(taskDescription, memContext, minIso, upcomingEvents)
    console.log('[Generator] ===== 完整 Prompt 开始 =====')
    console.log(prompt)
    console.log('[Generator] ===== 完整 Prompt 结束 =====')
    const raw = await callAI(prompt)
    logger.debug('[Generator] AI raw content length', raw ? raw.length : 0)

    // Step 3: parse tasks
    const tasks = await parseTasksFromAI(raw)
    logger.info('[Generator] AI 返回的任务数量:', tasks.length)

    // Step 4: normalize & validate tasks
    const normalized = tasks.map((t, idx) => {
      const content = t.content || t.title || (`子任务 ${idx + 1}`)
      const description = t.description || ''
      const is_important = !!t.is_important
      const is_urgent = !!t.is_urgent
      const originalDueDate = t.due_date
      const due_date = t.due_date ? ensureFutureDueDate(t.due_date, minIso) : null

      // 记录时间调整信息
      if (originalDueDate && due_date && originalDueDate !== due_date) {
        logger.info(`[Generator] 时间已调整: "${content}" ${originalDueDate} -> ${due_date}`)
      } else if (due_date) {
        logger.info(`[Generator] 任务时间: "${content}" ${due_date}`)
      }

      return { content, description, is_important, is_urgent, due_date }
    })

    if (!Array.isArray(normalized) || normalized.length === 0) {
      throw new Error('生成的任务为空')
    }

    return normalized
  }

  return {
    generatePlan,
    searchRelevantMemory
  }
}

// -------------------- 模块：Learner（从生成结果学习并写记忆） --------------------
function LearnerFactory(runtime, cfg, logger, memoryManager) {
  const ai = runtime.ai

  async function summarizeBehavior(taskDescription, tasks) {
    // 提取更具体的任务信息用于生成有意义的记忆
    const stats = {
      total: tasks.length,
      urgentCount: tasks.filter(t => !!t.is_urgent).length,
      importantCount: tasks.filter(t => !!t.is_important).length,
      hasDueDatesCount: tasks.filter(t => !!t.due_date).length
    }

    // 提取任务内容摘要（前3个任务的标题）
    const taskTitles = tasks.slice(0, 3).map(t => t.content || t.title || '').filter(t => t.length > 0)
    const taskPreview = taskTitles.join('、')

    // 分析截止时间分布
    const dueDates = tasks.filter(t => t.due_date).map(t => new Date(t.due_date))
    let timePattern = ''
    if (dueDates.length >= 2) {
      const sortedDates = dueDates.sort((a, b) => a - b)
      const firstDate = sortedDates[0]
      const lastDate = sortedDates[sortedDates.length - 1]
      const daySpan = Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24))
      if (daySpan === 0) timePattern = '集中在同一天完成'
      else if (daySpan <= 2) timePattern = '分布在2-3天内'
      else timePattern = `跨越${daySpan}天渐进式安排`
    }

    const prompt = `
请用 2-3 句话（80字以内）总结用户在"${taskDescription}"这类任务中的规划偏好，用于长期记忆：

任务拆分详情：
- 共拆分为 ${stats.total} 个子任务
- 子任务示例：${taskPreview || '(无)'}
- 紧急任务 ${stats.urgentCount} 个，重要任务 ${stats.importantCount} 个
- ${stats.hasDueDatesCount} 个有截止时间${timePattern ? '，' + timePattern : ''}

要求：
1. 描述用户如何拆分此类任务（按步骤/按优先级/按时间等）
2. 描述时间安排特点（如有）
3. 提及1-2个具体的子任务名称作为例子
4. 不要使用"稳定的模式"等空泛表达
`.trim()

    try {
      if (!ai || typeof ai.chat !== 'function') {
        // fallback simple heuristic summary (no LLM)
        const arr = []
        if (taskPreview) arr.push(`拆分为"${taskPreview}"等步骤`)
        if (stats.urgentCount >= Math.ceil(stats.total * 0.7)) arr.push('多数标为紧急')
        else if (stats.importantCount >= Math.ceil(stats.total * 0.7)) arr.push('多数标为重要')
        if (timePattern) arr.push(timePattern)
        const fallback = `用户在规划"${taskDescription.substring(0, 20)}"时${arr.length ? arr.join('，') : '按常规方式拆分'}。`
        return { summary: fallback, stats }
      }

      const resp = await ai.chat([{ role: 'user', content: prompt }], { temperature: 0.3, max_tokens: 200 })
      const content = resp && resp.data && resp.data.content ? resp.data.content : (resp && resp.content ? resp.content : null)
      const summary = typeof content === 'string' ? content.trim().replace(/\n/g, ' ') : null
      return { summary: summary || `用户将"${taskDescription.substring(0, 20)}"拆分为${stats.total}个子任务。`, stats }
    } catch (e) {
      logger.warn('[Learner] summarizeBehavior failed, fallback', e)
      const fallbackSummary = `用户将"${taskDescription.substring(0, 20)}"拆分为${stats.total}个子任务。`
      return { summary: fallbackSummary, stats }
    }
  }

  async function writeMemory(userId, taskDescription, tasks) {
    if (!await memoryManager.isAvailable()) return false
    try {
      logger.info('[Learner] summarizing behavior for:', taskDescription)

      const { summary, stats } = await summarizeBehavior(taskDescription, tasks)
      logger.info('[Learner] AI summary result:', summary)

      const existing = await memoryManager.search(
        userId,
        taskDescription,
        { limit: 5, category: 'task_planning', threshold: cfg.MEMORY_SEARCH_THRESHOLD }
      )
      const exists = (existing && Array.isArray(existing.memories) && existing.memories.length > 0)
        ? existing.memories[0] : null
      if (exists && exists.score)
        logger.info(`[Learner] found similar memory (${(exists.score * 100).toFixed(1)}%)`)

      const metadata = {
        source: 'ai_task_planner',
        date: todayISODate(),
        stats: {
          total: tasks.length,
          urgentCount: tasks.filter(t => !!t.is_urgent).length,
          importantCount: tasks.filter(t => !!t.is_important).length,
          hasDueDatesCount: tasks.filter(t => !!t.due_date).length
        },
        taskType: taskDescription.substring(0, 120)
      }

      let res = null
      if (exists && exists.score && exists.score >= cfg.MEMORY_SIMILARITY_THRESHOLD_ADD) {
        if (exists.id) {
          res = await memoryManager.update(exists.id, summary, { category: 'task_planning', metadata })
          logger.info('[Learner] memory write action: update', metadata)
        } else {
          res = await memoryManager.add(userId, summary, { category: 'task_planning', metadata })
          logger.info('[Learner] memory write action: add (no id)', metadata)
        }
      } else {
        res = await memoryManager.add(userId, summary, { category: 'task_planning', metadata })
        logger.info('[Learner] memory write action: add', metadata)
      }

      logger.info('[Learner] memory write completed:', res || '(no id returned)')
      return true
    } catch (e) {
      logger.warn('[Learner] writeMemory failed', e)
      return false
    }
  }


  return {
    writeMemory
  }
}

// -------------------- 主体激活逻辑（保留原命令 ID） --------------------
module.exports = (function main() {
  // we expect runtime to be global injected
  // but some runtimes call this module and pass runtime; support both
  try {
    // If runtime is provided as argument (some plugin loaders do this)
    if (arguments && arguments.length && arguments[0] && arguments[0].onActivate) {
      // invoked with runtime
      const runtime = arguments[0]
      return activate(runtime)
    } else if (typeof runtime !== 'undefined') {
      // runtime global exists (original code used global runtime)
      return activate(runtime)
    } else {
      // nothing to do - plugin loader should call activate explicitly
      return {
        activate
      }
    }
  } catch (e) {
    // export activate fallback
    return { activate }
  }

  // actual activate function
  function activate(runtime) {
    const cfg = Object.assign({}, DEFAULT_CONFIG, (runtime && runtime.config && runtime.config.get ? runtime.config.get('aiTaskPlanner') : {}))
    const logger = createLogger(runtime, cfg.DEBUG_LOG || DEFAULT_CONFIG.DEBUG_LOG)
    const memoryManager = MemoryManagerFactory(runtime, cfg, logger)
    const generator = GeneratorFactory(runtime, cfg, logger, memoryManager)
    const learner = LearnerFactory(runtime, cfg, logger, memoryManager)

    runtime.onActivate(() => {
      logger.info('[AI Task Planner] 插件已激活 (模块化重构版)')
    })

    // ---------- 保留命令：打开窗口 ----------
    runtime.registerCommand({
      id: 'ai-task-planner.open',
      title: 'AI 任务规划',
      description: '使用 AI 智能拆解任务并生成待办事项',
      surfaces: ['toolbar:todos'],
      icon: 'sparkles'
    }, async () => {
      try {
        logger.info('[AI Task Planner] open command invoked')
        await runtime.ui.openWindow({
          url: 'planner-mui.html',
          title: 'AI 任务规划助手',
          width: 1000,
          height: 700
        })
        return { status: 'opened' }
      } catch (error) {
        logger.error('[AI Task Planner] 无法打开窗口', error)
        await runtime.notifications.show({ title: '错误', body: '无法打开任务规划窗口', type: 'error' })
        return { status: 'error', error: error.message }
      }
    })

    // ---------- 保留命令：generate ----------
    runtime.registerCommand({ id: 'ai-task-planner.generate', title: '生成任务计划' }, async (payload) => {
      try {
        const { taskDescription } = payload || {}
        if (!taskDescription || typeof taskDescription !== 'string') throw new Error('请提供任务描述')

        logger.info('[AI Task Planner] generate invoked', { taskDescription: taskDescription.substring(0, 120) })
        const userId = getUserIdFromRuntime(runtime)
        const now = new Date()
        const minIso = new Date(now.getTime()).toISOString().split('.')[0]

        // Generate plan
        let tasks = []
        try {
          tasks = await generator.generatePlan(userId, taskDescription)
          logger.info('[AI Task Planner] generatePlan succeeded', { count: tasks.length })
        } catch (genErr) {
          logger.error('[AI Task Planner] generatePlan failed', genErr)
          throw genErr
        }


        // Map to DB field names expected by create-todos
        return {
          status: 'success',
          tasks: tasks.map(t => ({
            content: t.content,
            description: t.description || '',
            is_important: Boolean(t.is_important),
            is_urgent: Boolean(t.is_urgent),
            due_date: t.due_date || null
          }))
        }

      } catch (error) {
        logger.error('[AI Task Planner] generate command failed', error)
        return { status: 'error', error: error.message }
      }
    })

    // ---------- 保留命令：create-todos ----------
    runtime.registerCommand({ id: 'ai-task-planner.create-todos', title: '创建待办事项' }, async (payload) => {
      try {
        const { tasks, taskDescription } = payload || {}
        if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('没有要创建的任务')
        logger.info('[AI Task Planner] create-todos', { count: tasks.length, taskDescription: taskDescription?.substring(0, 50) })

        const results = []
        for (const task of tasks) {
          try {
            if (!task.content && !task.title) throw new Error('任务缺少内容')
            const todoData = {
              content: task.content || task.title || '未命名任务',
              description: task.description || '',
              is_completed: false,
              is_important: Boolean(task.is_important),
              is_urgent: Boolean(task.is_urgent)
            }
            if (task.due_date) todoData.due_date = task.due_date
            // create via runtime.todos.create
            const created = await runtime.todos.create(todoData)
            results.push({ success: true, todo: created })
          } catch (e) {
            logger.warn('[AI Task Planner] create todo failed', e)
            results.push({ success: false, error: e.message, task })
          }
        }

        const successCount = results.filter(r => r.success).length
        await runtime.notifications.show({
          title: '任务创建完成',
          body: `成功创建 ${successCount}/${tasks.length} 个待办事项`,
          type: successCount === tasks.length ? 'success' : 'warning'
        })

        // 在用户确认创建后才学习记忆（基于实际创建的任务）
        if (taskDescription && successCount > 0) {
          const userId = getUserIdFromRuntime(runtime)
          const createdTasks = results.filter(r => r.success).map(r => r.todo)
          try {
            await learner.writeMemory(userId, taskDescription, createdTasks)
            logger.info('[AI Task Planner] learner.writeMemory succeeded after create-todos')
          } catch (learnErr) {
            logger.warn('[AI Task Planner] learner.writeMemory failed', learnErr)
          }
        }

        return { status: 'success', results, summary: { total: tasks.length, success: successCount, failed: tasks.length - successCount } }
      } catch (error) {
        logger.error('[AI Task Planner] create-todos failed', error)
        return { status: 'error', error: error.message }
      }
    })

    // ---------- 保留命令：get-todos ----------
    runtime.registerCommand({ id: 'ai-task-planner.get-todos', title: '获取待办列表' }, async () => {
      try {
        const todos = await runtime.todos.list()
        logger.info('[AI Task Planner] get-todos', { count: todos.length })
        return { status: 'success', todos }
      } catch (error) {
        logger.error('[AI Task Planner] get-todos failed', error)
        return { status: 'error', error: error.message }
      }
    })

    // ---------- 保留命令：get-memories ----------
    runtime.registerCommand({ id: 'ai-task-planner.get-memories', title: '获取学习记忆' }, async () => {
      try {
        const userId = getUserIdFromRuntime(runtime)
        if (!await memoryManager.isAvailable()) {
          return { status: 'unavailable', message: 'Mem0 服务未初始化' }
        }
        const memories = await memoryManager.get(userId, { category: 'task_planning', limit: 50 })
        const stats = (typeof runtime.mem0.stats === 'function') ? await runtime.mem0.stats(userId) : null
        logger.info('[AI Task Planner] get-memories', { count: memories.length })
        return { status: 'success', memories, stats }
      } catch (error) {
        logger.error('[AI Task Planner] get-memories failed', error)
        return { status: 'error', error: error.message }
      }
    })

    // ---------- 保留命令：clear-memories ----------
    runtime.registerCommand({ id: 'ai-task-planner.clear-memories', title: '清除学习记忆' }, async () => {
      try {
        const userId = getUserIdFromRuntime(runtime)
        if (!await memoryManager.isAvailable()) return { status: 'unavailable', message: 'Mem0 服务未初始化' }
        await memoryManager.clear(userId)
        await runtime.notifications.show({ title: '记忆已清除', body: '所有学习偏好已重置', type: 'success' })
        logger.info('[AI Task Planner] cleared memories for user', userId)
        return { status: 'success' }
      } catch (error) {
        logger.error('[AI Task Planner] clear-memories failed', error)
        return { status: 'error', error: error.message }
      }
    })

    runtime.onDeactivate(() => {
      logger.info('[AI Task Planner] 插件已停用')
    })
  }
})
