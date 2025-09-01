import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneWindow from './StandaloneWindow.jsx'
import './styles/index.css'

// 渲染独立窗口应用
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StandaloneWindow />
  </React.StrictMode>,
)