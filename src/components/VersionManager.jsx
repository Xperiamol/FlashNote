import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Alert,
  CircularProgress,
  Tooltip,
  Menu,
  MenuItem,
  Card,
  CardContent,
  Divider
} from '@mui/material'
import {
  Backup as BackupIcon,
  Restore as RestoreIcon,
  Delete as DeleteIcon,
  MoreVert as MoreVertIcon,
  Schedule as ScheduleIcon,
  Info as InfoIcon,
  CloudDownload as CloudDownloadIcon
} from '@mui/icons-material'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale/zh-CN'

const VersionManager = ({ open, onClose }) => {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [anchorEl, setAnchorEl] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  // 加载版本列表
  const loadVersions = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await window.electronAPI.versions.getList()
      if (result.success) {
        // 数据去重，以fileName为唯一标识
        const uniqueVersions = result.data.reduce((acc, version) => {
          const existingIndex = acc.findIndex(v => v.fileName === version.fileName)
          if (existingIndex === -1) {
            acc.push(version)
          } else {
            // 如果有重复，保留版本号更高的
            if (version.version > acc[existingIndex].version) {
              acc[existingIndex] = version
            }
          }
          return acc
        }, [])
        
        // 按版本号降序排列
        uniqueVersions.sort((a, b) => b.version - a.version)
        setVersions(uniqueVersions)
      } else {
        setError(result.message)
      }
    } catch (err) {
      setError('获取版本列表失败')
      console.error('获取版本列表失败:', err)
    } finally {
      setLoading(false)
    }
  }

  // 创建手动版本
  const createManualVersion = async () => {
    if (!description.trim()) {
      setError('请输入版本描述')
      return
    }

    setActionLoading(true)
    try {
      const result = await window.electronAPI.versions.createManual(description.trim())
      if (result.success) {
        setCreateDialogOpen(false)
        setDescription('')
        setError('')
        await loadVersions()
        // 显示成功提示
      } else {
        setError(result.message)
      }
    } catch (err) {
      setError('创建版本失败')
      console.error('创建版本失败:', err)
    } finally {
      setActionLoading(false)
    }
  }

  // 恢复版本
  const restoreVersion = async (fileName) => {
    if (!window.confirm('确定要恢复到这个版本吗？当前数据将被替换。')) {
      return
    }

    setActionLoading(true)
    try {
      const result = await window.electronAPI.versions.restore(fileName)
      if (result.success) {
        setError('')
        // 显示成功提示
        // 可能需要刷新应用数据
        window.location.reload()
      } else {
        setError(result.message)
      }
    } catch (err) {
      setError('恢复版本失败')
      console.error('恢复版本失败:', err)
    } finally {
      setActionLoading(false)
      setAnchorEl(null)
    }
  }

  // 删除版本
  const deleteVersion = async (fileName) => {
    if (!window.confirm('确定要删除这个版本吗？此操作不可撤销。')) {
      return
    }

    setActionLoading(true)
    try {
      const result = await window.electronAPI.versions.delete(fileName)
      if (result.success) {
        setError('')
        await loadVersions()
      } else {
        setError(result.message)
      }
    } catch (err) {
      setError('删除版本失败')
      console.error('删除版本失败:', err)
    } finally {
      setActionLoading(false)
      setAnchorEl(null)
    }
  }

  // 格式化时间
  const formatTime = (timestamp) => {
    try {
      return formatDistanceToNow(new Date(timestamp), {
        addSuffix: true,
        locale: zhCN
      })
    } catch {
      return '未知时间'
    }
  }

  // 获取版本类型标签
  const getVersionTypeChip = (description) => {
    if (description.includes('自动备份')) {
      return <Chip label="自动" size="small" color="default" />
    } else if (description.includes('恢复前')) {
      return <Chip label="恢复前" size="small" color="warning" />
    } else {
      return <Chip label="手动" size="small" color="primary" />
    }
  }

  // 处理菜单
  const handleMenuClick = (event, version) => {
    setAnchorEl(event.currentTarget)
    setSelectedVersion(version)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
    setSelectedVersion(null)
  }

  useEffect(() => {
    if (open) {
      loadVersions()
    }
  }, [open])

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { height: '80vh' }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BackupIcon />
            版本管理
            <Chip 
              label={`${versions.length} 个版本`} 
              size="small" 
              color="primary" 
              variant="outlined" 
            />
          </Box>
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<BackupIcon />}
              onClick={() => setCreateDialogOpen(true)}
              disabled={actionLoading}
            >
              创建版本备份
            </Button>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : versions.length === 0 ? (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <CloudDownloadIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  暂无版本备份
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  创建第一个版本备份来保护你的数据
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <List>
              {versions.map((version, index) => (
                <React.Fragment key={`${version.fileName}-${index}`}>
                  <ListItem
                    sx={{
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                      mb: 1,
                      bgcolor: 'background.paper'
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          {getVersionTypeChip(version.description)}
                          <Typography variant="subtitle1" component="span">
                            版本 {version.version}
                          </Typography>
                          <Chip 
                            label={formatTime(version.timestamp)} 
                            size="small" 
                            variant="outlined"
                            icon={<ScheduleIcon />}
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            {version.description}
                          </Typography>
                          {version.metadata && (
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              <Chip 
                                label={`${version.metadata.notes_count || 0} 笔记`} 
                                size="small" 
                                variant="outlined" 
                              />
                              <Chip 
                                label={`${version.metadata.todos_count || 0} 待办`} 
                                size="small" 
                                variant="outlined" 
                              />
                              <Chip 
                                label={`${version.metadata.settings_count || 0} 设置`} 
                                size="small" 
                                variant="outlined" 
                              />
                            </Box>
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="更多操作">
                        <IconButton
                          onClick={(e) => handleMenuClick(e, version)}
                          disabled={actionLoading}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                  {index < versions.length - 1 && <Divider sx={{ my: 1 }} />}
                </React.Fragment>
              ))}
            </List>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 创建版本对话框 */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>创建版本备份</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="版本描述"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="输入版本描述..."
            margin="normal"
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>取消</Button>
          <Button
            onClick={createManualVersion}
            variant="contained"
            disabled={actionLoading || !description.trim()}
            startIcon={actionLoading ? <CircularProgress size={20} /> : <BackupIcon />}
          >
            创建备份
          </Button>
        </DialogActions>
      </Dialog>

      {/* 操作菜单 */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: (theme) => ({
            backdropFilter: theme?.custom?.glass?.backdropFilter || 'blur(6px)',
            backgroundColor: theme?.custom?.glass?.background || (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.4)'),
            border: theme?.custom?.glass?.border || `1px solid ${theme.palette.divider}`,
            borderRadius: 1
          })
        }}
      >
        <MenuItem
          onClick={() => restoreVersion(selectedVersion?.fileName)}
          disabled={actionLoading}
        >
          <RestoreIcon sx={{ mr: 1 }} />
          恢复到此版本
        </MenuItem>
        <MenuItem
          onClick={() => deleteVersion(selectedVersion?.fileName)}
          disabled={actionLoading}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} />
          删除版本
        </MenuItem>
      </Menu>
    </>
  )
}

export default VersionManager