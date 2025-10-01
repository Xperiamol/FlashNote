import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
	Box,
	Typography,
	Stack,
	TextField,
	InputAdornment,
	IconButton,
	Tooltip,
	Card,
	CardContent,
	CardActions,
	Button,
	Chip,
	Divider,
	LinearProgress,
	Snackbar,
	Alert,
	Drawer,
	List,
	ListItem,
	ListItemText,
	Avatar
} from '@mui/material'
import {
	Search as SearchIcon,
	RefreshRounded,
	CloudDownloadRounded,
	DeleteRounded,
	PowerSettingsNewRounded,
	RocketLaunchRounded,
	CheckCircleOutline,
	ErrorOutline
} from '@mui/icons-material'

import {
	fetchAvailablePlugins,
	fetchInstalledPlugins,
	installPlugin,
	uninstallPlugin,
	enablePlugin,
	disablePlugin,
	executePluginCommand,
	subscribePluginEvents,
	subscribePluginUiRequests
} from '../api/pluginAPI'
import { useStore } from '../store/useStore'

const getDisplayCategories = (plugin) => {
	if (!plugin) return []
	const categories = plugin.categories || []
	if (Array.isArray(categories)) return categories
	return typeof categories === 'string' ? [categories] : []
}

const formatPermissions = (permissions) => {
	if (!permissions) return []
	if (Array.isArray(permissions)) return permissions
	return Object.entries(permissions)
		.filter(([, value]) => Boolean(value))
		.map(([key]) => key)
}

const defaultPluginIcon = (name = '') => {
	const initials = name.trim().slice(0, 2).toUpperCase() || 'P'
	return (
		<Avatar sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}>
			{initials}
		</Avatar>
	)
}

const filterPlugins = (plugins, { search, category }) => {
	if (!Array.isArray(plugins) || plugins.length === 0) return []

	return plugins.filter((plugin) => {
		const matchesCategory =
			!category || category === 'all' || getDisplayCategories(plugin).some((item) => item === category)

		if (!matchesCategory) return false

		if (!search) return true

		const keywords = `${plugin.name || ''} ${plugin.description || ''} ${plugin.author?.name || ''}`.toLowerCase()
		return keywords.includes(search.toLowerCase())
	})
}

