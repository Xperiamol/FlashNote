import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Divider,
  Alert,
  Tab,
  Tabs,
  TextField
} from '@mui/material';
import {
  CompareArrows as CompareIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material';

/**
 * 冲突解决对话框
 * 显示冲突的详细信息并允许用户选择解决方案
 */
const ConflictResolutionDialog = ({ open, conflict, onResolve, onClose }) => {
  const [selectedVersion, setSelectedVersion] = useState('merged'); // 'local', 'remote', 'merged', 'custom'
  const [customContent, setCustomContent] = useState('');
  const [currentTab, setCurrentTab] = useState(0);

  if (!conflict) return null;

  const { entityType, entityId, local, remote, conflicts, merged } = conflict;

  const handleResolve = () => {
    let resolvedData;
    
    switch (selectedVersion) {
      case 'local':
        resolvedData = local;
        break;
      case 'remote':
        resolvedData = remote;
        break;
      case 'custom':
        resolvedData = { ...merged, content: customContent };
        break;
      case 'merged':
      default:
        resolvedData = merged;
        break;
    }

    onResolve(entityType, entityId, resolvedData);
    onClose();
  };

  const renderField = (label, localValue, remoteValue) => {
    const isDifferent = localValue !== remoteValue;
    
    return (
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          {label}
          {isDifferent && (
            <Chip
              label="冲突"
              size="small"
              color="warning"
              sx={{ ml: 1 }}
            />
          )}
        </Typography>
        
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <Card variant="outlined" sx={{ 
            bgcolor: selectedVersion === 'local' ? 'action.selected' : 'background.paper' 
          }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                本地版本
              </Typography>
              <Typography variant="body2">
                {localValue || <em>空</em>}
              </Typography>
            </CardContent>
          </Card>
          
          <Card variant="outlined" sx={{ 
            bgcolor: selectedVersion === 'remote' ? 'action.selected' : 'background.paper' 
          }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                远程版本
              </Typography>
              <Typography variant="body2">
                {remoteValue || <em>空</em>}
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CompareIcon />
          <Typography variant="h6">
            解决同步冲突
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          检测到 {entityType === 'note' ? '笔记' : '待办事项'} 的同步冲突。
          本地和远程版本都有修改，请选择保留哪个版本。
        </Alert>

        <Typography variant="caption" color="text.secondary" gutterBottom>
          {entityType === 'note' ? '笔记' : '待办事项'} ID: {entityId}
        </Typography>

        <Tabs value={currentTab} onChange={(e, v) => setCurrentTab(v)} sx={{ mb: 2 }}>
          <Tab label="对比视图" />
          <Tab label="自动合并结果" />
        </Tabs>

        {currentTab === 0 && (
          <Box>
            {renderField('标题', local?.title, remote?.title)}
            {renderField('内容', local?.content, remote?.content)}
            {renderField('标签', local?.tags, remote?.tags)}
            {renderField('更新时间', 
              local?.updated_at ? new Date(local.updated_at).toLocaleString('zh-CN') : '',
              remote?.updated_at ? new Date(remote.updated_at).toLocaleString('zh-CN') : ''
            )}
          </Box>
        )}

        {currentTab === 1 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              系统已自动合并两个版本，以下是合并结果。你可以选择使用此结果或自定义内容。
            </Alert>
            
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" gutterBottom>
                  自动合并结果
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Typography variant="body2" gutterBottom>
                  <strong>标题:</strong> {merged?.title || <em>无</em>}
                </Typography>
                <Typography variant="body2" gutterBottom>
                  <strong>内容:</strong> {merged?.content || <em>无</em>}
                </Typography>
                <Typography variant="body2">
                  <strong>标签:</strong> {merged?.tags || <em>无</em>}
                </Typography>
              </CardContent>
            </Card>

            {conflicts && conflicts.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  自动合并无法完全解决以下字段:
                </Typography>
                {conflicts.map((c, i) => (
                  <Chip
                    key={i}
                    label={c.field}
                    size="small"
                    sx={{ mr: 0.5, mb: 0.5 }}
                  />
                ))}
              </Alert>
            )}
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" gutterBottom>
          选择解决方案:
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Button
            variant={selectedVersion === 'local' ? 'contained' : 'outlined'}
            onClick={() => setSelectedVersion('local')}
            startIcon={selectedVersion === 'local' && <CheckIcon />}
          >
            使用本地版本
          </Button>
          <Button
            variant={selectedVersion === 'remote' ? 'contained' : 'outlined'}
            onClick={() => setSelectedVersion('remote')}
            startIcon={selectedVersion === 'remote' && <CheckIcon />}
          >
            使用远程版本
          </Button>
          <Button
            variant={selectedVersion === 'merged' ? 'contained' : 'outlined'}
            onClick={() => setSelectedVersion('merged')}
            startIcon={selectedVersion === 'merged' && <CheckIcon />}
          >
            使用自动合并
          </Button>
        </Box>

        {selectedVersion === 'custom' && (
          <TextField
            fullWidth
            multiline
            rows={6}
            label="自定义内容"
            value={customContent}
            onChange={(e) => setCustomContent(e.target.value)}
            placeholder="输入自定义内容..."
          />
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleResolve}
          disabled={selectedVersion === 'custom' && !customContent}
        >
          解决冲突
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConflictResolutionDialog;
