import { useEffect, useMemo, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, TextField, Typography } from '@mui/material'
import { ExpandMore, Launch, Search } from '@mui/icons-material'

// 清单由 scripts/generate-third-party-licenses.cjs 在 dev / build 前生成，打开“关于”页时才加载
const loadLicenses = () => import('../../generated/third-party-licenses.json').then((module) => module.default.packages)

const SEARCH_LIMIT = 100

/** 设置 → 关于：随应用发布的第三方开源软件及其许可证全文 */
export default function OpenSourceLicenses() {
  const [packages, setPackages] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let cancelled = false
    loadLicenses().then((list) => { if (!cancelled) setPackages(list) }).catch((err) => { if (!cancelled) setError(err.message || '加载失败') })
    return () => { cancelled = true }
  }, [])

  const groups = useMemo(() => {
    const map = new Map()
    for (const item of packages || []) map.set(item.license, [...(map.get(item.license) || []), item])
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  }, [packages])

  const matches = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword || !packages) return null
    return packages.filter((item) => item.name.toLowerCase().includes(keyword) || item.license.toLowerCase().includes(keyword))
  }, [packages, query])

  if (error) return <Typography variant="body2" color="error">{`许可清单加载失败：${error}`}</Typography>
  if (!packages) return <Box sx={{ display: 'grid', placeItems: 'center', py: 3 }}><CircularProgress size={22} /></Box>

  const row = (item) => (
    <Box
      key={`${item.name}@${item.version}`}
      component="button"
      type="button"
      onClick={() => setSelected(item)}
      sx={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2,
        pl: 1, pr: 0.5, py: 0.75, border: 0, borderBottom: '1px solid', borderColor: 'divider',
        bgcolor: 'transparent', color: 'text.primary', cursor: 'pointer', textAlign: 'left', font: 'inherit',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>{item.name}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{item.version}</Typography>
    </Box>
  )

  const toggle = (license) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(license)) next.delete(license)
    else next.add(license)
    return next
  })

  return (
    <Box sx={{ textAlign: 'left', maxWidth: 540, mx: 'auto' }}>
      <TextField
        size="small"
        fullWidth
        placeholder={`搜索 ${packages.length} 个开源组件`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        sx={{ mb: 2 }}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }}
      />

      {matches ? (
        <Box>
          {matches.slice(0, SEARCH_LIMIT).map(row)}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {matches.length ? (matches.length > SEARCH_LIMIT ? `共 ${matches.length} 项，显示前 ${SEARCH_LIMIT} 项` : `共 ${matches.length} 项`) : '没有匹配的组件'}
          </Typography>
        </Box>
      ) : groups.map(([license, items]) => (
        <Box key={license} sx={{ mb: 1 }}>
          <Box
            component="button"
            type="button"
            onClick={() => toggle(license)}
            aria-expanded={expanded.has(license)}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', py: 0.5, border: 0, bgcolor: 'transparent', cursor: 'pointer', color: 'text.primary', font: 'inherit' }}
          >
            <ExpandMore fontSize="small" sx={{ color: 'text.secondary', transition: 'transform 160ms ease', transform: expanded.has(license) ? 'none' : 'rotate(-90deg)' }} />
            <Chip label={license} size="small" color="primary" variant="outlined" />
            <Typography variant="caption" color="text.secondary">{items.length} 个</Typography>
          </Box>
          {expanded.has(license) && <Box sx={{ pl: 3.5 }}>{items.map(row)}</Box>}
        </Box>
      ))}

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="md" fullWidth>
        {selected && <>
          <DialogTitle sx={{ pb: 1 }}>
            {selected.name} <Typography component="span" variant="body2" color="text.secondary">{selected.version} · {selected.license}</Typography>
          </DialogTitle>
          <DialogContent dividers>
            <Typography component="pre" variant="caption" sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: 1.6 }}>
              {selected.text || `该组件未随包附带许可证全文，许可证为 ${selected.license}，请参阅源码仓库。`}
            </Typography>
          </DialogContent>
          <DialogActions>
            {selected.repository && /^https?:/.test(selected.repository) && (
              <Button size="small" startIcon={<Launch />} onClick={() => window.electronAPI?.system?.openExternal?.(selected.repository)}>源码仓库</Button>
            )}
            <Button size="small" onClick={() => setSelected(null)}>关闭</Button>
          </DialogActions>
        </>}
      </Dialog>
    </Box>
  )
}
