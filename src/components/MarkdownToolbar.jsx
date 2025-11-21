import React from 'react'
import {
  Box,
  IconButton,
  Tooltip,
  Divider,
  ButtonGroup,
  ToggleButton,
  ToggleButtonGroup,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from '@mui/material'
import {
  FormatBold as BoldIcon,
  FormatItalic as ItalicIcon,
  FormatUnderlined as UnderlineIcon,
  FormatStrikethrough as StrikethroughIcon,
  Code as CodeIcon,
  Link as LinkIcon,
  FormatListBulleted as BulletListIcon,
  FormatListNumbered as NumberListIcon,
  FormatQuote as QuoteIcon,
  TableChart as TableIcon,
  Title as HeaderIcon,
  Edit as EditIcon,
  Visibility as PreviewIcon,
  ViewColumn as SplitViewIcon,
  Highlight as HighlightIcon,
  Palette as ColorIcon,
  Info as CalloutIcon,
  Tag as TagIcon,
  ViewModule as ContainerIcon,
  ArrowDropDown as DropdownIcon
} from '@mui/icons-material'
import ImageUploadButton from './ImageUploadButton'

const MarkdownToolbar = ({ onInsert, disabled = false, viewMode, onViewModeChange, editor = null, editorMode = 'markdown' }) => {
  const [calloutAnchor, setCalloutAnchor] = React.useState(null)
  const [containerAnchor, setContainerAnchor] = React.useState(null)
  const [colorAnchor, setColorAnchor] = React.useState(null)

  const insertText = (before, after = '', placeholder = '') => {
    if (editorMode === 'wysiwyg' && editor) {
      // WYSIWYG 模式下使用 TipTap 命令
      handleWYSIWYGInsert(before, after, placeholder)
    } else {
      // Markdown 模式下使用原有的插入方法
      onInsert(before, after, placeholder)
    }
  }

  const handleWYSIWYGInsert = (before, after, placeholder) => {
    if (!editor) return

    // 根据 Markdown 语法转换为 TipTap 命令
    if (before === '**' && after === '**') {
      editor.chain().focus().toggleBold().run()
    } else if (before === '*' && after === '*') {
      editor.chain().focus().toggleItalic().run()
    } else if (before === '~~' && after === '~~') {
      editor.chain().focus().toggleStrike().run()
    } else if (before === '`' && after === '`') {
      editor.chain().focus().toggleCode().run()
    } else if (before.startsWith('# ')) {
      const level = before.trim().split('#').length - 1
      editor.chain().focus().setHeading({ level }).run()
    } else if (before === '- ') {
      editor.chain().focus().toggleBulletList().run()
    } else if (before === '1. ') {
      editor.chain().focus().toggleOrderedList().run()
    } else if (before === '> ') {
      editor.chain().focus().toggleBlockquote().run()
    } else if (before === '==' && after === '==') {
      editor.chain().focus().toggleHighlight().run()
    } else if (before.startsWith('```')) {
      editor.chain().focus().toggleCodeBlock().run()
    } else {
      // 其他情况：插入文本
      const text = placeholder || '文本'
      editor.chain().focus().insertContent(before + text + after).run()
    }
  }

  // Callout 类型
  const calloutTypes = [
    { type: 'note', label: '笔记', icon: '📝' },
    { type: 'tip', label: '提示', icon: '💡' },
    { type: 'info', label: '信息', icon: 'ℹ️' },
    { type: 'warning', label: '警告', icon: '⚠️' },
    { type: 'danger', label: '危险', icon: '🚫' },
    { type: 'success', label: '成功', icon: '✅' },
    { type: 'question', label: '问题', icon: '❓' },
    { type: 'quote', label: '引用', icon: '💬' }
  ]

  // 容器类型
  const containerTypes = [
    { type: 'tip', label: '提示', icon: '💡' },
    { type: 'warning', label: '警告', icon: '⚠️' },
    { type: 'danger', label: '危险', icon: '🚫' },
    { type: 'info', label: '信息', icon: 'ℹ️' },
    { type: 'details', label: '详情（可折叠）', icon: '📋' }
  ]

  // 预定义颜色
  const colors = [
    { name: 'red', label: '红色', color: '#ef4444' },
    { name: 'orange', label: '橙色', color: '#f97316' },
    { name: 'yellow', label: '黄色', color: '#eab308' },
    { name: 'green', label: '绿色', color: '#22c55e' },
    { name: 'blue', label: '蓝色', color: '#3b82f6' },
    { name: 'purple', label: '紫色', color: '#a855f7' },
    { name: 'pink', label: '粉色', color: '#ec4899' }
  ]

  const toolbarItems = [
    {
      group: 'format',
      items: [
        {
          icon: <BoldIcon />,
          tooltip: '粗体 (Ctrl+B)',
          action: () => insertText('**', '**', '粗体文本'),
          supportedInWysiwyg: true
        },
        {
          icon: <ItalicIcon />,
          tooltip: '斜体 (Ctrl+I)',
          action: () => insertText('*', '*', '斜体文本'),
          supportedInWysiwyg: true
        },
        {
          icon: <StrikethroughIcon />,
          tooltip: '删除线',
          action: () => insertText('~~', '~~', '删除线文本'),
          supportedInWysiwyg: true
        },
        {
          icon: <CodeIcon />,
          tooltip: '行内代码',
          action: () => insertText('`', '`', '代码'),
          supportedInWysiwyg: true
        }
      ].filter(item => editorMode !== 'wysiwyg' || item.supportedInWysiwyg)
    },
    {
      group: 'structure',
      items: [
        {
          icon: <HeaderIcon />,
          tooltip: '标题',
          action: () => insertText('# ', '', '标题'),
          supportedInWysiwyg: true
        },
        {
          icon: <BulletListIcon />,
          tooltip: '无序列表',
          action: () => insertText('- ', '', '列表项'),
          supportedInWysiwyg: true
        },
        {
          icon: <NumberListIcon />,
          tooltip: '有序列表',
          action: () => insertText('1. ', '', '列表项'),
          supportedInWysiwyg: true
        },
        {
          icon: <QuoteIcon />,
          tooltip: '引用',
          action: () => insertText('> ', '', '引用内容'),
          supportedInWysiwyg: true
        }
      ].filter(item => editorMode !== 'wysiwyg' || item.supportedInWysiwyg)
    },
    {
      group: 'media',
      items: [
        {
          icon: <LinkIcon />,
          tooltip: '链接',
          action: () => insertText('[', '](url)', '链接文本'),
          supportedInWysiwyg: false
        },
        {
          icon: <TableIcon />,
          tooltip: '表格',
          action: () => insertText(
            '| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| 内容1 | 内容2 | 内容3 |\n',
            '',
            ''
          ),
          supportedInWysiwyg: false
        }
      ].filter(item => editorMode !== 'wysiwyg' || item.supportedInWysiwyg)
    },
    {
      group: 'extensions',
      items: [
        {
          icon: <HighlightIcon />,
          tooltip: '高亮文本',
          action: () => insertText('==', '==', '高亮文本'),
          supportedInWysiwyg: true
        },
        {
          icon: <ColorIcon />,
          tooltip: '彩色文本',
          action: (e) => setColorAnchor(e.currentTarget),
          hasMenu: true,
          supportedInWysiwyg: false
        },
        {
          icon: <CalloutIcon />,
          tooltip: 'Callout',
          action: (e) => setCalloutAnchor(e.currentTarget),
          hasMenu: true,
          supportedInWysiwyg: false
        },
        {
          icon: <TagIcon />,
          tooltip: '标签',
          action: () => insertText('#', '', '标签名'),
          supportedInWysiwyg: false
        },
        {
          icon: <ContainerIcon />,
          tooltip: '自定义容器',
          action: (e) => setContainerAnchor(e.currentTarget),
          hasMenu: true,
          supportedInWysiwyg: false
        }
      ].filter(item => editorMode !== 'wysiwyg' || item.supportedInWysiwyg)
    }
  ].filter(group => group.items.length > 0)

  const handleCodeBlock = () => {
    insertText('```\n', '\n```', '代码块')
  }

  const handleCalloutSelect = (type) => {
    insertText(`> [!${type}] `, '\n> ', '内容')
    setCalloutAnchor(null)
  }

  const handleContainerSelect = (type) => {
    insertText(`:::${type} `, '\n', '内容\n:::')
    setContainerAnchor(null)
  }

  const handleColorSelect = (colorName) => {
    insertText(`@${colorName}{`, '}', '文本')
    setColorAnchor(null)
  }

  const handleWikiLink = () => {
    insertText('[[', ']]', '笔记标题')
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1,
        borderBottom: 1,
        borderColor: 'divider',
        backgroundColor: (theme) => theme.palette.mode === 'dark'
          ? 'rgba(30, 41, 59, 0.6)'
          : 'rgba(255, 255, 255, 0.6)',
        backdropFilter: 'blur(30px) saturate(180%)',
        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        flexWrap: 'wrap'
      }}
    >
      {toolbarItems.map((group, groupIndex) => (
        <React.Fragment key={group.group}>
          <ButtonGroup size="small" variant="outlined">
            {group.items.map((item, itemIndex) => (
              <Tooltip key={itemIndex} title={item.tooltip}>
                <span>
                  <IconButton
                    size="small"
                    onClick={item.hasMenu ? item.action : item.action}
                    disabled={disabled}
                    sx={{
                      border: 'none',
                      borderRadius: 1,
                      '&:hover': {
                        backgroundColor: 'action.hover'
                      }
                    }}
                  >
                    {item.icon}
                    {item.hasMenu && <DropdownIcon sx={{ fontSize: 12, ml: -0.5 }} />}
                  </IconButton>
                </span>
              </Tooltip>
            ))}
          </ButtonGroup>
          {groupIndex < toolbarItems.length - 1 && (
            <Divider orientation="vertical" flexItem />
          )}
        </React.Fragment>
      ))}

      <Divider orientation="vertical" flexItem />

      {/* Wiki 链接按钮 - 仅在 Markdown 模式下显示 */}
      {editorMode !== 'wysiwyg' && (
        <>
          <Tooltip title="Wiki 链接 [[Note]]">
            <span>
              <IconButton
                size="small"
                onClick={handleWikiLink}
                disabled={disabled}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  '&:hover': {
                    backgroundColor: 'action.hover'
                  }
                }}
              >
                <LinkIcon sx={{ fontSize: 18 }} />
                <LinkIcon sx={{ fontSize: 18, ml: -1.2 }} />
              </IconButton>
            </span>
          </Tooltip>

          <Divider orientation="vertical" flexItem />
        </>
      )}

      {/* 图片上传按钮 */}
      <ImageUploadButton
        onImageInsert={onInsert}
        disabled={disabled}
      />

      <Divider orientation="vertical" flexItem />

      {/* 代码块按钮 */}
      <Tooltip title="代码块">
        <span>
          <IconButton
            size="small"
            onClick={handleCodeBlock}
            disabled={disabled}
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              '&:hover': {
                backgroundColor: 'action.hover'
              }
            }}
          >
            <CodeIcon />
          </IconButton>
        </span>
      </Tooltip>

      {/* Callout 菜单 - 仅在 Markdown 模式下显示 */}
      {editorMode !== 'wysiwyg' && (
        <Menu
          anchorEl={calloutAnchor}
          open={Boolean(calloutAnchor)}
          onClose={() => setCalloutAnchor(null)}
        >
          {calloutTypes.map((callout) => (
            <MenuItem key={callout.type} onClick={() => handleCalloutSelect(callout.type)}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <span style={{ fontSize: '1.2rem' }}>{callout.icon}</span>
              </ListItemIcon>
              <ListItemText primary={callout.label} secondary={`> [!${callout.type}]`} />
            </MenuItem>
          ))}
        </Menu>
      )}

      {/* 容器菜单 - 仅在 Markdown 模式下显示 */}
      {editorMode !== 'wysiwyg' && (
        <Menu
          anchorEl={containerAnchor}
          open={Boolean(containerAnchor)}
          onClose={() => setContainerAnchor(null)}
        >
          {containerTypes.map((container) => (
            <MenuItem key={container.type} onClick={() => handleContainerSelect(container.type)}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <span style={{ fontSize: '1.2rem' }}>{container.icon}</span>
              </ListItemIcon>
              <ListItemText primary={container.label} secondary={`:::${container.type}`} />
            </MenuItem>
          ))}
        </Menu>
      )}

      {/* 颜色菜单 - 仅在 Markdown 模式下显示 */}
      {editorMode !== 'wysiwyg' && (
        <Menu
          anchorEl={colorAnchor}
          open={Boolean(colorAnchor)}
          onClose={() => setColorAnchor(null)}
        >
          {colors.map((color) => (
            <MenuItem key={color.name} onClick={() => handleColorSelect(color.name)}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <Box
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    backgroundColor: color.color,
                    border: '1px solid',
                    borderColor: 'divider'
                  }}
                />
              </ListItemIcon>
              <ListItemText primary={color.label} secondary={`@${color.name}{文本}`} />
            </MenuItem>
          ))}
        </Menu>
      )}

      {/* 编辑/预览模式切换 */}
      {viewMode && onViewModeChange && (
        <React.Fragment>
          <Divider orientation="vertical" flexItem />

          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(event, newMode) => {
              if (newMode !== null) {
                onViewModeChange(newMode)
              }
            }}
            size="small"
          >
            <ToggleButton value="edit">
              <Tooltip title="编辑模式" placement="bottom">
                <EditIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="preview">
              <Tooltip title="预览模式" placement="bottom">
                <PreviewIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="split">
              <Tooltip title="分屏模式" placement="bottom">
                <SplitViewIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </React.Fragment>
      )}
    </Box>
  )
}

export default MarkdownToolbar
