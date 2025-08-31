import React from 'react'
import {
  Box,
  IconButton,
  Tooltip,
  Divider,
  ButtonGroup
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
  Image as ImageIcon,
  Title as HeaderIcon
} from '@mui/icons-material'

const MarkdownToolbar = ({ onInsert, disabled = false }) => {
  const insertText = (before, after = '', placeholder = '') => {
    onInsert(before, after, placeholder)
  }

  const toolbarItems = [
    {
      group: 'format',
      items: [
        {
          icon: <BoldIcon />,
          tooltip: '粗体 (Ctrl+B)',
          action: () => insertText('**', '**', '粗体文本')
        },
        {
          icon: <ItalicIcon />,
          tooltip: '斜体 (Ctrl+I)',
          action: () => insertText('*', '*', '斜体文本')
        },
        {
          icon: <StrikethroughIcon />,
          tooltip: '删除线',
          action: () => insertText('~~', '~~', '删除线文本')
        },
        {
          icon: <CodeIcon />,
          tooltip: '行内代码',
          action: () => insertText('`', '`', '代码')
        }
      ]
    },
    {
      group: 'structure',
      items: [
        {
          icon: <HeaderIcon />,
          tooltip: '标题',
          action: () => insertText('# ', '', '标题')
        },
        {
          icon: <BulletListIcon />,
          tooltip: '无序列表',
          action: () => insertText('- ', '', '列表项')
        },
        {
          icon: <NumberListIcon />,
          tooltip: '有序列表',
          action: () => insertText('1. ', '', '列表项')
        },
        {
          icon: <QuoteIcon />,
          tooltip: '引用',
          action: () => insertText('> ', '', '引用内容')
        }
      ]
    },
    {
      group: 'media',
      items: [
        {
          icon: <LinkIcon />,
          tooltip: '链接',
          action: () => insertText('[', '](url)', '链接文本')
        },
        {
          icon: <ImageIcon />,
          tooltip: '图片',
          action: () => insertText('![', '](image-url)', '图片描述')
        },
        {
          icon: <TableIcon />,
          tooltip: '表格',
          action: () => insertText(
            '| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| 内容1 | 内容2 | 内容3 |\n',
            '',
            ''
          )
        }
      ]
    }
  ]

  const handleCodeBlock = () => {
    insertText('```\n', '\n```', '代码块')
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
        backgroundColor: 'background.paper',
        flexWrap: 'wrap'
      }}
    >
      {toolbarItems.map((group, groupIndex) => (
        <React.Fragment key={group.group}>
          <ButtonGroup size="small" variant="outlined">
            {group.items.map((item, itemIndex) => (
              <Tooltip key={itemIndex} title={item.tooltip}>
                <IconButton
                  size="small"
                  onClick={item.action}
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
                </IconButton>
              </Tooltip>
            ))}
          </ButtonGroup>
          {groupIndex < toolbarItems.length - 1 && (
            <Divider orientation="vertical" flexItem />
          )}
        </React.Fragment>
      ))}
      
      <Divider orientation="vertical" flexItem />
      
      {/* 代码块按钮 */}
      <Tooltip title="代码块">
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
      </Tooltip>
    </Box>
  )
}

export default MarkdownToolbar