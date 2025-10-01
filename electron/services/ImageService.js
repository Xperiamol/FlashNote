const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const crypto = require('crypto')

class ImageService {
  constructor() {
    this.imagesDir = path.join(app.getPath('userData'), 'images')
    this.ensureImagesDirectory()
  }

  // 确保图片目录存在
  ensureImagesDirectory() {
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true })
    }
  }

  // 生成唯一的文件名
  generateFileName(originalName) {
    const ext = path.extname(originalName).toLowerCase()
    const hash = crypto.randomBytes(16).toString('hex')
    const timestamp = Date.now()
    return `${timestamp}_${hash}${ext}`
  }

  // 保存图片文件
  async saveImage(buffer, originalName) {
    try {
      const fileName = this.generateFileName(originalName)
      const filePath = path.join(this.imagesDir, fileName)
      
      // 写入文件
      fs.writeFileSync(filePath, buffer)
      
      // 返回相对路径，用于markdown引用
      return `images/${fileName}`
    } catch (error) {
      console.error('保存图片失败:', error)
      throw new Error('保存图片失败')
    }
  }

  // 从文件路径保存图片
  async saveImageFromPath(sourcePath, originalName) {
    try {
      const buffer = fs.readFileSync(sourcePath)
      return await this.saveImage(buffer, originalName)
    } catch (error) {
      console.error('从路径保存图片失败:', error)
      throw new Error('保存图片失败')
    }
  }

  // 获取图片的完整路径
  getImagePath(relativePath) {
    if (relativePath.startsWith('images/')) {
      return path.join(this.imagesDir, relativePath.replace('images/', ''))
    }
    return path.join(this.imagesDir, relativePath)
  }

  // 读取图片为base64
  async readImageAsBase64(relativePath) {
    try {
      const fullPath = this.getImagePath(relativePath)
      if (fs.existsSync(fullPath)) {
        const buffer = fs.readFileSync(fullPath)
        const ext = path.extname(fullPath).toLowerCase()
        let mimeType = 'image/png'
        
        switch (ext) {
          case '.jpg':
          case '.jpeg':
            mimeType = 'image/jpeg'
            break
          case '.png':
            mimeType = 'image/png'
            break
          case '.gif':
            mimeType = 'image/gif'
            break
          case '.bmp':
            mimeType = 'image/bmp'
            break
          case '.webp':
            mimeType = 'image/webp'
            break
          case '.svg':
            mimeType = 'image/svg+xml'
            break
        }
        
        const base64 = buffer.toString('base64')
        return `data:${mimeType};base64,${base64}`
      }
      throw new Error('图片文件不存在')
    } catch (error) {
      console.error('读取图片为base64失败:', error)
      throw error
    }
  }

  // 检查文件是否为支持的图片格式
  isSupportedImageType(fileName) {
    const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg']
    const ext = path.extname(fileName).toLowerCase()
    return supportedExtensions.includes(ext)
  }

  // 删除图片文件
  async deleteImage(relativePath) {
    try {
      const fullPath = this.getImagePath(relativePath)
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath)
        return true
      }
      return false
    } catch (error) {
      console.error('删除图片失败:', error)
      return false
    }
  }

  // 获取图片信息
  getImageInfo(relativePath) {
    try {
      const fullPath = this.getImagePath(relativePath)
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath)
        return {
          exists: true,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        }
      }
      return { exists: false }
    } catch (error) {
      console.error('获取图片信息失败:', error)
      return { exists: false }
    }
  }

  // 获取图片的base64数据
  async getBase64(relativePath) {
    try {
      const fullPath = this.getImagePath(relativePath)
      if (!fs.existsSync(fullPath)) {
        throw new Error('图片文件不存在')
      }
      
      const buffer = fs.readFileSync(fullPath)
      const ext = path.extname(fullPath).toLowerCase().substring(1)
      
      // 确定MIME类型
      let mimeType = 'image/png'
      switch (ext) {
        case 'jpg':
        case 'jpeg':
          mimeType = 'image/jpeg'
          break
        case 'png':
          mimeType = 'image/png'
          break
        case 'gif':
          mimeType = 'image/gif'
          break
        case 'bmp':
          mimeType = 'image/bmp'
          break
        case 'webp':
          mimeType = 'image/webp'
          break
        case 'svg':
          mimeType = 'image/svg+xml'
          break
      }
      
      const base64 = buffer.toString('base64')
      return `data:${mimeType};base64,${base64}`
    } catch (error) {
      console.error('获取图片base64失败:', error)
      throw error
    }
  }

  // 清理未使用的图片
  async cleanupUnusedImages(usedImagePaths) {
    try {
      const files = fs.readdirSync(this.imagesDir)
      const usedFiles = usedImagePaths.map(p => path.basename(p))
      
      for (const file of files) {
        if (!usedFiles.includes(file)) {
          const filePath = path.join(this.imagesDir, file)
          fs.unlinkSync(filePath)
        }
      }
    } catch (error) {
      console.error('清理未使用图片失败:', error)
    }
  }
}

module.exports = ImageService