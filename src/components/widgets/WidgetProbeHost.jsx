import { useEffect, useState } from 'react'
import { Box } from '@mui/material'
import { ThemeProvider, createTheme } from '@mui/material/styles'

const PROBE_THEMES = { light: createTheme(), dark: createTheme({ palette: { mode: 'dark' } }) }
import WidgetHost from './WidgetHost'

const PROBE_TIMEOUT_MS = 8000
const PROBE_SETTLE_MS = 900

let enqueue = null

/**
 * 在不可见的沙箱里按指定尺寸运行一次组件草稿，收集报错与渲染情况，供 AI 自动修复。
 * @param {string} draftId
 * @param {'compact'|'medium'|'full'} [size]
 * @returns {Promise<{ errors: Array<{message: string, stack?: string}>, health: object | null, skipped?: boolean }>}
 */
export const probeWidget = (draftId, size = 'full', signal, viewport = {}) => new Promise((resolve) => {
  if (!enqueue) return resolve({ errors: [], health: null, skipped: true })
  if (signal?.aborted) return resolve({ errors: [], health: null, skipped: true })
  enqueue({ id: `${draftId}-${size}-${Date.now()}-${Math.random()}`, draftId, size, signal, viewport, resolve })
})

/** 由预跑结果得出需要修复的问题 */
export const collectProblems = (probe) => {
  if (probe.skipped) return [{ message: '预览检查不可用，不能将未检查的草稿发布为组件', fatal: true }]
  const problems = [...probe.errors]
  if (probe.health && probe.health.elements <= 2 && probe.health.text === 0) {
    problems.push({ message: '白屏：组件加载后页面上没有渲染出任何内容' })
  } else if (!probe.health && !problems.length) {
    problems.push({ message: '组件加载超时，没有完成渲染（可能有死循环，或脚本在加载时就中断了）' })
  }
  if (probe.health?.overflowX > 8) problems.push({ message: `页面横向溢出 ${probe.health.overflowX}px，请使用响应式宽度，避免内容被裁切` })
  for (const issue of probe.health?.issues || []) problems.push({ message: issue })
  return problems
}

function Probe({ request, onDone }) {
  const [state] = useState(() => ({ errors: [], health: null, timer: null, finished: false, epoch: 0 }))
  const finish = () => {
    if (state.finished) return
    state.finished = true
    clearTimeout(state.timer)
    request.resolve({ errors: state.errors, health: state.health })
    onDone(request.id)
  }
  useEffect(() => {
    const epoch = ++state.epoch
    if (request.signal?.aborted) { finish(); return }
    state.timer = setTimeout(finish, PROBE_TIMEOUT_MS)
    request.signal?.addEventListener('abort', finish, { once: true })
    return () => {
      clearTimeout(state.timer)
      request.signal?.removeEventListener('abort', finish)
      queueMicrotask(() => {
        if (state.epoch === epoch && !state.finished) request.resolve({ errors: state.errors, health: state.health, skipped: true })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const onEvent = (event) => {
    if (event.type === 'error') state.errors.push({ message: event.message, stack: event.stack })
    if (event.type === 'console' && event.level === 'error') state.errors.push({ message: `console.error: ${event.text}` })
    if (event.type === 'health') {
      state.health = event
      clearTimeout(state.timer)
      state.timer = setTimeout(finish, PROBE_SETTLE_MS)
    }
  }
  // full 占满固定高度；其他尺寸按首页卡片 / 笔记里的真实上限随内容撑开
  return request.size === 'full'
    ? <WidgetHost instanceId={request.draftId} size="full" surface="probe" onEvent={onEvent} showErrors={false} sx={{ height: 600 }} />
    : <WidgetHost instanceId={request.draftId} size={request.size} surface="probe" onEvent={onEvent} showErrors={false} minHeight={48} maxHeight={request.size === 'compact' ? 320 : 600} />
}

/** 全局挂载一次：在屏幕外运行预跑用的沙箱 */
export default function WidgetProbeHost() {
  const [requests, setRequests] = useState([])
  useEffect(() => {
    enqueue = (request) => setRequests((list) => [...list, request])
    return () => { enqueue = null }
  }, [])
  if (!requests.length) return null
  return (
    <Box aria-hidden sx={{ position: 'fixed', left: -10000, top: 0, width: 1000, pointerEvents: 'none', opacity: 0 }}>
      {requests.map((request) => (
        <ThemeProvider key={request.id} theme={PROBE_THEMES[request.viewport.theme] || PROBE_THEMES.light}><Box sx={{ width: request.viewport.width || 480 }}><Probe request={request} onDone={(id) => setRequests((list) => list.filter((item) => item.id !== id))} /></Box></ThemeProvider>
      ))}
    </Box>
  )
}
