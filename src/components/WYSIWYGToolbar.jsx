import React from 'react'
import { Box, IconButton, Tooltip, ButtonGroup } from '@mui/material'
import {
  FormatBold,
  FormatItalic,
  FormatStrikethrough,
  Code,
  FormatListBulleted,
  FormatListNumbered,
  FormatQuote,
  Highlight
} from '@mui/icons-material'

const WYSIWYGToolbar = ({ editor }) => {
  if (!editor) return null

  const buttons = [
    {
      icon: <FormatBold />,
      tooltip: '粗体 (Ctrl+B)',
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive('bold')
    },
    {
      icon: <FormatItalic />,
      tooltip: '斜体 (Ctrl+I)',
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive('italic')
    },
    {
      icon: <FormatStrikethrough />,
      tooltip: '删除线',
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: editor.isActive('strike')
    },
    {
      icon: <Code />,
      tooltip: '代码',
      action: () => editor.chain().focus().toggleCode().run(),
      isActive: editor.isActive('code')
    },
    {
      icon: <Highlight />,
      tooltip: '高亮',
      action: () => editor.chain().focus().toggleHighlight().run(),
      isActive: editor.isActive('highlight')
    },
    {
      icon: <FormatListBulleted />,
      tooltip: '无序列表',
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: editor.isActive('bulletList')
    },
    {
      icon: <FormatListNumbered />,
      tooltip: '有序列表',
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: editor.isActive('orderedList')
    },
    {
      icon: <FormatQuote />,
      tooltip: '引用',
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: editor.isActive('blockquote')
    }
  ]

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1,
        borderBottom: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper'
      }}
    >
      <ButtonGroup size="small">
        {buttons.map((button, index) => (
          <Tooltip key={index} title={button.tooltip}>
            <IconButton
              size="small"
              onClick={button.action}
              sx={{
                backgroundColor: button.isActive ? 'action.selected' : 'transparent',
                '&:hover': {
                  backgroundColor: 'action.hover'
                }
              }}
            >
              {button.icon}
            </IconButton>
          </Tooltip>
        ))}
      </ButtonGroup>
    </Box>
  )
}

export default WYSIWYGToolbar