const PluginCard = ({
	plugin,
	isInstalled,
	isEnabled,
	hasUpdate,
	pendingAction,
	onInstall,
	onEnableToggle,
	onUninstall,
	onSelect,
	compact
}) => {
	if (!plugin) return null

	const categories = getDisplayCategories(plugin)
	const description = plugin.shortDescription || plugin.description || '暂未提供描述'

	return (
		<Card
			variant="outlined"
			sx={{
				position: 'relative',
				borderRadius: 2,
				height: '100%',
				'&:hover': {
					borderColor: 'primary.main',
					boxShadow: 3,
					cursor: 'pointer'
				}
			}}
			onClick={() => onSelect(plugin.id)}
		>
			<CardContent sx={{ pb: 1.5 }}>
				<Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
					{plugin.icon ? (
						<Avatar src={plugin.icon} alt={plugin.name} sx={{ width: 48, height: 48 }} />
					) : (
						defaultPluginIcon(plugin.name)
					)}
					<Box sx={{ flexGrow: 1 }}>
						<Typography variant="h6" component="div" sx={{ lineHeight: 1.2 }}>
							{plugin.name}
						</Typography>
						<Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
							<Typography variant="body2" color="text.secondary">
								v{plugin.version}
							</Typography>
							{plugin.author?.name && (
								<Chip
									size="small"
									label={plugin.author.name}
									variant="outlined"
									sx={{ borderRadius: 1 }}
								/>
							)}
						</Stack>
					</Box>
					{isInstalled ? (
						<Chip
							size="small"
							color={isEnabled ? 'success' : 'default'}
							icon={isEnabled ? <CheckCircleOutline /> : <PowerSettingsNewRounded fontSize="small" />}
							label={isEnabled ? '已启用' : '已安装'}
						/>
					) : (
						<Chip size="small" color="primary" variant="outlined" label="未安装" />
					)}
				</Stack>

				<Typography variant="body2" color="text.secondary" sx={{ minHeight: compact ? 'auto' : 48 }}>
					{description}
				</Typography>

				<Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 0.5 }}>
					{categories.slice(0, 3).map((category) => (
						<Chip key={category} size="small" label={category} variant="outlined" />
					))}
					{categories.length > 3 && (
						<Chip size="small" label={`+${categories.length - 3}`} variant="outlined" />
					)}
					{hasUpdate && (
						<Chip size="small" color="warning" label="可更新" />
					)}
				</Stack>
			</CardContent>

			<Divider sx={{ mx: 2 }} />

			<CardActions sx={{ justifyContent: 'space-between', px: 2, py: 1.5 }}>
				<Button
					size="small"
					color="primary"
					startIcon={<RocketLaunchRounded />}
					onClick={(event) => {
						event.stopPropagation()
						onSelect(plugin.id)
					}}
				>
					详情
				</Button>

				<Stack direction="row" spacing={1}>
					{!isInstalled && (
						<Button
							size="small"
							variant="contained"
							startIcon={<CloudDownloadRounded />}
							disabled={Boolean(pendingAction)}
							onClick={(event) => {
								event.stopPropagation()
								onInstall(plugin.id)
							}}
						>
							安装
						</Button>
					)}

					{isInstalled && (
						<Tooltip title={isEnabled ? '禁用插件' : '启用插件'}>
							<span>
								<Button
									size="small"
									variant={isEnabled ? 'outlined' : 'contained'}
									color={isEnabled ? 'warning' : 'primary'}
									disabled={Boolean(pendingAction)}
									startIcon={<PowerSettingsNewRounded />}
									onClick={(event) => {
										event.stopPropagation()
										onEnableToggle(plugin.id, !isEnabled)
									}}
								>
									{isEnabled ? '禁用' : '启用'}
								</Button>
							</span>
						</Tooltip>
					)}

					{isInstalled && (
						<Tooltip title="卸载插件">
							<span>
								<IconButton
									size="small"
									color="error"
									disabled={Boolean(pendingAction)}
									onClick={(event) => {
										event.stopPropagation()
										onUninstall(plugin.id)
									}}
								>
									<DeleteRounded fontSize="small" />
								</IconButton>
							</span>
						</Tooltip>
					)}
				</Stack>
			</CardActions>

			{pendingAction && <LinearProgress sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} />}
		</Card>
	)
}

const permissionDescriptions = {
	'notes:read': '读取你的笔记列表与基础元数据',
	'notes:write': '创建或更新笔记内容',
	'ui:open-note': '请求宿主应用打开指定笔记',
	'settings:read': '读取基础设置用于适配展示',
	'notifications:show': '通过宿主通知中心展示提示',
	'storage:read': '访问插件私有存储中的数据',
	'storage:write': '写入或删除插件私有存储数据'
}

