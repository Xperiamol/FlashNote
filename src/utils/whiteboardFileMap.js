// 尚未下载的图片不在 Excalidraw.files 中，但仍被场景引用，保存不能删掉其路径。
export function preserveWhiteboardFileMap(elements, savedFiles, previousContent) {
  let previous = {}
  try { previous = JSON.parse(previousContent || '{}').fileMap || {} } catch {}
  const available = { ...previous, ...savedFiles }
  return Object.fromEntries(elements.filter(element => element.type === 'image' && element.fileId && !element.isDeleted)
    .map(element => [element.fileId, available[element.fileId]])
    .filter(([, file]) => file))
}
