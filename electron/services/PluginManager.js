const path = require('path')
const fs = require('fs')
const fsp = require('fs/promises')
const { EventEmitter } = require('events')
const { Worker } = require('worker_threads')
const crypto = require('crypto')

const ALLOWED_PERMISSIONS = new Set([
	'notes:read',
	'notes:write',
	'ui:open-note',
	'settings:read',
	'notifications:show',
	'storage:read',
	'storage:write'
])

const STATE_VERSION = 1
const DEFAULT_REGISTRY_RELATIVE_PATH = ['..', '..', 'plugins', 'registry.json']
const STORE_EVENT_CHANNEL = 'plugin-store:event'

const compareVersions = (a, b) => {
	const normalize = (v) =>
		String(v || '0')
			.split('.')
			.map((chunk) => Number(chunk) || 0)

	const left = normalize(a)
	const right = normalize(b)
	const length = Math.max(left.length, right.length)

	for (let i = 0; i < length; i += 1) {
		const diff = (left[i] || 0) - (right[i] || 0)
		if (diff !== 0) return diff > 0 ? 1 : -1
	}
	return 0
}

class PluginManager extends EventEmitter {
	constructor(options = {}) {
		super()

		this.app = options.app
		this.services = options.services || {}
		this.shortcutService = options.shortcutService || this.services.shortcutService || null
		this.windowAccessor = options.windowAccessor || (() => [])
		this.logger = options.logger || console
		this.isPackaged = options.isPackaged ?? (this.app ? this.app.isPackaged : false)

		this.pluginsDir = options.pluginsDir || this.resolvePluginsDir()
		this.storageDir = path.join(this.pluginsDir, 'storage')
		this.stateFile = path.join(this.pluginsDir, 'plugins-state.json')
		this.registryPath = options.registryPath || this.resolveRegistryPath()

		this.installedPlugins = new Map() // pluginId -> { manifest, path }
		this.pluginStates = new Map() // pluginId -> state
		this.pluginWorkers = new Map() // pluginId -> Worker
		this.commandRegistry = new Map() // commandId -> { pluginId, definition }
		this.pendingCommandRequests = new Map() // `${pluginId}:${requestId}` -> { resolve, reject }
	}

	resolvePluginsDir() {
		if (this.app && typeof this.app.getPath === 'function') {
			return path.join(this.app.getPath('userData'), 'plugins')
		}
		return path.resolve(process.cwd(), '.flashnote', 'plugins')
	}

	resolveRegistryPath() {
		const devCandidate = path.resolve(__dirname, ...DEFAULT_REGISTRY_RELATIVE_PATH)
		if (fs.existsSync(devCandidate)) {
			return devCandidate
		}

		if (this.app && this.app.isPackaged) {
			const packaged = path.join(process.resourcesPath, 'plugins', 'registry.json')
			if (fs.existsSync(packaged)) {
				return packaged
			}
		}

		return devCandidate
	}

	async initialize() {
		await this.ensureDir(this.pluginsDir)
		await this.ensureDir(this.storageDir)
		if (this.shortcutService && typeof this.shortcutService.loadPluginShortcutSettings === 'function') {
			try {
				await this.shortcutService.loadPluginShortcutSettings()
			} catch (error) {
				this.logger.error('[PluginManager] 初始化插件快捷键配置失败:', error)
			}
		}
		await this.loadState()
		await this.loadInstalledPlugins()
	}

	async ensureDir(target) {
		await fsp.mkdir(target, { recursive: true })
	}

	async pathExists(targetPath) {
		try {
			await fsp.access(targetPath)
			return true
		} catch (error) {
			return false
		}
	}

	async loadState() {
		try {
			const raw = await fsp.readFile(this.stateFile, 'utf8')
			const parsed = JSON.parse(raw)
			if (parsed?.version === STATE_VERSION && parsed?.plugins) {
				Object.entries(parsed.plugins).forEach(([pluginId, state]) => {
					this.pluginStates.set(pluginId, {
						enabled: Boolean(state.enabled),
						installedVersion: state.installedVersion || null,
						installedAt: state.installedAt || null,
						permissions: this.normalizePermissions(state.permissions),
						lastError: state.lastError || null,
						runtimeStatus: 'stopped'
					})
				})
			}
		} catch (error) {
			if (error.code !== 'ENOENT') {
				this.logger.error('[PluginManager] 加载插件状态失败:', error)
			}
			await this.saveState()
		}
	}

