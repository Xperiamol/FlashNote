import React, { useEffect, useImperativeHandle } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import { Box } from '@mui/material'

const WYSIWYGEditor = React.forwardRef(({ content, onChange, placeholder = '开始输入...' }, ref) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: {
          depth: 10, // 撤销历史深度
          newGroupDelay: 500, // 新操作组延迟(ms)
        },
        heading: {
          levels: [1, 2, 3, 4, 5, 6]
        }
      }),
      Placeholder.configure({
        placeholder
      }),
      Highlight.configure({
        multicolor: false
      })
    ],
    content,
    onUpdate: ({ editor }) => {
      // 保存 HTML 格式的内容
      const html = editor.getHTML()
      onChange(html)
    },
    editorProps: {
      attributes: {
        class: 'wysiwyg-editor-content'
      }
    }
  })

  // 处理键盘事件，确保撤销/重做工作
  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        editor?.chain().focus().undo().run()
      } else if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        editor?.chain().focus().redo().run()
      }
    }
  }

  // 暴露 editor 实例给父组件
  useImperativeHandle(ref, () => ({
    getEditor: () => editor
  }))

  if (!editor) {
    return null
  }

  return (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        p: 2,
          '& .ProseMirror': {
            outline: 'none',
            minHeight: '100%',
            fontFamily: '"OPPOSans R", "OPPOSans", system-ui, -apple-system, sans-serif',
            '& > * + *': {
              marginTop: '0.75em'
            },
            '& h1': {
              fontSize: '2rem',
              fontWeight: 600,
              lineHeight: 1.3
            },
            '& h2': {
              fontSize: '1.5rem',
              fontWeight: 600,
              lineHeight: 1.3
            },
            '& h3': {
              fontSize: '1.25rem',
              fontWeight: 600,
              lineHeight: 1.3
            },
            '& p': {
              lineHeight: 1.6
            },
            '& ul, & ol': {
              paddingLeft: '1.5rem'
            },
            '& code': {
              backgroundColor: 'action.hover',
              padding: '0.2em 0.4em',
              borderRadius: '3px',
              fontSize: '0.9em',
              fontFamily: 'monospace'
            },
            '& pre': {
              backgroundColor: 'action.hover',
              padding: '1rem',
              borderRadius: '4px',
              overflow: 'auto',
              '& code': {
                backgroundColor: 'transparent',
                padding: 0
              }
            },
            '& blockquote': {
              borderLeft: '3px solid',
              borderColor: 'primary.main',
              paddingLeft: '1rem',
              marginLeft: 0,
              fontStyle: 'italic'
            },
            '& mark': {
              backgroundColor: '#fef08a',
              padding: '0.1em 0.2em',
              borderRadius: '2px'
            }
          }
        }}
    >
      <EditorContent 
        editor={editor} 
        onKeyDown={handleKeyDown}
      />
    </Box>
  )
})

WYSIWYGEditor.displayName = 'WYSIWYGEditor'

export default WYSIWYGEditor