const PluginDetailDrawer = ({
	plugin,
	open,
	onClose,
	onInstall,
	onEnableToggle,
	onUninstall,
	pendingAction,
	onExecuteCommand,
	commandPending
}) => {
	if (!plugin) return null

	const permissions = formatPermissions(plugin.permissions)
	const categories = getDisplayCategories(plugin)
	const commands = Array.isArray(plugin.commands) ? plugin.commands : []

	return (
		<Drawer anchor="right" open={open} onClose={onClose} sx={{ '& .MuiDrawer-paper': { width: 400, p: 3 } }}>
			<Stack spacing={2}>
				<Stack direction="row" spacing={2} alignItems="center">
					{plugin.icon ? (
						<Avatar src={plugin.icon} alt={plugin.name} sx={{ width: 56, height: 56 }} />
					) : (
						defaultPluginIcon(plugin.name)
					)}
					<Box>
						<Typography variant="h5" sx={{ lineHeight: 1.2 }}>
							{plugin.name}
						</Typography>
						<Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
							<Chip size="small" label={`版本 ${plugin.version}`} />
							{plugin.manifest?.minAppVersion && (
								<Chip size="small" variant="outlined" label={`最低版本 ${plugin.manifest.minAppVersion}`} />
							)}
						</Stack>
					</Box>
				</Stack>

				<Typography variant="body1" color="text.secondary">
					{plugin.description || plugin.shortDescription || '暂无详细描述'}
				</Typography>

				<Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
					{categories.map((category) => (
						<Chip key={category} label={category} variant="outlined" />
					))}
				</Stack>

				<Divider />

				<Stack direction="row" spacing={1}>
					<Button
						variant="contained"
						startIcon={<CloudDownloadRounded />}
						disabled={pendingAction === 'install'}
						onClick={() => onInstall(plugin.id)}
					>
						{plugin.installed ? '重新安装' : '安装插件'}
					</Button>
					<Button
						variant={plugin.enabled ? 'outlined' : 'contained'}
						color={plugin.enabled ? 'warning' : 'primary'}
						startIcon={<PowerSettingsNewRounded />}
						disabled={pendingAction === 'toggle'}
						onClick={() => onEnableToggle(plugin.id, !plugin.enabled)}
					>
						{plugin.enabled ? '禁用' : '启用'}
					</Button>
					{plugin.installed && (
						<Button
							color="error"
							variant="text"
							startIcon={<DeleteRounded />}
							disabled={pendingAction === 'uninstall'}
							onClick={() => onUninstall(plugin.id)}
						>
							卸载
						</Button>
					)}
				</Stack>

				{permissions.length > 0 && (
					<Box>
						<Typography variant="subtitle1" sx={{ mb: 1 }}>
							权限需求
						</Typography>
						<List dense>
							{permissions.map((permission) => (
								<ListItem key={permission} disableGutters>
									<ListItemText
										primary={permission}
										primaryTypographyProps={{ variant: 'body2' }}
										secondary={permissionDescriptions[permission] || '自定义权限'}
									/>
								</ListItem>
							))}
						</List>
					</Box>
				)}

				{commands.length > 0 && (
					<Box>
						<Typography variant="subtitle1" sx={{ mb: 1 }}>
							可用命令
						</Typography>
						<Stack spacing={1}>
							{commands.map((command) => (
								<Card key={command.id} variant="outlined">
									<CardContent sx={{ pb: 1 }}>
										<Typography variant="subtitle2">{command.title || command.id}</Typography>
										{command.description && (
											<Typography variant="body2" color="text.secondary">
												{command.description}
											</Typography>
										)}
									</CardContent>
									<CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
										<Button
											size="small"
											variant="contained"
											startIcon={<RocketLaunchRounded />}
											disabled={commandPending === command.id}
											onClick={() => onExecuteCommand(plugin.id, command.id)}
										>
											运行
										</Button>
									</CardActions>
								</Card>
							))}
						</Stack>
					</Box>
				)}

				{plugin.lastError && (
					<Alert severity="error" icon={<ErrorOutline />}>
						{plugin.lastError}
					</Alert>
				)}
			</Stack>
		</Drawer>
	)
}

