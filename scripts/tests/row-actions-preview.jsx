import React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, Box } from '@mui/material'
import NoteRow from '../../src/components/notes/NoteRow'
import { createAppTheme } from '../../src/styles/theme'

const backgrounds = [
  { name: '纯色', light: '#f5f5f3', dark: '#222226' },
  { name: '彩色背景', light: 'linear-gradient(115deg, #beded4, #dec8f0 60%, #eda6ab)', dark: 'linear-gradient(115deg, #193732, #403154 60%, #713841)' },
  { name: '高对比纹理', light: 'repeating-linear-gradient(115deg, #dbc8eb 0 10px, #a4c9d2 10px 20px)', dark: 'repeating-linear-gradient(115deg, #263f57 0 10px, #613e64 10px 20px)' },
]
let clicks = 0
const actions = { onClick() {}, onContextMenu() {}, onMenuClick(event) { event.stopPropagation(); clicks++ } }
createRoot(document.getElementById('root')).render(
  <main style={{ padding: 24, background: '#929699', fontFamily: 'system-ui', minHeight: '100vh', boxSizing: 'border-box' }}>
    <h2 style={{ margin: '0 0 16px', color: 'white', fontSize: 20 }}>列表菜单 · 透明模糊</h2>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {['light', 'dark'].map(mode => <ThemeProvider key={mode} theme={createAppTheme(mode)}>
        <section style={{ minWidth: 0 }}>
          <h3 style={{ color: 'white', margin: '0 0 12px' }}>{mode === 'light' ? '浅色' : '深色'}</h3>
          {backgrounds.map((bg, index) => <Box key={bg.name} sx={{ background: bg[mode], color: 'text.primary', borderRadius: '16px', mb: 2, p: 1.5 }}>
            <Box sx={{ color: 'text.secondary', fontSize: 12, mb: 1 }}>{bg.name} · 选中／未选中（菜单保持显示）</Box>
            {[true, false].map(selected => <NoteRow key={String(selected)}
              note={{ id: `${mode}-${index}-${selected}`, note_type: 'markdown' }}
              title={selected ? '设计记录 · 已选中' : '随手记录 · 普通行'}
              preview="文字与背景只在菜单图标后方柔和虚化，保持原来的颜色。"
              timeLabel="10 月 9 日" selected={selected} menuOpen
              actions={actions} />)}
          </Box>)}
        </section>
      </ThemeProvider>)}
    </div>
  </main>
)
window.rowActionsPreview = true
window.runEditorTests = async () => {
  const buttons = [...document.querySelectorAll('.note-menu-button')]
  const results = []
  for (const [index, button] of buttons.entries()) {
    const base = getComputedStyle(button), blur = getComputedStyle(button, '::before')
    results.push({ name: `菜单 ${index + 1}：按钮与模糊层不叠底色`, ok: base.backgroundColor === 'rgba(0, 0, 0, 0)' && blur.backgroundColor === 'rgba(0, 0, 0, 0)' && blur.backgroundImage === 'none', error: JSON.stringify({ base: base.backgroundColor, blur: blur.backgroundColor, image: blur.backgroundImage }) })
    results.push({ name: `菜单 ${index + 1}：背景模糊保留`, ok: blur.backdropFilter.includes('blur(') })
    button.click()
  }
  results.push({ name: '菜单仍可点击', ok: buttons.length === 12 && clicks === 12 })
  return results
}
window.testReady = true
