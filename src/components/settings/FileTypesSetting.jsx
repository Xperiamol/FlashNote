import { useEffect, useState } from 'react'
import { Switch } from '@mui/material'
import { SettingRow } from './SettingRow'
import { notifyError } from '../../utils/notify'

const DESCRIPTIONS = {
  markdown: '双击或「打开方式」时在独立窗口里预览和编辑，改动写回原文件',
  text: '纯文本和日志，同样在独立窗口里打开',
  whiteboard: '在独立窗口里打开 Excalidraw 画布',
  html: '提取正文转换为排版预览，可导入为笔记；含单文件网页 .mht',
  word: '转换为排版预览，保留标题、表格和图片，可导入为笔记',
  spreadsheet: '每个工作表转换为表格预览，可导入为笔记',
  presentation: '按页提取标题、文字、图片和演讲者备注，可导入为笔记',
  pdf: '提取文字和标题结构；扫描件没有文字层，无法提取',
  ebook: '按章节转换为排版预览，可导入为笔记',
}

/** 设置 → 笔记与文件：Flota 接受哪些文件（系统打开方式、打开对话框、拖进笔记列表） */
export default function FileTypesSetting() {
  const [types, setTypes] = useState([])
  const [enabled, setEnabled] = useState([])

  useEffect(() => {
    window.electronAPI?.externalFiles?.getFileTypes?.().then((result) => {
      if (!result?.success) return
      setTypes(result.data.types)
      setEnabled(result.data.enabled)
    })
  }, [])

  const toggle = async (id, on) => {
    const next = on ? [...new Set([...enabled, id])] : enabled.filter((item) => item !== id)
    setEnabled(next)
    const result = await window.electronAPI.externalFiles.setFileTypes(next)
    if (!result?.success) {
      notifyError(result?.error || '保存失败')
      setEnabled(enabled)
      return
    }
    window.dispatchEvent(new Event('flota:file-types-changed'))
  }

  return types.map((type) => (
    <SettingRow
      key={type.id}
      primary={`${type.name}（${type.extensions.map((ext) => `.${ext}`).join(' ')}）`}
      secondary={DESCRIPTIONS[type.id]}
      action={<Switch checked={enabled.includes(type.id)} onChange={(event) => toggle(type.id, event.target.checked)}
        inputProps={{ 'aria-label': `用 Flota 打开${type.name}` }} />}
    />
  ))
}