const PluginStore = () => {
	const pluginStoreFilters = useStore((state) => state.pluginStoreFilters)
	const setPluginStoreSearch = useStore((state) => state.setPluginStoreSearch)
	const pluginStoreSelectedPluginId = useStore((state) => state.pluginStoreSelectedPluginId)
	const setPluginStoreSelectedPluginId = useStore((state) => state.setPluginStoreSelectedPluginId)
	const setPluginStoreCategories = useStore((state) => state.setPluginStoreCategories)

	const [availablePlugins, setAvailablePlugins] = useState([])
	const [installedPlugins, setInstalledPlugins] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)
	const [pendingActions, setPendingActions] = useState({})
	const [snackbar, setSnackbar] = useState({ open: false, severity: 'success', message: '' })
	const [commandPending, setCommandPending] = useState(null)

	const showMessage = useCallback((severity, message) => {
		setSnackbar({ open: true, severity, message })
	}, [])

	const closeSnackbar = () => setSnackbar((prev) => ({ ...prev, open: false }))

	const synchronizeCategories = useCallback((plugins) => {
		const categorySet = new Set()
		plugins.forEach((plugin) => {
			getDisplayCategories(plugin).forEach((category) => categorySet.add(category))
		})
		const normalized = Array.from(categorySet).map((category) => ({ id: category, name: category }))
		setPluginStoreCategories(normalized)
	}, [setPluginStoreCategories])

	const fetchData = useCallback(async () => {
		setLoading(true)
		setError(null)
		try {
			const [available, installed] = await Promise.all([
				fetchAvailablePlugins(),
				fetchInstalledPlugins()
			])

			setAvailablePlugins(Array.isArray(available) ? available : [])
			setInstalledPlugins(Array.isArray(installed) ? installed : [])
			synchronizeCategories(Array.isArray(available) ? available : [])
		} catch (err) {
			console.error('加载插件数据失败', err)
			setError(err?.message || '加载插件数据失败')
		} finally {
			setLoading(false)
		}
	}, [synchronizeCategories])

	useEffect(() => {
		fetchData()
	}, [fetchData])

	const updateAvailable = useCallback((updater) => {
		setAvailablePlugins((prev) => {
			const next = updater(prev)
			synchronizeCategories(next)
			return next
		})
	}, [synchronizeCategories])

	useEffect(() => {
		const unsubscribe = subscribePluginEvents((event) => {
			if (!event || !event.pluginId) return

			updateAvailable((prev) => {
				return prev.map((item) => {
					if (item.id !== event.pluginId) return item

					if (event.type === 'uninstalled') {
						return {
							...item,
							installed: false,
							enabled: false,
							installedVersion: null,
							lastError: event.error || null
						}
					}

					if (event.plugin) {
						return {
							...item,
							installed: true,
							enabled: event.plugin.enabled,
							installedVersion: event.plugin.installedVersion,
							lastError: event.plugin.lastError || null,
							commands: event.plugin.commands || item.commands
						}
					}

					if (event.type === 'command-registered' && event.command) {
						const commands = Array.isArray(item.commands) ? item.commands : []
						if (commands.some((cmd) => cmd.id === event.command.id)) return item
						return {
							...item,
							commands: [...commands, event.command]
						}
					}

					if (event.type === 'command-unregistered' && event.commandId) {
						const commands = Array.isArray(item.commands) ? item.commands.filter((cmd) => cmd.id !== event.commandId) : []
						return {
							...item,
							commands
						}
					}

					return item
				})
			})

			setInstalledPlugins((prev) => {
				switch (event.type) {
					case 'installed':
					case 'ready':
					case 'enabled':
					case 'disabled':
					case 'error':
						if (event.plugin) {
							const exists = prev.some((plugin) => plugin.id === event.pluginId)
							if (exists) {
								return prev.map((plugin) => plugin.id === event.pluginId ? event.plugin : plugin)
							}
							return [...prev, event.plugin]
						}
						return prev
					case 'uninstalled':
						return prev.filter((plugin) => plugin.id !== event.pluginId)
					case 'command-registered':
						return prev.map((plugin) => {
							if (plugin.id !== event.pluginId) return plugin
							const commands = Array.isArray(plugin.commands) ? plugin.commands : []
							if (commands.some((cmd) => cmd.id === event.command.id)) return plugin
							return {
								...plugin,
								commands: [...commands, event.command]
							}
						})
					case 'command-unregistered':
						return prev.map((plugin) => {
							if (plugin.id !== event.pluginId) return plugin
							return {
								...plugin,
								commands: Array.isArray(plugin.commands)
									? plugin.commands.filter((cmd) => cmd.id !== event.commandId)
									: []
							}
						})
					default:
						return prev
				}
			})
		})

		const detachUi = subscribePluginUiRequests((payload) => {
			if (!payload?.noteId) return
			showMessage('info', `插件请求打开笔记 ${payload.noteId}`)
		})

		return () => {
			unsubscribe && unsubscribe()
			detachUi && detachUi()
		}
	}, [showMessage, updateAvailable])

	const withPendingAction = useCallback(async (pluginId, actionKey, runner, successMessage) => {
		setPendingActions((prev) => ({ ...prev, [pluginId]: actionKey }))
		try {
			const result = await runner()
			if (result && result.success === false && result.error) {
				throw new Error(result.error)
			}
			if (successMessage) {
				showMessage('success', successMessage)
			}
			await fetchData()
			return result
		} catch (err) {
			console.error(`执行插件操作失败: ${pluginId}`, err)
			showMessage('error', err?.message || '操作失败')
			throw err
		} finally {
			setPendingActions((prev) => {
				const next = { ...prev }
				delete next[pluginId]
				return next
			})
		}
	}, [fetchData, showMessage])

	const handleInstall = useCallback((pluginId) => {
		return withPendingAction(pluginId, 'install', () => installPlugin(pluginId), '插件安装成功')
	}, [withPendingAction])

	const handleUninstall = useCallback((pluginId) => {
		return withPendingAction(pluginId, 'uninstall', () => uninstallPlugin(pluginId), '插件已卸载')
	}, [withPendingAction])

	const handleEnableToggle = useCallback((pluginId, enable) => {
		const runner = enable ? () => enablePlugin(pluginId) : () => disablePlugin(pluginId)
		const message = enable ? '插件已启用' : '插件已禁用'
		return withPendingAction(pluginId, 'toggle', runner, message)
	}, [withPendingAction])

	const handleExecuteCommand = useCallback(async (pluginId, commandId) => {
		setCommandPending(commandId)
		try {
			const result = await executePluginCommand(pluginId, commandId)
			if (result?.success === false) {
				throw new Error(result.error || '命令执行失败')
			}
			showMessage('success', '命令已执行')
		} catch (err) {
			console.error('执行插件命令失败', err)
			showMessage('error', err?.message || '执行命令失败')
		} finally {
			setCommandPending(null)
		}
	}, [showMessage])

	const filteredAvailable = useMemo(() => {
		if (pluginStoreFilters.tab !== 'market') return []
		return filterPlugins(availablePlugins, pluginStoreFilters)
	}, [availablePlugins, pluginStoreFilters])

	const filteredInstalled = useMemo(() => {
		if (pluginStoreFilters.tab !== 'installed') return []
		return filterPlugins(installedPlugins, pluginStoreFilters)
	}, [installedPlugins, pluginStoreFilters])

	const selectedPlugin = useMemo(() => {
		if (!pluginStoreSelectedPluginId) return null
		return (
			installedPlugins.find((plugin) => plugin.id === pluginStoreSelectedPluginId) ||
			availablePlugins.find((plugin) => plugin.id === pluginStoreSelectedPluginId) ||
			null
		)
	}, [pluginStoreSelectedPluginId, installedPlugins, availablePlugins])

	const pendingActionFor = (pluginId) => pendingActions[pluginId] || null

	const handleSearchChange = (event) => {
		setPluginStoreSearch(event.target.value)
	}

	const handleSelectPlugin = (pluginId) => {
		setPluginStoreSelectedPluginId(pluginId)
	}

	const handleRefresh = () => {
		fetchData()
		showMessage('info', '插件列表已刷新')
	}

	const renderEmptyState = (message) => (
		<Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
			<Typography variant="body1">{message}</Typography>
		</Box>
	)

	const renderLocalDev = () => (
		<Box sx={{ py: 6, px: 2 }}>
			<Typography variant="h6" sx={{ mb: 2 }}>
				本地开发模式
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				将你的插件放置在 <code>plugins/examples</code> 或 <code>plugins/local</code> 目录，然后点击“刷新”加载。
			</Typography>
			<List dense>
				<ListItem>
					<ListItemText primary="1. 在 plugins/examples 下创建插件目录" />
				</ListItem>
				<ListItem>
					<ListItemText primary="2. 编写 manifest.json 和 index.js" />
				</ListItem>
				<ListItem>
					<ListItemText primary="3. 点击右上角刷新按钮或重新安装插件" />
				</ListItem>
			</List>
			<Button
				variant="outlined"
				sx={{ mt: 2 }}
				onClick={() => handleRefresh()}
				startIcon={<RefreshRounded />}
			>
				刷新本地插件
			</Button>
		</Box>
	)

	const pluginsToRender = pluginStoreFilters.tab === 'market' ? filteredAvailable : filteredInstalled

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
			<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 3 }}>
				<TextField
					placeholder="搜索插件"
					size="small"
					value={pluginStoreFilters.search}
					onChange={handleSearchChange}
					fullWidth
					InputProps={{
						startAdornment: (
							<InputAdornment position="start">
								<SearchIcon fontSize="small" />
							</InputAdornment>
						)
					}}
				/>
				<Tooltip title="刷新插件列表">
					<span>
						<IconButton color="primary" size="small" onClick={handleRefresh} disabled={loading}>
							<RefreshRounded />
						</IconButton>
					</span>
				</Tooltip>
			</Stack>

			{loading && <LinearProgress sx={{ mb: 2 }} />}
			{error && (
				<Alert severity="error" sx={{ mb: 2 }}>
					{error}
				</Alert>
			)}

			<Box sx={{ flex: 1, overflow: 'auto', pb: 4 }}>
				{pluginStoreFilters.tab === 'local' && renderLocalDev()}

				{pluginStoreFilters.tab !== 'local' && pluginsToRender.length === 0 && !loading &&
					renderEmptyState('暂无插件匹配当前筛选条件')}

				{pluginStoreFilters.tab !== 'local' && pluginsToRender.length > 0 && (
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
							gap: 2
						}}
					>
						{pluginsToRender.map((plugin) => (
							<PluginCard
								key={plugin.id}
								plugin={plugin}
								isInstalled={plugin.installed || installedPlugins.some((item) => item.id === plugin.id)}
								isEnabled={plugin.enabled}
								hasUpdate={plugin.hasUpdate}
								pendingAction={pendingActionFor(plugin.id)}
								onInstall={handleInstall}
								onEnableToggle={handleEnableToggle}
								onUninstall={handleUninstall}
								onSelect={handleSelectPlugin}
								compact={false}
							/>
						))}
					</Box>
				)}
			</Box>

			<PluginDetailDrawer
				plugin={selectedPlugin}
				open={Boolean(selectedPlugin)}
				onClose={() => setPluginStoreSelectedPluginId(null)}
				onInstall={handleInstall}
				onEnableToggle={handleEnableToggle}
				onUninstall={handleUninstall}
				pendingAction={selectedPlugin ? pendingActionFor(selectedPlugin.id) : null}
				onExecuteCommand={handleExecuteCommand}
				commandPending={commandPending}
			/>

			<Snackbar
				open={snackbar.open}
				autoHideDuration={3000}
				onClose={closeSnackbar}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
			>
				<Alert onClose={closeSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
					{snackbar.message}
				</Alert>
			</Snackbar>
		</Box>
	)
}

export default PluginStore
