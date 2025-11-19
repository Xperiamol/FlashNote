// AI 任务规划插件
// 使用全局 runtime 对象访问所有 API

runtime.onActivate(() => {
	runtime.logger.info('[AI Task Planner] 插件已激活')

	// 注册工具栏命令
	runtime.registerCommand(
		{
			id: 'ai-task-planner.open',
			title: 'AI 任务规划',
			description: '使用 AI 智能拆解任务并生成待办事项',
			surfaces: ['toolbar:todos'],
			icon: 'sparkles'
		},
		async () => {
			try {
				runtime.logger.info('[AI Task Planner] 打开任务规划窗口')
				
				// 打开规划窗口（使用 MUI 版本）
				await runtime.ui.openWindow({
					url: 'planner-mui.html',
					title: 'AI 任务规划助手',
					width: 1000,
					height: 700
				})

				return { status: 'opened' }
			} catch (error) {
				runtime.logger.error('[AI Task Planner] 打开窗口失败', error)
				await runtime.notifications.show({
					title: '错误',
					body: '无法打开任务规划窗口',
					type: 'error'
				})
				return { status: 'error', error: error.message }
			}
		}
	)

	// 注册生成任务的命令（供窗口调用）
	runtime.registerCommand(
		{
			id: 'ai-task-planner.generate',
			title: '生成任务计划'
		},
		async (payload) => {
			try {
				const { taskDescription } = payload || {}
				
				if (!taskDescription) {
					throw new Error('请提供任务描述')
				}

				runtime.logger.info('[AI Task Planner] 开始生成任务计划', { taskDescription })

				// 检查 AI 是否可用
				const aiAvailable = await runtime.ai.isAvailable()
				if (!aiAvailable) {
					throw new Error('AI 服务不可用，请检查设置')
				}

// 获取当前日期时间
const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
const now = new Date() // 获取当前完整日期时间
const currentHour = now.getHours()
const currentMinute = now.getMinutes()

// ========== 新增：搜索历史偏好 ==========
const userId = 'current_user' // 简化示例，实际应从用户系统获取
let memoryContext = ''
				
				try {
					// 检查 Mem0 是否可用
					const mem0Available = await runtime.mem0.isAvailable()
					
					if (mem0Available) {
						runtime.logger.info('[AI Task Planner] Mem0 可用，搜索历史偏好和相关笔记')
						
						// 搜索任务规划偏好
						const searchQuery = `${taskDescription} 任务规划 子任务 优先级 时间安排`
						
						runtime.logger.info('[AI Task Planner] 开始搜索 task_planning')
						const planningResult = await runtime.mem0.search(
							userId,
							searchQuery,
							{ limit: 3, category: 'task_planning', threshold: 0.60 }
						)
						runtime.logger.info('[AI Task Planner] planningResult 类型:', typeof planningResult, Object.keys(planningResult || {}))
						const planningMemories = planningResult?.memories || []
						runtime.logger.info('[AI Task Planner] planningMemories 长度:', planningMemories.length)
						
						// 搜索相关笔记知识
						runtime.logger.info('[AI Task Planner] 开始搜索 knowledge')
						const knowledgeResult = await runtime.mem0.search(
							userId,
							taskDescription,
							{ limit: 5, category: 'knowledge', threshold: 0.55 }
						)
						runtime.logger.info('[AI Task Planner] knowledgeResult 类型:', typeof knowledgeResult, Object.keys(knowledgeResult || {}))
						const knowledgeMemories = knowledgeResult?.memories || []
						runtime.logger.info('[AI Task Planner] knowledgeMemories 长度:', knowledgeMemories.length)
						
						// 合并结果
						runtime.logger.info('[AI Task Planner] 准备合并数组')
						const allMemories = [...planningMemories, ...knowledgeMemories]
						runtime.logger.info('[AI Task Planner] 合并后总数:', allMemories.length)
						
						if (allMemories.length > 0) {
							// 按相似度排序并格式化记忆上下文
							const sortedMemories = allMemories.sort((a, b) => b.score - a.score).slice(0, 8)
							
							memoryContext = '\n\n【参考信息】\n'
							
							if (planningMemories.length > 0) {
								memoryContext += '【历史偏好】\n' + 
									planningMemories.map((m, i) => `${i+1}. ${m.content}`).join('\n') + '\n\n'
							}
							
							if (knowledgeMemories.length > 0) {
								memoryContext += '【相关笔记】\n' + 
									knowledgeMemories.slice(0, 5).map((m, i) => 
										`${i+1}. ${m.content.substring(0, 150)}${m.content.length > 150 ? '...' : ''}`
									).join('\n')
							}
							
							runtime.logger.info('[AI Task Planner] 找到相关信息', { 
								planningCount: planningMemories.length,
								knowledgeCount: knowledgeMemories.length,
								topScore: allMemories.length > 0 ? (allMemories[0].score * 100).toFixed(0) + '%' : '0%'
							})
							runtime.logger.info('[AI Task Planner] 记忆内容预览:', memoryContext.substring(0, 300))
						} else {
							runtime.logger.info('[AI Task Planner] 未找到相关历史信息')
						}
					}
				} catch (memError) {
					runtime.logger.warn('[AI Task Planner] Mem0 搜索失败（继续生成）', memError)
				}

// 调用 AI 生成任务计划（包含记忆上下文）
runtime.logger.info('[AI Task Planner] 完整 memoryContext:', memoryContext)
const prompt = `你是任务规划专家。根据任务描述和用户历史偏好，将任务拆解成具体的待办事项。

今天日期：${today}

任务描述：${taskDescription}${memoryContext}

格式要求：
- content: 任务内容（必填，简洁明了，10-30字）
- description: 详细说明（选填，具体的执行步骤或注意事项）
- is_important: true/false（必填，是否重要）
- is_urgent: true/false（必填，是否紧急）
- due_date: YYYY-MM-DDTHH:MM:SS（选填，截止日期时间，必须是今天或未来日期）

规划原则：
1. 生成3-5个待办事项，按执行顺序排列
2. 为每个任务分配合理的 due_date
3. 参考用户历史偏好中的子任务模式和优先级习惯
4. 如果历史偏好显示用户喜欢设置渐进式截止日期，则合理分配时间
5. due_date 必须 >= ${today}T${currentHour}:${currentMinute}:00，不要设置过去的日期时间
6. 让每个子任务都具体可执行，避免过于宽泛
7. 直接返回纯JSON数组，不要用markdown代码块包裹

示例格式：
[{"content":"第一步任务","description":"具体怎么做","is_important":true,"is_urgent":true,"due_date":"${today}T${currentHour + 1}:${currentMinute}:00"}]`

				const response = await runtime.ai.chat([
					{
						role: 'user',
						content: prompt
					}
				], {
					temperature: 0.6, // 适度创造性
					max_tokens: 1500
				})

				runtime.logger.info('[AI Task Planner] AI 响应原始数据', { 
					responseType: typeof response,
					responseKeys: Object.keys(response || {}),
					hasSuccess: !!response.success,
					hasData: !!response.data,
					hasDataContent: !!(response.data && response.data.content),
					hasContent: !!response.content,
					hasMessage: !!response.message
				})

				// 解析 AI 响应 - 重写版本
				let tasks = []
				let rawContent = ''
				
				try {
					// 步骤1: 提取原始内容
					if (response.success && response.data && response.data.content) {
						rawContent = response.data.content
						runtime.logger.info('[AI Task Planner] 提取: response.data.content')
					} 
					else if (response.data && response.data.content) {
						rawContent = response.data.content
						runtime.logger.info('[AI Task Planner] 提取: response.data.content (无success)')
					}
					else if (response.content) {
						rawContent = response.content
						runtime.logger.info('[AI Task Planner] 提取: response.content')
					}
					else if (response.message) {
						rawContent = response.message
						runtime.logger.info('[AI Task Planner] 提取: response.message')
					}
					else {
						runtime.logger.error('[AI Task Planner] 无法找到内容', { response })
						throw new Error('AI 响应格式不正确，无法找到内容字段')
					}
					
					if (!rawContent || typeof rawContent !== 'string') {
						throw new Error(`AI 返回内容无效: ${typeof rawContent}`)
					}
					
					runtime.logger.info('[AI Task Planner] 原始内容', { 
						length: rawContent.length,
						first200: rawContent.substring(0, 200),
						last100: rawContent.substring(Math.max(0, rawContent.length - 100))
					})
					
					// 步骤2: 清理内容
					let cleanContent = rawContent
						.replace(/```json\s*/gi, '')  // 移除 ```json
						.replace(/```javascript\s*/gi, '')  // 移除 ```javascript
						.replace(/```\s*/g, '')  // 移除其他 ```
						.trim()
					
					runtime.logger.info('[AI Task Planner] 清理后内容', { 
						length: cleanContent.length,
						first200: cleanContent.substring(0, 200)
					})
					
					// 步骤3: 提取JSON数组
					let jsonText = ''
					
					// 尝试直接解析（如果整个内容就是JSON）
					if (cleanContent.startsWith('[') && cleanContent.endsWith(']')) {
						jsonText = cleanContent
						runtime.logger.info('[AI Task Planner] 内容本身就是JSON数组')
					}
					// 否则尝试正则匹配
					else {
						const jsonMatch = cleanContent.match(/\[[\s\S]*\]/)
						if (jsonMatch) {
							jsonText = jsonMatch[0]
							runtime.logger.info('[AI Task Planner] 通过正则提取JSON数组')
						} else {
							runtime.logger.error('[AI Task Planner] 未找到JSON数组', { cleanContent })
							throw new Error('AI 响应中未找到 JSON 数组格式')
						}
					}
					
					runtime.logger.info('[AI Task Planner] 准备解析JSON', { 
						jsonLength: jsonText.length,
						jsonPreview: jsonText.substring(0, 150)
					})
					
					// 步骤4: 解析JSON
					tasks = JSON.parse(jsonText)
					
					runtime.logger.info('[AI Task Planner] JSON解析成功', { 
						tasksType: typeof tasks,
						isArray: Array.isArray(tasks),
						tasksLength: Array.isArray(tasks) ? tasks.length : 'N/A'
					})
					
					// 步骤5: 验证是数组
					if (!Array.isArray(tasks)) {
						throw new Error(`解析结果不是数组: ${typeof tasks}`)
					}
					
					if (tasks.length === 0) {
						throw new Error('解析成功但数组为空')
					}
					
					runtime.logger.info('[AI Task Planner] 成功解析任务', { 
						count: tasks.length,
						firstTask: tasks[0]
					})
					
				} catch (error) {
					runtime.logger.error('[AI Task Planner] 解析失败', { 
						error: error.message,
						errorStack: error.stack,
						rawContentLength: rawContent.length,
						rawContentPreview: rawContent.substring(0, 300)
					})
					throw new Error(`无法解析 AI 生成的任务列表: ${error.message}`)
				}

				runtime.logger.info('[AI Task Planner] 最终生成了', tasks.length, '个任务')

				// ========== 新增：学习并记录本次规划特征 ==========
				try {
					const mem0Available = await runtime.mem0.isAvailable()
					
					if (mem0Available && tasks.length > 0) {
						// 分析任务特征
						const urgentCount = tasks.filter(t => t.is_urgent).length
						const importantCount = tasks.filter(t => t.is_important).length
						const hasDueDates = tasks.filter(t => t.due_date).length
						
						const urgentRatio = (urgentCount / tasks.length * 100).toFixed(0)
						const importantRatio = (importantCount / tasks.length * 100).toFixed(0)
						
						// 记录显著的偏好模式
						const learnings = []
						
						// 记录任务领域和关键词
						const taskKeywords = taskDescription.split(/[,，、\s]+/).filter(w => w.length > 1).slice(0, 5).join('、')
						if (taskKeywords) {
							learnings.push(`用户规划"${taskDescription}"相关的任务，涉及${taskKeywords}`)
						}
						
						// 记录具体的任务模式 - 提取前3个任务标题作为示例
						const taskTitles = tasks.slice(0, 3).map(t => t.content || t.title).filter(Boolean)
						if (taskTitles.length > 0) {
							learnings.push(`针对"${taskDescription}"，用户通常会创建这些子任务：${taskTitles.join('、')}`)
						}
						
						// 记录优先级模式（仅当有明显偏好时）
						if (urgentCount >= tasks.length * 0.7) {
							learnings.push(`用户在处理"${taskDescription}"类任务时，倾向将大部分标记为紧急`)
						}
						
						if (importantCount >= tasks.length * 0.7) {
							learnings.push(`用户认为"${taskDescription}"相关任务通常很重要`)
						}
						
						// 记录时间规划模式
						if (hasDueDates === tasks.length && tasks.length > 1) {
							const dates = tasks.map(t => t.due_date).filter(Boolean)
							const uniqueDates = new Set(dates)
							if (uniqueDates.size > 1) {
								learnings.push(`用户习惯为"${taskDescription}"类任务设置渐进式截止日期，跨越${uniqueDates.size}天`)
							}
						}
						
						// 批量记录学习内容
						for (const learning of learnings) {
							try {
								await runtime.mem0.add(userId, learning, {
									category: 'task_planning',
									metadata: { 
										date: today,
										taskCount: tasks.length,
										taskType: taskDescription.substring(0, 50),
										urgentRatio: parseInt(urgentRatio),
										importantRatio: parseInt(importantRatio)
									}
								})
								
								runtime.logger.info('[AI Task Planner] 记录偏好', { learning })
							} catch (addError) {
								runtime.logger.warn('[AI Task Planner] 记录偏好失败', addError)
							}
						}
					}
				} catch (learnError) {
					runtime.logger.warn('[AI Task Planner] 学习模块失败（不影响任务生成）', learnError)
				}

				// 返回生成的任务（使用数据库字段名）
				return {
					status: 'success',
					tasks: tasks.map(task => ({
						content: task.content || task.title || '未命名任务',
						description: task.description || '',
						is_important: Boolean(task.is_important),
						is_urgent: Boolean(task.is_urgent),
						due_date: task.due_date || null
					}))
				}

			} catch (error) {
				runtime.logger.error('[AI Task Planner] 生成任务失败', error)
				return {
					status: 'error',
					error: error.message
				}
			}
		}
	)

	// 注册创建待办的命令
	runtime.registerCommand(
		{
			id: 'ai-task-planner.create-todos',
			title: '创建待办事项'
		},
		async (payload) => {
			try {
				const { tasks } = payload || {}
				
				if (!Array.isArray(tasks) || tasks.length === 0) {
					throw new Error('没有要创建的任务')
				}

				runtime.logger.info('[AI Task Planner] 开始创建待办', { count: tasks.length })

				const results = []
				
				// 逐个创建待办
				for (const task of tasks) {
					try {
						runtime.logger.info('[AI Task Planner] 准备创建任务', { task })
						
						// 验证必填字段
						if (!task.content && !task.title) {
							throw new Error('任务缺少内容')
						}
						
						// 使用数据库字段名（直接传递）
						const todoData = {
							content: task.content || task.title || '未命名任务',
							description: task.description || '',
							is_completed: false,
							is_important: Boolean(task.is_important),
							is_urgent: Boolean(task.is_urgent)
						}
						
						// 设置截止日期
						if (task.due_date) {
							todoData.due_date = task.due_date
						}
						
						runtime.logger.info('[AI Task Planner] 待办数据', { todoData })
						
						const todo = await runtime.todos.create(todoData)
						results.push({ success: true, todo })
					} catch (error) {
						runtime.logger.error('[AI Task Planner] 创建待办失败', { error: error.message, task })
						results.push({ success: false, error: error.message, task })
					}
				}

				const successCount = results.filter(r => r.success).length
				
				runtime.logger.info('[AI Task Planner] 创建完成', { 
					total: tasks.length, 
					success: successCount 
				})

				// 显示通知
				await runtime.notifications.show({
					title: '任务创建完成',
					body: `成功创建 ${successCount}/${tasks.length} 个待办事项`,
					type: successCount === tasks.length ? 'success' : 'warning'
				})

				return {
					status: 'success',
					results,
					summary: {
						total: tasks.length,
						success: successCount,
						failed: tasks.length - successCount
					}
				}

			} catch (error) {
				runtime.logger.error('[AI Task Planner] 创建待办失败', error)
				return {
					status: 'error',
					error: error.message
				}
			}
		}
	)

	// 注册获取现有待办的命令
	runtime.registerCommand(
		{
			id: 'ai-task-planner.get-todos',
			title: '获取待办列表'
		},
		async () => {
			try {
				const todos = await runtime.todos.list()
				runtime.logger.info('[AI Task Planner] 获取待办列表', { count: todos.length })
				
				return {
					status: 'success',
					todos
				}
			} catch (error) {
				runtime.logger.error('[AI Task Planner] 获取待办失败', error)
				return {
					status: 'error',
					error: error.message
				}
			}
		}
	)

	// ========== 新增：记忆管理命令 ==========
	
	// 获取学习记忆
	runtime.registerCommand(
		{
			id: 'ai-task-planner.get-memories',
			title: '获取学习记忆'
		},
		async () => {
			try {
				const userId = 'current_user'
				const mem0Available = await runtime.mem0.isAvailable()
				
				if (!mem0Available) {
					return {
						status: 'unavailable',
						message: 'Mem0 服务未初始化'
					}
				}
				
				const memories = await runtime.mem0.get(userId, {
					category: 'task_planning',
					limit: 50
				})
				
				const stats = await runtime.mem0.stats(userId)
				
				runtime.logger.info('[AI Task Planner] 获取记忆', { 
					count: memories.length,
					stats 
				})
				
				return {
					status: 'success',
					memories,
					stats
				}
			} catch (error) {
				runtime.logger.error('[AI Task Planner] 获取记忆失败', error)
				return {
					status: 'error',
					error: error.message
				}
			}
		}
	)

	// 清除学习记忆
	runtime.registerCommand(
		{
			id: 'ai-task-planner.clear-memories',
			title: '清除学习记忆'
		},
		async () => {
			try {
				const userId = 'current_user'
				const mem0Available = await runtime.mem0.isAvailable()
				
				if (!mem0Available) {
					return {
						status: 'unavailable',
						message: 'Mem0 服务未初始化'
					}
				}
				
				await runtime.mem0.clear(userId)
				
				runtime.logger.info('[AI Task Planner] 清除所有记忆')
				
				await runtime.notifications.show({
					title: '记忆已清除',
					body: '所有学习偏好已重置',
					type: 'success'
				})
				
				return {
					status: 'success'
				}
			} catch (error) {
				runtime.logger.error('[AI Task Planner] 清除记忆失败', error)
				return {
					status: 'error',
					error: error.message
				}
			}
		}
	)
})

runtime.onDeactivate(() => {
	runtime.logger.info('[AI Task Planner] 插件已停用')
})
