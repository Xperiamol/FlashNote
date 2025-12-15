import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Alert,
  Box
} from '@mui/material'
import { Warning as WarningIcon, Info as InfoIcon } from '@mui/icons-material'

/**
 * 笔记类型转换确认对话框
 * 用于 Markdown 和白板笔记之间的类型转换确认
 */
const NoteTypeConversionDialog = ({ 
  open, 
  onClose, 
  conversionType, 
  noteTitle 
}) => {
  const isMarkdownToWhiteboard = conversionType === 'markdown-to-whiteboard'
  
  const handleConfirm = () => {
    onClose(true)
  }
  
  const handleCancel = () => {
    onClose(false)
  }
  
  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      aria-labelledby="conversion-dialog-title"
    >
      <DialogTitle id="conversion-dialog-title">
        {isMarkdownToWhiteboard 
          ? '转换为白板笔记' 
          : '转换为 Markdown 笔记'}
      </DialogTitle>
      
      <DialogContent>
        <DialogContentText gutterBottom>
          将笔记 <strong>"{noteTitle || '未命名笔记'}"</strong> 转换为{isMarkdownToWhiteboard ? '白板' : 'Markdown'}笔记：
        </DialogContentText>
        
        {isMarkdownToWhiteboard ? (
          <Alert 
            severity="info" 
            icon={<InfoIcon />}
            sx={{ mt: 2, mb: 2 }}
          >
            <Box component="ul" sx={{ margin: 0, paddingLeft: 2.5 }}>
              <li>Markdown 文本内容将自动转换为白板文本框</li>
              <li>标题将使用更大的字体显示（H1-H6）</li>
              <li>列表、代码块、引用将被智能识别</li>
              <li><strong>图片将自动转换为白板图片元素</strong></li>
              <li>原始 Markdown 内容将被白板数据替代</li>
            </Box>
          </Alert>
        ) : (
          <Alert 
            severity="info" 
            icon={<InfoIcon />}
            sx={{ mt: 2, mb: 2 }}
          >
            <Box component="ul" sx={{ margin: 0, paddingLeft: 2.5 }}>
              <li><strong>白板内容将智能转换为 Markdown</strong></li>
              <li>文本框将按位置顺序转换为段落</li>
              <li>大字体文本将自动识别为标题</li>
              <li><strong>白板图片将保存并转换为 Markdown 图片语法</strong></li>
              <li>绘图元素（线条、形状等）将被忽略</li>
            </Box>
          </Alert>
        )}
        
        <DialogContentText 
          sx={{ mt: 2 }}
          color="text.primary"
        >
          {isMarkdownToWhiteboard 
            ? '确定要继续转换吗？'
            : '确定要将白板内容转换为 Markdown 笔记吗？'
          }
        </DialogContentText>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button 
          onClick={handleCancel} 
          color="inherit"
        >
          取消
        </Button>
        <Button 
          onClick={handleConfirm} 
          color="primary"
          variant="contained"
        >
          确认转换
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default NoteTypeConversionDialog