	async saveState() {
		const payload = {
			version: STATE_VERSION,
			plugins: {}
		}

		for (const [pluginId, state] of this.pluginStates.entries()) {
			payload.plugins[pluginId] = {
				enabled: Boolean(state.enabled),
				installedVersion: state.installedVersion || null,
				installedAt: state.installedAt || null,
				permissions: state.permissions || this.normalizePermissions(),
				lastError: state.lastError || null
			}
		}

		await fsp.writeFile(this.stateFile, JSON.stringify(payload, null, 2), 'utf8')
	}

	normalizePermissions(permissions = {}) {
		const normalized = {}

		if (Array.isArray(permissions)) {
			permissions.forEach((permission) => {
				if (ALLOWED_PERMISSIONS.has(permission)) {
					normalized[permission] = true
				}
			})
		} else if (permissions && typeof permissions === 'object') {
			Object.entries(permissions).forEach(([key, value]) => {
				if (ALLOWED_PERMISSIONS.has(key)) {
					normalized[key] = Boolean(value)
				}
			})
		}

		ALLOWED_PERMISSIONS.forEach((permission) => {
			if (!(permission in normalized)) {
				normalized[permission] = false
			}
		})

		return normalized
	}

	validateManifest(manifest) {
		if (!manifest || typeof manifest !== 'object') {
			throw new Error('插件 manifest 无效')
		}

		const requiredFields = ['id', 'name', 'version', 'entry']
		requiredFields.forEach((field) => {
			if (!manifest[field]) {
				throw new Error(`插件 manifest 缺少必填字段: ${field}`)
			}
		})

		if (manifest.permissions) {
			const normalized = this.normalizePermissions(manifest.permissions)
			const invalid = Object.keys(normalized).filter((perm) => !ALLOWED_PERMISSIONS.has(perm))
			if (invalid.length > 0) {
				throw new Error(`插件 manifest 请求了不被支持的权限: ${invalid.join(', ')}`)
			}
			manifest.permissions = normalized
		} else {
			manifest.permissions = this.normalizePermissions()
		}

		if (!manifest.runtime) {
			manifest.runtime = { type: 'worker', timeout: 15000 }
		}

		return manifest
	}

	async loadInstalledPlugins() {
		const entries = await fsp.readdir(this.pluginsDir, { withFileTypes: true })
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name === 'storage') continue

			const pluginPath = path.join(this.pluginsDir, entry.name)
			const manifest = await this.readManifestFromPath(pluginPath)
			if (!manifest) continue

			this.validateManifest(manifest)

			this.installedPlugins.set(manifest.id, {
				manifest,
				path: pluginPath
			})

			if (!this.pluginStates.has(manifest.id)) {
				this.pluginStates.set(manifest.id, {
					enabled: false,
					installedVersion: manifest.version,
					installedAt: new Date().toISOString(),
					permissions: this.normalizePermissions(manifest.permissions),
					lastError: null,
					runtimeStatus: 'stopped'
				})
			}

			const state = this.pluginStates.get(manifest.id)
			state.installedVersion = manifest.version

