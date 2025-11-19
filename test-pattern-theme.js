/**
 * 花纹主题插件测试脚本
 * 
 * 用于测试主题API功能
 */

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

// 等待应用准备就绪
setTimeout(async () => {
  console.log('\n========== 花纹主题插件测试 ==========\n')
  
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (!mainWindow) {
    console.error('❌ 找不到主窗口')
    return
  }

  try {
    // 1. 检查插件是否已安装
    console.log('1️⃣ 检查插件安装状态...')
    const plugins = await mainWindow.webContents.executeJavaScript(`
      window.electron.invoke('plugin:list-installed')
    `)
    
    const patternTheme = plugins.find(p => p.id === 'pattern-theme')
    if (!patternTheme) {
      console.log('⚠️  花纹主题插件未安装')
      console.log('📝 请通过插件商店 → 本地开发 → 刷新插件列表来安装')
      return
    }
    
    console.log(`✅ 插件已安装: ${patternTheme.name} v${patternTheme.version}`)
    console.log(`   启用状态: ${patternTheme.enabled ? '已启用' : '已禁用'}`)
    
    if (!patternTheme.enabled) {
      console.log('⚠️  插件未启用，正在启用...')
      await mainWindow.webContents.executeJavaScript(`
        window.electron.invoke('plugin:enable', 'pattern-theme')
      `)
      console.log('✅ 插件已启用')
      
      // 等待插件激活
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // 2. 检查主题管理器
    console.log('\n2️⃣ 检查主题管理器...')
    const themeStats = await mainWindow.webContents.executeJavaScript(`
      (function() {
        const container = document.getElementById('flashnote-plugin-themes')
        if (!container) {
          return { error: '主题容器不存在' }
        }
        
        const styles = Array.from(container.children)
        return {
          containerExists: true,
          styleCount: styles.length,
          styles: styles.map(s => ({
            id: s.id,
            pluginId: s.getAttribute('data-plugin-id'),
            styleId: s.getAttribute('data-style-id'),
            priority: s.getAttribute('data-priority'),
            cssLength: s.textContent.length
          }))
        }
      })()
    `)
    
    if (themeStats.error) {
      console.log(`❌ ${themeStats.error}`)
    } else {
      console.log(`✅ 主题容器存在`)
      console.log(`   当前样式数: ${themeStats.styleCount}`)
      if (themeStats.styles.length > 0) {
        themeStats.styles.forEach(s => {
          console.log(`   - ${s.pluginId}/${s.styleId} (优先级: ${s.priority}, CSS长度: ${s.cssLength})`)
        })
      }
    }

    // 3. 测试切换花纹主题
    console.log('\n3️⃣ 测试切换花纹主题...')
    const toggleResult = await mainWindow.webContents.executeJavaScript(`
      window.flashnotePlugin.executeCommand('pattern-theme', 'pattern-theme.toggle')
    `)
    
    console.log(`   结果:`, toggleResult)
    
    // 等待样式应用
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // 再次检查样式
    const themeStats2 = await mainWindow.webContents.executeJavaScript(`
      (function() {
        const container = document.getElementById('flashnote-plugin-themes')
        const styles = Array.from(container.children)
        return {
          styleCount: styles.length,
          styles: styles.map(s => ({
            id: s.id,
            pluginId: s.getAttribute('data-plugin-id'),
            styleId: s.getAttribute('data-style-id')
          }))
        }
      })()
    `)
    
    console.log(`   切换后样式数: ${themeStats2.styleCount}`)

    // 4. 测试切换样式
    console.log('\n4️⃣ 测试切换花纹样式...')
    const switchResult = await mainWindow.webContents.executeJavaScript(`
      window.flashnotePlugin.executeCommand('pattern-theme', 'pattern-theme.next-style')
    `)
    
    console.log(`   当前样式: ${switchResult.data?.name || '未知'}`)

    // 5. 获取设置信息
    console.log('\n5️⃣ 获取插件设置...')
    const settingsResult = await mainWindow.webContents.executeJavaScript(`
      window.flashnotePlugin.executeCommand('pattern-theme', 'pattern-theme.settings')
    `)
    
    if (settingsResult.success && settingsResult.data?.currentSettings) {
      const settings = settingsResult.data.currentSettings
      console.log(`   启用状态: ${settings.enabled}`)
      console.log(`   当前样式: ${settings.styleName} (${settings.style})`)
      console.log(`   透明度: ${settings.opacity}`)
      console.log(`   可用样式: ${settingsResult.data.availableStyles.length} 种`)
    }

    // 6. 检查页面上的花纹效果
    console.log('\n6️⃣ 检查页面花纹效果...')
    const patternCheck = await mainWindow.webContents.executeJavaScript(`
      (function() {
        const bodyBefore = window.getComputedStyle(document.body, ':before')
        return {
          content: bodyBefore.content,
          position: bodyBefore.position,
          backgroundImage: bodyBefore.backgroundImage !== 'none' ? '已设置' : '未设置',
          zIndex: bodyBefore.zIndex
        }
      })()
    `)
    
    console.log(`   body::before 伪元素:`)
    console.log(`     - content: ${patternCheck.content}`)
    console.log(`     - position: ${patternCheck.position}`)
    console.log(`     - backgroundImage: ${patternCheck.backgroundImage}`)
    console.log(`     - zIndex: ${patternCheck.zIndex}`)

    console.log('\n========== 测试完成 ==========\n')
    console.log('💡 提示:')
    console.log('   - 如果看不到花纹，请检查浏览器开发工具的Elements面板')
    console.log('   - 查看 <head> 中的 #flashnote-plugin-themes 容器')
    console.log('   - 检查 body::before 伪元素的样式')
    console.log('   - 使用命令面板 (Ctrl+Shift+P) 切换花纹样式\n')

  } catch (error) {
    console.error('❌ 测试失败:', error)
  }
}, 3000)
