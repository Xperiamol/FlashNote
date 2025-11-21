import React, { useState, useEffect, useMemo } from 'react'
import { Box, Typography } from '@mui/material'
import { imageAPI } from '../api/imageAPI'
import { getImageResolver } from '../utils/ImageProtocolResolver'
import { createMarkdownRenderer } from '../markdown/index.js'
import '../markdown/markdown.css'
import 'highlight.js/styles/github.css'

// 自定义图片组件 - 支持 app:// 协议和云端图片
const CustomImage = ({ src, alt, ...props }) => {
  const [imageSrc, setImageSrc] = useState(src)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const loadImage = async () => {
      if (!src) {
        setLoading(false)
        setError(true)
        return
      }

      try {
        // 使用协议解析器处理所有类型的图片路径
        const resolver = getImageResolver()
        const resolvedSrc = await resolver.resolve(src)

        if (resolvedSrc) {
          setImageSrc(resolvedSrc)
          setError(false)
        } else {
          setError(true)
        }
      } catch (err) {
        console.error('加载图片失败:', err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    loadImage()
  }, [src])

  if (loading) {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '8px',
          border: '1px dashed #ccc',
          borderRadius: '4px',
          color: '#666'
        }}
      >
        加载中...
      </span>
    )
  }

  if (error) {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '8px',
          border: '1px solid #f44336',
          borderRadius: '4px',
          color: '#f44336',
          backgroundColor: 'rgba(244, 67, 54, 0.1)'
        }}
      >
        图片加载失败: {alt || src}
      </span>
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

const MarkdownPreview = ({ content, sx, onWikiLinkClick, onTagClick }) => {
  const [renderedHTML, setRenderedHTML] = useState('')

  // 创建 Markdown 渲染器实例（使用 useMemo 避免重复创建）
  const md = useMemo(() => {
    return createMarkdownRenderer({
      onWikiLinkClick,
      onTagClick,
      pluginOptions: {
        highlight: {
          className: 'markdown-highlight'
        },
        colorText: {
          className: 'markdown-color-text'
        },
        callout: {
          className: 'markdown-callout'
        },
        wikiLink: {
          className: 'markdown-wiki-link',
          baseUrl: '#note/'
        },
        tag: {
          className: 'markdown-tag'
        },
        customContainer: {
          className: 'markdown-container'
        }
      }
    })
  }, [onWikiLinkClick, onTagClick])

  // 渲染 Markdown 内容
  useEffect(() => {
    if (!content || content.trim() === '') {
      setRenderedHTML('')
      return
    }

    try {
      const html = md.render(content)
      setRenderedHTML(html)
    } catch (error) {
      console.error('Markdown 渲染失败:', error)
      setRenderedHTML(`<div style="color: red;">渲染失败: ${error.message}</div>`)
    }
  }, [content, md])

  // 处理点击事件（Wiki 链接和标签）
  useEffect(() => {
    const handleClick = (e) => {
      const target = e.target

      // 处理 Wiki 链接点击
      if (target.classList.contains('markdown-wiki-link')) {
        e.preventDefault()
        const wikiTarget = target.getAttribute('data-wiki-target')
        const wikiSection = target.getAttribute('data-wiki-section')

        if (onWikiLinkClick && wikiTarget) {
          onWikiLinkClick(wikiTarget, wikiSection)
        }
        return
      }

      // 处理标签点击
      if (target.classList.contains('markdown-tag')) {
        e.preventDefault()
        const tag = target.getAttribute('data-tag')

        if (onTagClick && tag) {
          onTagClick(tag)
        }
        return
      }
    }

    const previewElement = document.querySelector('.markdown-preview-content')
    if (previewElement) {
      previewElement.addEventListener('click', handleClick)
      return () => {
        previewElement.removeEventListener('click', handleClick)
      }
    }
  }, [onWikiLinkClick, onTagClick])

  // 处理图片加载
  useEffect(() => {
    const loadImages = async () => {
      const previewElement = document.querySelector('.markdown-preview-content')
      if (!previewElement) return

      const images = previewElement.querySelectorAll('img')
      const resolver = getImageResolver()

      console.log(`[MarkdownPreview] 开始加载 ${images.length} 张图片`)

      for (const img of images) {
        const originalSrc = img.getAttribute('src')

        console.log(`[MarkdownPreview] 图片原始路径:`, originalSrc)

        // 跳过已经是 data:、file:// 或 http(s) 的图片
        if (!originalSrc || originalSrc.startsWith('data:') || originalSrc.startsWith('file://') || originalSrc.startsWith('http://') || originalSrc.startsWith('https://')) {
          console.log(`[MarkdownPreview] 跳过已处理的图片:`, originalSrc)
          continue
        }

        try {
          // 使用协议解析器加载图片
          console.log(`[MarkdownPreview] 解析图片路径:`, originalSrc)
          const resolvedSrc = await resolver.resolve(originalSrc)
          console.log(`[MarkdownPreview] 解析结果:`, resolvedSrc)

          if (resolvedSrc) {
            img.src = resolvedSrc
            console.log(`[MarkdownPreview] 图片加载成功:`, originalSrc)
          } else {
            throw new Error('图片解析失败')
          }
        } catch (error) {
          console.error('[MarkdownPreview] 加载图片失败:', originalSrc, error)
          img.style.border = '1px solid #f44336'
          img.style.padding = '4px'
          img.alt = `❌ 图片加载失败`
          // 隐藏破损的图片，只显示错误消息
          img.style.display = 'inline-block'
          img.style.width = 'auto'
          img.style.height = 'auto'
        }
      }
    }

    if (renderedHTML) {
      loadImages()
    }
  }, [renderedHTML])

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
      className="markdown-preview-content"
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
        userSelect: 'text',
        WebkitUserSelect: 'text',
        MozUserSelect: 'text',
        msUserSelect: 'text',
        fontFamily: '"OPPOSans R", "OPPOSans", system-ui, -apple-system, sans-serif',
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
      dangerouslySetInnerHTML={{ __html: renderedHTML }}
    />
  )
}

export default MarkdownPreview