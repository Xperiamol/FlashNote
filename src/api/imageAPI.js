// 图片处理相关API
export const imageAPI = {
  // 保存图片（从Buffer）
  async saveFromBuffer(buffer, fileName) {
    try {
      const result = await window.electronAPI.images.saveFromBuffer(buffer, fileName)
      if (result.success) {
        return result.data
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('保存图片失败:', error)
      throw error
    }
  },

  // 保存图片（从文件路径）
  async saveFromPath(sourcePath, fileName) {
    try {
      const result = await window.electronAPI.images.saveFromPath(sourcePath, fileName)
      if (result.success) {
        return result.data
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('保存图片失败:', error)
      throw error
    }
  },

  // 选择图片文件
  async selectFile() {
    try {
      const result = await window.electronAPI.images.selectFile()
      if (result.success) {
        return result.data
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('选择图片失败:', error)
      throw error
    }
  },

  // 获取图片完整路径
  async getPath(relativePath) {
    try {
      const result = await window.electronAPI.images.getPath(relativePath)
      if (result.success) {
        return result.data
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('获取图片路径失败:', error)
      throw error
    }
  },

  // 获取图片base64数据
  async getBase64(relativePath) {
    try {
      const result = await window.electronAPI.images.getBase64(relativePath)
      if (result.success) {
        return result.data
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('获取图片base64失败:', error)
      throw error
    }
  },

  // 删除图片
  async delete(relativePath) {
    try {
      const result = await window.electronAPI.images.delete(relativePath)
      if (result.success) {
        return result.data
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('删除图片失败:', error)
      throw error
    }
  },

  // 从粘贴板保存图片
  async saveFromClipboard() {
    return new Promise((resolve, reject) => {
      // 监听粘贴事件
      const handlePaste = async (e) => {
        const items = e.clipboardData?.items
        if (!items) {
          reject(new Error('没有找到剪贴板数据'))
          return
        }

        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile()
            if (blob) {
              try {
                const arrayBuffer = await blob.arrayBuffer()
                const buffer = new Uint8Array(arrayBuffer)
                const fileName = `clipboard_${Date.now()}.png`
                const imagePath = await this.saveFromBuffer(buffer, fileName)
                resolve({ imagePath, fileName })
                return
              } catch (error) {
                reject(error)
                return
              }
            }
          }
        }
        reject(new Error('剪贴板中没有图片'))
      }

      // 临时添加事件监听器
      document.addEventListener('paste', handlePaste, { once: true })
      
      // 5秒后超时
      setTimeout(() => {
        document.removeEventListener('paste', handlePaste)
        reject(new Error('粘贴超时'))
      }, 5000)
    })
  },

  // 检查是否为支持的图片格式
  isSupportedImageType(fileName) {
    const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg']
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))
    return supportedExtensions.includes(ext)
  },

  // 从拖拽事件中提取图片文件
  async saveFromDragEvent(e) {
    const files = Array.from(e.dataTransfer.files)
    const imageFiles = files.filter(file => file.type.startsWith('image/'))
    
    if (imageFiles.length === 0) {
      throw new Error('没有找到图片文件')
    }

    const results = []
    for (const file of imageFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const buffer = new Uint8Array(arrayBuffer)
        const imagePath = await this.saveFromBuffer(buffer, file.name)
        results.push({ imagePath, fileName: file.name })
      } catch (error) {
        console.error(`保存图片 ${file.name} 失败:`, error)
      }
    }

    return results
  }
}

export default imageAPI