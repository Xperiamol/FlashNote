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
    const d = new Date(dueStr)
    const m = new Date(minIso)
    if (isNaN(d.getTime()) || d < m) return minIso
    return d.toISOString().split('.')[0]
  } catch (e) {
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

  function buildPrompt(taskDescription, memoryContext, nowIsoMin) {
    // 注意：尽量把格式样例 JSON 用字符串插入，不用 code block
    const today = todayISODate()
    const example = [
      {
        content: '第一步任务',
        description: '具体怎么做',
        is_important: true,
        is_urgent: false,
        due_date: `${today}T${nowIsoMin}:00`
      }
    ]
    return `
你是任务规划专家。根据任务描述和用户历史偏好，将任务拆解成具体且可执行的待办事项。

今天日期：${today}

任务描述：${taskDescription}

历史参考（若有）：
${memoryContext || '无历史偏好'}

格式要求：
- 返回 JSON 数组，每个元素包含字段：content, description, is_important, is_urgent, due_date（可选，ISO 格式）。
- content: 任务标题（10-40字）
- description: 详细执行步骤或注意事项（选填）
- is_important: true/false（必填）
- is_urgent: true/false（必填）
- due_date: YYYY-MM-DDTHH:MM:SS（必须是今天或未来）

规划原则：
1) 生成 3-5 个待办事项，按执行顺序排列
2) 为每个任务分配合理的 due_date（不能早于 ${nowIsoMin}）
3) 如果记忆显示用户习惯渐进式截止，则分配跨天的截止日期
4) 直接返回纯 JSON 数组（不要用 Markdown 代码块）

示例格式：
${JSON.stringify(example, null, 2)}
`.trim()
  }

  function formatMemoryContext(planningMemories, knowledgeMemories) {
    const parts = []
    if (planningMemories && planningMemories.length) {
      parts.push('历史偏好：')
      parts.push(planningMemories.map((m, i) => `${i+1}. ${m.content}`).join('\n'))
    }
    if (knowledgeMemories && knowledgeMemories.length) {
      parts.push('相关笔记：')
      parts.push(knowledgeMemories.map((m, i) => `${i+1}. ${m.content.substring(0, 150)}${m.content.length > 150 ? '...' : ''}`).join('\n'))
    }
    return parts.join('\n\n')
  }

  async function searchRelevantMemory(userId, taskDescription) {
    if (!(await memoryManager.isAvailable())) return { planning: [], knowledge: [] }
    try {
      const planningRes = await memoryManager.search(userId, `${taskDescription} 任务规划 偏好`, { limit: 3, category: 'task_planning', threshold: 0.60 })
      const knowledgeRes = await memoryManager.search(userId, taskDescription, { limit: 5, category: 'knowledge', threshold: 0.55 })
      return {
        planning: planningRes?.memories || [],
        knowledge: knowledgeRes?.memories || []
      }
    } catch (e) {
      logger.warn('[Generator] memory search failed', e)
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
      memContext = formatMemoryContext(mems.planning, mems.knowledge)
      logger.debug('[Generator] memoryContext preview', memContext ? memContext.substring(0, 300) : '<empty>')
    } catch (e) {
      logger.warn('[Generator] failed to get memory context', e)
    }

    // Step 2: build prompt and call AI
    const prompt = buildPrompt(taskDescription, memContext, minIso)
    logger.debug('[Generator] prompt preview', prompt.substring(0, 500))
    const raw = await callAI(prompt)
    logger.debug('[Generator] AI raw content length', raw ? raw.length : 0)

    // Step 3: parse tasks
    const tasks = await parseTasksFromAI(raw)

    // Step 4: normalize & validate tasks
    const normalized = tasks.map((t, idx) => {
      const content = t.content || t.title || (`子任务 ${idx + 1}`)
      const description = t.description || ''
      const is_important = !!t.is_important
      const is_urgent = !!t.is_urgent
      const due_date = t.due_date ? ensureFutureDueDate(t.due_date, minIso) : null
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
    // turn numeric stats into a one-sentence semantic description via LLM
    const stats = {
      total: tasks.length,
      urgentCount: tasks.filter(t => !!t.is_urgent).length,
      importantCount: tasks.filter(t => !!t.is_important).length,
      hasDueDatesCount: tasks.filter(t => !!t.due_date).length
    }

    const prompt = `
请用一句不超过 50 字的自然语言总结用户在以下任务规划场景中的倾向（写成可以被长期记忆使用的语句）：
任务描述：${taskDescription}
任务数量：${stats.total}
紧急任务数：${stats.urgentCount}
重要任务数：${stats.importantCount}
带截止时间的任务数：${stats.hasDueDatesCount}

例子输出：“用户在规划 X 类任务时倾向于……”
不要使用百分比或具体数值（可用“多数/倾向/通常”等表达）。
`.trim()

    try {
      if (!ai || typeof ai.chat !== 'function') {
        // fallback simple heuristic summary (no LLM)
        const arr = []
        if (stats.urgentCount >= Math.ceil(stats.total * 0.7)) arr.push('倾向于将多数子任务标为紧急')
        else if (stats.urgentCount > 0) arr.push('包含部分紧急子任务')
        if (stats.importantCount >= Math.ceil(stats.total * 0.7)) arr.push('通常认为这些任务非常重要')
        else if (stats.importantCount > 0) arr.push('包含部分重要子任务')
        if (stats.hasDueDatesCount === stats.total) arr.push('每个子任务都有截止时间')
        const fallback = `用户在规划此类任务时${arr.length ? arr.join('，') : '表现出常规的时间管理习惯'}。`
        return { summary: fallback, stats }
      }

      const resp = await ai.chat([{ role: 'user', content: prompt }], { temperature: 0.2, max_tokens: 120 })
      const content = resp && resp.data && resp.data.content ? resp.data.content : (resp && resp.content ? resp.content : null)
      const summary = typeof content === 'string' ? content.trim().replace(/\n/g, ' ') : null
      return { summary: summary || `用户在规划此类任务时表现出稳定的模式。`, stats }
    } catch (e) {
      logger.warn('[Learner] summarizeBehavior failed, fallback', e)
      const fallbackSummary = `用户在规划此类任务时表现出稳定的模式。`
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

        // Launch asynchronous learning but await it so caller sees result; we keep separated logic
        try {
          await learner.writeMemory(userId, taskDescription, tasks)
        } catch (learnErr) {
          // learning failure should not block main result
          logger.warn('[AI Task Planner] learner.writeMemory failed', learnErr)
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
        const { tasks } = payload || {}
        if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('没有要创建的任务')
        logger.info('[AI Task Planner] create-todos', { count: tasks.length })

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
