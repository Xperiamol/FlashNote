import React, { useState, useEffect } from 'react'
import { Box, Typography } from '@mui/material'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import { imageAPI } from '../api/imageAPI'
import 'highlight.js/styles/github.css'

// 自定义图片组件
const CustomImage = ({ src, alt, ...props }) => {
  const [imageSrc, setImageSrc] = useState(src)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const loadImage = async () => {
      if (src && src.startsWith('images/')) {
        try {
          // 获取本地图片的base64数据
          const base64Data = await imageAPI.getBase64(src)
          setImageSrc(base64Data)
        } catch (err) {
          console.error('加载图片失败:', err)
          setError(true)
        }
      } else {
        setImageSrc(src)
      }
      setLoading(false)
    }

    loadImage()
  }, [src])

  if (loading) {
    return (
      <Box
        sx={{
          display: 'inline-block',
          p: 1,
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 1,
          color: 'text.secondary'
        }}
      >
        加载中...
      </Box>
    )
  }

  if (error) {
    return (
      <Box
        sx={{
          display: 'inline-block',
          p: 1,
          border: '1px solid',
          borderColor: 'error.main',
          borderRadius: 1,
          color: 'error.main',
          backgroundColor: 'error.light',
          opacity: 0.1
        }}
      >
        图片加载失败: {alt || src}
      </Box>
    )
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      {...props}
      style={{
        maxWidth: '100%',
        height: 'auto',
        borderRadius: '4px',
        ...props.style
      }}
      onError={() => setError(true)}
    />
  )
}

const MarkdownPreview = ({ content, sx }) => {
  if (!content || content.trim() === '') {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.secondary',
          ...sx
        }}
      >
        <Typography variant="body2">
          开始输入内容以查看Markdown预览
        </Typography>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        height: '100%',
        overflow: 'auto',
        overflowX: 'hidden',
        p: 2,
        minHeight: 0,
        maxWidth: '100%',
        width: '100%',
        boxSizing: 'border-box',
        wordBreak: 'break-word',
        userSelect: 'text', // 允许文字选择和复制
        WebkitUserSelect: 'text',
        MozUserSelect: 'text',
        msUserSelect: 'text',
        '& h1, & h2, & h3, & h4, & h5, & h6': {
          marginTop: 2,
          marginBottom: 1,
          fontWeight: 600
        },
        '& h1': {
          fontSize: '2rem',
          borderBottom: '2px solid',
          borderColor: 'divider',
          paddingBottom: 1
        },
        '& h2': {
          fontSize: '1.5rem',
          borderBottom: '1px solid',
          borderColor: 'divider',
          paddingBottom: 0.5
        },
        '& h3': {
          fontSize: '1.25rem'
        },
        '& p': {
          marginBottom: 1,
          lineHeight: 1.6
        },
        '& ul, & ol': {
          paddingLeft: 2,
          marginBottom: 1
        },
        '& li': {
          marginBottom: 0.5
        },
        '& blockquote': {
          borderLeft: '4px solid',
          borderColor: 'primary.main',
          paddingLeft: 2,
          marginLeft: 0,
          marginRight: 0,
          marginBottom: 1,
          fontStyle: 'italic',
          backgroundColor: 'action.hover'
        },
        '& code': {
          backgroundColor: 'action.hover',
          padding: '2px 4px',
          borderRadius: 1,
          fontSize: '0.875rem',
          fontFamily: 'monospace'
        },
        '& pre': {
          backgroundColor: 'action.hover',
          padding: 2,
          borderRadius: 1,
          overflow: 'auto',
          marginBottom: 1,
          maxWidth: '100%',
          width: '100%',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          boxSizing: 'border-box',
          '& code': {
            backgroundColor: 'transparent',
            padding: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            overflowWrap: 'break-word',
            display: 'block',
            maxWidth: '100%'
          }
        },
        '& table': {
          width: '100%',
          borderCollapse: 'collapse',
          marginBottom: 1,
          tableLayout: 'auto',
          overflowX: 'auto',
          display: 'block',
          whiteSpace: 'nowrap'
        },
        '& th, & td': {
          border: '1px solid',
          borderColor: 'divider',
          padding: 1,
          textAlign: 'left'
        },
        '& th': {
          backgroundColor: 'action.hover',
          fontWeight: 600
        },
        '& img': {
          maxWidth: '100%',
          height: 'auto',
          borderRadius: 1
        },
        '& a': {
          color: 'primary.main',
          textDecoration: 'none',
          '&:hover': {
            textDecoration: 'underline'
          }
        },
        '& hr': {
          border: 'none',
          borderTop: '1px solid',
          borderColor: 'divider',
          margin: '2rem 0'
        },
        ...sx
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
        components={{
          // 自定义组件渲染
          h1: ({ children }) => (
            <Typography variant="h4" component="h1" gutterBottom>
              {children}
            </Typography>
          ),
          h2: ({ children }) => (
            <Typography variant="h5" component="h2" gutterBottom>
              {children}
            </Typography>
          ),
          h3: ({ children }) => (
            <Typography variant="h6" component="h3" gutterBottom>
              {children}
            </Typography>
          ),
          p: ({ children }) => (
            <Typography variant="body1" paragraph>
              {children}
            </Typography>
          ),
          img: CustomImage
        }}
      >
        {content}
      </ReactMarkdown>
    </Box>
  )
}

export default MarkdownPreview