			if (state.enabled) {
				try {
					await this.startPlugin(manifest.id)
				} catch (error) {
					this.logger.error(`[PluginManager] 启动插件 ${manifest.id} 失败:`, error)
					state.runtimeStatus = 'error'
					state.lastError = error.message
				}
			}
		}

		await this.saveState()
	}

	async listInstalledPlugins() {
		const list = []
		for (const [pluginId] of this.installedPlugins.entries()) {
			list.push(this.getPluginStateSnapshot(pluginId))
		}
		return list.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name, 'zh-CN'))
	}

	async listAvailablePlugins() {
		const registry = await this.readRegistryFile()

		return registry.map((item) => {
			const installed = this.installedPlugins.get(item.id)
			const state = installed ? this.pluginStates.get(item.id) : null
			const versionDiff = installed ? compareVersions(item.version, state?.installedVersion) : 0

			return {
				...item,
				installed: Boolean(installed),
				enabled: Boolean(state?.enabled),
				installedVersion: state?.installedVersion || null,
				hasUpdate: versionDiff > 0,
				commands: this.getCommandsForPlugin(item.id)
			}
		})
	}

	getCommandsForPlugin(pluginId) {
		const commands = []
		for (const entry of this.commandRegistry.values()) {
			if (entry.pluginId === pluginId) {
				commands.push(entry.definition)
			}
		}
		return commands
	}

	getPluginStateSnapshot(pluginId) {
		const record = this.installedPlugins.get(pluginId)
		const state = this.pluginStates.get(pluginId)
		if (!record || !state) return null

		return {
			id: pluginId,
			manifest: record.manifest,
			enabled: Boolean(state.enabled),
			installedVersion: state.installedVersion,
			installedAt: state.installedAt,
			lastError: state.lastError,
			runtimeStatus: state.runtimeStatus || 'stopped',
			commands: this.getCommandsForPlugin(pluginId),
			permissions: state.permissions
		}
	}

	async getPluginDetails(pluginId) {
		return this.getPluginStateSnapshot(pluginId)
	}

	async readRegistryFile() {
		try {
			const raw = await fsp.readFile(this.registryPath, 'utf8')
			const data = JSON.parse(raw)
			return Array.isArray(data) ? data : []
		} catch (error) {
			this.logger.error('[PluginManager] 无法读取插件仓库配置:', error)
			return []
		}
	}

	async findRegistryEntry(pluginId) {
		const registry = await this.readRegistryFile()
		return registry.find((item) => item.id === pluginId) || null
	}

	resolveRegistrySourcePath(entry) {
		if (!entry?.source) {
			throw new Error('插件仓库条目缺少 source 字段')
		}

		if (entry.source.type === 'directory') {
			const relativePath = entry.source.path
			if (!relativePath) {
				throw new Error('插件仓库条目缺少 source.path')
			}

			if (path.isAbsolute(relativePath)) {
				return relativePath
			}

			const baseDir = this.isPackaged
				? process.resourcesPath
				: path.resolve(__dirname, '..', '..')

			return path.join(baseDir, relativePath)
		}

		throw new Error(`不支持的插件 source 类型: ${entry.source.type}`)
	}

	async readManifestFromPath(basePath) {
		try {
			const manifestPath = path.join(basePath, 'manifest.json')
			const raw = await fsp.readFile(manifestPath, 'utf8')
			const manifest = JSON.parse(raw)
			return manifest
		} catch (error) {
			this.logger.error('[PluginManager] 读取 manifest 失败:', error)
			return null
		}
	}

	createDefaultState(manifest, overrides = {}) {
		return {
			enabled: false,
			installedVersion: manifest.version,
			installedAt: new Date().toISOString(),
			permissions: this.normalizePermissions(manifest.permissions),
			lastError: null,
			runtimeStatus: 'stopped',
			...overrides
		}
	}

	async installPlugin(pluginId) {
		const registryEntry = await this.findRegistryEntry(pluginId)
		if (!registryEntry) {
			throw new Error(`插件 ${pluginId} 不在插件仓库中`)
		}

		const sourcePath = this.resolveRegistrySourcePath(registryEntry)
		const sourceManifest = await this.readManifestFromPath(sourcePath)

		if (!sourceManifest) {
			throw new Error('插件源缺少 manifest.json')
		}

		if (sourceManifest.id !== pluginId) {
			throw new Error(`插件源 manifest (${sourceManifest.id}) 与仓库 ID (${pluginId}) 不一致`)
		}

		this.validateManifest(sourceManifest)

		const destinationPath = path.join(this.pluginsDir, pluginId)
		if (await this.pathExists(destinationPath)) {
			await fsp.rm(destinationPath, { recursive: true, force: true })
		}

		await this.ensureDir(this.pluginsDir)
		await fsp.cp(sourcePath, destinationPath, { recursive: true })

		const manifest = await this.readManifestFromPath(destinationPath)
		this.validateManifest(manifest)

		this.installedPlugins.set(pluginId, {
			manifest,
			path: destinationPath
		})

		const state = this.createDefaultState(manifest, {
			enabled: registryEntry.autoEnable ?? true,
			installedAt: new Date().toISOString()
		})

		this.pluginStates.set(pluginId, state)
		await this.saveState()

		const snapshot = this.getPluginStateSnapshot(pluginId)
		this.emitStoreEvent({ type: 'installed', pluginId, plugin: snapshot, manifest })

		if (state.enabled) {
			try {
				await this.startPlugin(pluginId)
			} catch (error) {
				state.enabled = false
				state.runtimeStatus = 'error'
				state.lastError = error.message
				await this.saveState()
				this.emitStoreEvent({
					type: 'error',
					pluginId,
					error: error.message,
					plugin: this.getPluginStateSnapshot(pluginId)
				})
				throw error
			}
		}

		return snapshot
	}

	async uninstallPlugin(pluginId) {
		await this.disablePlugin(pluginId)

		const pluginRecord = this.installedPlugins.get(pluginId)
		if (!pluginRecord) {
			throw new Error(`插件 ${pluginId} 未安装`)
		}

		await fsp.rm(pluginRecord.path, { recursive: true, force: true })

		this.installedPlugins.delete(pluginId)
		this.pluginStates.delete(pluginId)

		const storagePath = path.join(this.storageDir, `${pluginId}.json`)
		if (await this.pathExists(storagePath)) {
			await fsp.rm(storagePath, { force: true })
		}

		for (const [commandId, record] of this.commandRegistry.entries()) {
			if (record.pluginId === pluginId) {
				this.commandRegistry.delete(commandId)
			}
		}

		if (this.shortcutService && typeof this.shortcutService.removePluginCommands === 'function') {
			try {
				await this.shortcutService.removePluginCommands(pluginId)
			} catch (error) {
				this.logger.error(`[PluginManager] 卸载插件时移除快捷键失败 (${pluginId}):`, error)
			}
		}

		await this.saveState()

		this.emitStoreEvent({ type: 'uninstalled', pluginId })

		return true
	}

	async enablePlugin(pluginId) {
		const state = this.pluginStates.get(pluginId)
		if (!state) {
			throw new Error(`插件 ${pluginId} 未安装`) 
		}

		if (state.enabled) {
			return this.getPluginStateSnapshot(pluginId)
		}

		state.enabled = true
		state.lastError = null
		await this.saveState()

		await this.startPlugin(pluginId)
		const snapshot = this.getPluginStateSnapshot(pluginId)
		this.emitStoreEvent({ type: 'enabled', pluginId, plugin: snapshot })
		return snapshot
	}

	async disablePlugin(pluginId) {
		const state = this.pluginStates.get(pluginId)
		if (!state) {
			return true
		}

		if (!state.enabled && !this.pluginWorkers.has(pluginId)) {
			return true
		}

		state.enabled = false
		await this.stopPlugin(pluginId)
		await this.saveState()

		const snapshot = this.getPluginStateSnapshot(pluginId)
		this.emitStoreEvent({ type: 'disabled', pluginId, plugin: snapshot })
		return snapshot
	}

	async startPlugin(pluginId) {
		const record = this.installedPlugins.get(pluginId)
		const state = this.pluginStates.get(pluginId)

		if (!record || !state) {
			throw new Error(`插件 ${pluginId} 未安装或状态缺失`)
		}

		if (this.pluginWorkers.has(pluginId)) {
			return
		}

		const worker = new Worker(path.join(__dirname, 'pluginWorker.js'), {
			workerData: {
				pluginId,
				pluginPath: record.path,
				manifest: record.manifest,
				permissions: state.permissions,
				storagePath: path.join(this.storageDir, `${pluginId}.json`),
				timeout: record.manifest.runtime?.timeout || 15000
			}
		})

		state.runtimeStatus = 'starting'
		this.pluginWorkers.set(pluginId, worker)

		worker.on('message', (message) => this.handleWorkerMessage(pluginId, message))
		worker.on('error', (error) => this.handleWorkerError(pluginId, error))
		worker.on('exit', (code) => this.handleWorkerExit(pluginId, code))
	}

	async stopPlugin(pluginId) {
		const worker = this.pluginWorkers.get(pluginId)
		if (!worker) {
			const state = this.pluginStates.get(pluginId)
			if (state) {
				state.runtimeStatus = 'stopped'
			}
			return
		}

		await new Promise((resolve) => {
			const timeout = setTimeout(() => {
				worker.terminate().finally(resolve)
			}, 3000)

			worker.once('exit', () => {
				clearTimeout(timeout)
				resolve()
			})

			worker.postMessage({ type: 'shutdown' })
		})

		this.pluginWorkers.delete(pluginId)

		const commandsToRemove = []
		for (const [commandId, record] of this.commandRegistry.entries()) {
			if (record.pluginId === pluginId) {
				commandsToRemove.push(commandId)
			}
		}

		for (const commandId of commandsToRemove) {
			await this.unregisterCommand(pluginId, commandId)
		}

		if (this.shortcutService && typeof this.shortcutService.disablePluginCommands === 'function') {
			try {
				await this.shortcutService.disablePluginCommands(pluginId)
			} catch (error) {
				this.logger.error(`[PluginManager] 停止插件时清理快捷键失败 (${pluginId}):`, error)
			}
		}

		const state = this.pluginStates.get(pluginId)
		if (state) {
			state.runtimeStatus = 'stopped'
		}
	}

	handleWorkerMessage(pluginId, message) {
		if (!message || typeof message !== 'object') return

		switch (message.type) {
			case 'ready': {
				const state = this.pluginStates.get(pluginId)
				if (state) {
					state.runtimeStatus = 'ready'
					state.lastError = null
				}
				this.emitStoreEvent({ type: 'ready', pluginId, plugin: this.getPluginStateSnapshot(pluginId) })
				break
			}
			case 'log': {
				this.loggerLog(pluginId, message)
				break
			}
			case 'register-command': {
				this.registerCommand(pluginId, message.command).catch((error) => {
					this.logger.error(`[PluginManager] 注册命令失败 (${pluginId}:${message.command?.id}):`, error)
				})
				break
			}
			case 'unregister-command': {
				this.unregisterCommand(pluginId, message.commandId).catch((error) => {
					this.logger.error(`[PluginManager] 注销命令失败 (${pluginId}:${message.commandId}):`, error)
				})
				break
			}
			case 'invoke-command-result': {
				this.resolveCommandRequest(pluginId, message)
				break
			}
			case 'rpc': {
				this.handleRpc(pluginId, message)
				break
			}
			case 'fatal': {
				const error = new Error(message.error || '插件运行时发生未知错误')
				this.handleWorkerError(pluginId, error)
				break
			}
			default:
				this.logger.warn(`[PluginManager] 未处理的插件消息 (${pluginId}):`, message)
		}
	}

	loggerLog(pluginId, message) {
		const level = message.level || 'info'
		const payload = Array.isArray(message.args) ? message.args : [message.message]
		const prefix = `[Plugin:${pluginId}]`

		if (typeof this.logger[level] === 'function') {
			this.logger[level](prefix, ...payload)
		} else {
			this.logger.log(prefix, ...payload)
		}
	}

	resolveCommandRequest(pluginId, message) {
		const key = `${pluginId}:${message.requestId}`
		const pending = this.pendingCommandRequests.get(key)
		if (!pending) {
			return
		}

		this.pendingCommandRequests.delete(key)
		if (message.success) {
			pending.resolve(message.result)
		} else {
			pending.reject(new Error(message.error || '插件命令执行失败'))
		}
	}

	async handleRpc(pluginId, message) {
		const worker = this.pluginWorkers.get(pluginId)
		if (!worker) return

		const { requestId, scope, action, payload } = message

		const respond = (response) => {
			worker.postMessage({
				type: 'rpc-response',
				requestId,
				...response
			})
		}

		try {
			let result
			switch (scope) {
				case 'notes': {
					if (action === 'getRandom') {
						this.assertPermission(pluginId, 'notes:read')
						const response = await this.services.noteService.getRandomNote({ includeDeleted: false })
						if (!response.success) {
							throw new Error(response.error || '获取随机笔记失败')
						}
						result = response.data ? this.sanitizeNote(response.data) : null
					} else if (action === 'list') {
						this.assertPermission(pluginId, 'notes:read')
						const response = await this.services.noteService.getNotes(payload || {})
						if (!response.success) {
							throw new Error(response.error || '获取笔记列表失败')
						}
						const notes = Array.isArray(response.data?.notes) ? response.data.notes.map((note) => this.sanitizeNote(note)) : []
						result = {
							notes,
							pagination: response.data?.pagination || null
						}
					} else {
						throw new Error(`未知的笔记 RPC 动作: ${action}`)
					}
					break
				}
				case 'ui': {
					if (action === 'openNote') {
						this.assertPermission(pluginId, 'ui:open-note')
						if (!payload?.noteId) {
							throw new Error('缺少 noteId')
						}
						this.broadcast('plugin:ui-open-note', { pluginId, noteId: payload.noteId })
						result = { acknowledged: true }
					} else {
						throw new Error(`未知的 UI RPC 动作: ${action}`)
					}
					break
				}
				case 'storage': {
					if (action === 'getItem') {
						this.assertPermission(pluginId, 'storage:read')
					} else if (['setItem', 'removeItem', 'clear'].includes(action)) {
						this.assertPermission(pluginId, 'storage:write')
					}
					result = await this.handleStorageRpc(pluginId, action, payload)
					break
				}
				case 'notifications': {
					if (action === 'show') {
						this.assertPermission(pluginId, 'notifications:show')
						this.broadcast('plugin:notification', { pluginId, payload })
						result = { acknowledged: true }
					} else {
						throw new Error(`未知的通知 RPC 动作: ${action}`)
					}
					break
				}
				default:
					throw new Error(`未知的 RPC scope: ${scope}`)
			}

			respond({ success: true, result })
		} catch (error) {
			this.logger.error(`[PluginManager] 处理 RPC 失败 (${pluginId}):`, error)
			respond({ success: false, error: error.message })
		}
	}

	sanitizeNote(note) {
		if (!note || typeof note !== 'object') return null
		const { id, title, tags, updated_at, created_at, category } = note
		return {
			id,
			title,
			tags,
			updated_at,
			created_at,
			category
		}
	}

	assertPermission(pluginId, permission) {
		const state = this.pluginStates.get(pluginId)
		if (!state || !state.permissions?.[permission]) {
			throw new Error(`插件 ${pluginId} 没有权限: ${permission}`)
		}
	}

	async handleStorageRpc(pluginId, action, payload = {}) {
		const storage = await this.loadPluginStorage(pluginId)

		switch (action) {
			case 'getItem':
				return storage[payload.key] ?? null
			case 'setItem':
				storage[payload.key] = payload.value
				await this.savePluginStorage(pluginId, storage)
				return true
			case 'removeItem':
				delete storage[payload.key]
				await this.savePluginStorage(pluginId, storage)
				return true
			case 'clear':
				await this.savePluginStorage(pluginId, {})
				return true
			default:
				throw new Error(`未知的存储动作: ${action}`)
		}
	}

	async loadPluginStorage(pluginId) {
		const storagePath = path.join(this.storageDir, `${pluginId}.json`)
		try {
			const raw = await fsp.readFile(storagePath, 'utf8')
			const data = JSON.parse(raw)
			return data && typeof data === 'object' ? data : {}
		} catch (error) {
			if (error.code !== 'ENOENT') {
				this.logger.warn(`[PluginManager] 读取插件存储失败 (${pluginId}):`, error)
			}
			return {}
		}
	}

	async savePluginStorage(pluginId, data) {
		const storagePath = path.join(this.storageDir, `${pluginId}.json`)
		await fsp.writeFile(storagePath, JSON.stringify(data, null, 2), 'utf8')
	}

	async registerCommand(pluginId, command) {
		if (!command || !command.id) {
			return
		}

		let binding = null
		const pluginRecord = this.installedPlugins.get(pluginId)
		const pluginName = pluginRecord?.manifest?.name || pluginId

		if (this.shortcutService && typeof this.shortcutService.registerPluginCommand === 'function') {
			try {
				binding = await this.shortcutService.registerPluginCommand(pluginId, {
					...command,
					pluginName
				})
			} catch (error) {
				this.logger.error(`[PluginManager] 注册插件快捷键失败 (${pluginId}:${command.id}):`, error)
			}
		}

		const definition = {
			...command,
			shortcutBinding: binding
		}

		this.commandRegistry.set(command.id, { pluginId, definition })
		this.emitStoreEvent({
			type: 'command-registered',
			pluginId,
			command: definition,
			plugin: this.getPluginStateSnapshot(pluginId)
		})
	}

	async unregisterCommand(pluginId, commandId) {
		if (!commandId) return
		const existing = this.commandRegistry.get(commandId)
		if (existing && existing.pluginId === pluginId) {
			this.commandRegistry.delete(commandId)

			if (this.shortcutService && typeof this.shortcutService.unregisterPluginCommand === 'function') {
				try {
					await this.shortcutService.unregisterPluginCommand(pluginId, commandId)
				} catch (error) {
					this.logger.error(`[PluginManager] 注销插件快捷键失败 (${pluginId}:${commandId}):`, error)
				}
			}

			this.emitStoreEvent({
				type: 'command-unregistered',
				pluginId,
				commandId,
				plugin: this.getPluginStateSnapshot(pluginId)
			})
		}
	}

	async executeCommand(pluginId, commandId, payload) {
		if (!this.pluginWorkers.has(pluginId)) {
			throw new Error('插件未运行或已禁用')
		}
		const worker = this.pluginWorkers.get(pluginId)
			const requestId = typeof crypto.randomUUID === 'function'
				? crypto.randomUUID()
				: `${Date.now()}-${Math.random().toString(16).slice(2)}`

		return new Promise((resolve, reject) => {
			const key = `${pluginId}:${requestId}`

			const timeout = setTimeout(() => {
				if (this.pendingCommandRequests.has(key)) {
					this.pendingCommandRequests.delete(key)
					reject(new Error('插件命令执行超时'))
				}
			}, 15000)

			const safeResolve = (value) => {
				clearTimeout(timeout)
				resolve(value)
			}

			const safeReject = (error) => {
				clearTimeout(timeout)
				reject(error)
			}

			this.pendingCommandRequests.set(key, { resolve: safeResolve, reject: safeReject })

			worker.postMessage({
				type: 'invoke-command',
				requestId,
				commandId,
				payload
			})
		})
	}

	emitStoreEvent(event) {
		this.emit('store-event', event)
		this.broadcast(STORE_EVENT_CHANNEL, event)
	}

	broadcast(channel, payload) {
		const windows = []
		try {
			const result = this.windowAccessor?.()
			if (Array.isArray(result)) {
				windows.push(...result)
			} else if (result) {
				windows.push(result)
			}
		} catch (error) {
			this.logger.error('[PluginManager] 获取窗口列表失败:', error)
		}

		windows.forEach((win) => {
			try {
				if (win && !win.isDestroyed()) {
					win.webContents.send(channel, payload)
				}
			} catch (error) {
				this.logger.error('[PluginManager] 广播插件事件失败:', error)
			}
		})
	}

	handleWorkerError(pluginId, error) {
		this.logger.error(`[PluginManager] 插件线程错误 (${pluginId}):`, error)

		const state = this.pluginStates.get(pluginId)
		if (state) {
			state.runtimeStatus = 'error'
			state.lastError = error.message
		}

		this.emitStoreEvent({ type: 'error', pluginId, error: error.message, plugin: this.getPluginStateSnapshot(pluginId) })
		this.stopPlugin(pluginId).catch((stopError) => {
			this.logger.error(`[PluginManager] 停止插件 ${pluginId} 时发生错误:`, stopError)
		})
	}

	handleWorkerExit(pluginId, code) {
		this.pluginWorkers.delete(pluginId)

		const state = this.pluginStates.get(pluginId)
		if (state) {
			state.runtimeStatus = 'stopped'
		}

		if (code !== 0 && (state?.enabled || state?.lastError)) {
			this.logger.warn(`[PluginManager] 插件 ${pluginId} 线程异常退出，代码: ${code}`)
			this.emitStoreEvent({ type: 'exit', pluginId, code })
		} else {
			this.emitStoreEvent({ type: 'stopped', pluginId })
		}
	}
}

module.exports = PluginManager
