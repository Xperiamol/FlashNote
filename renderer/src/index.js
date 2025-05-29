import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import NoteWindow from './NoteWindow';
import 'antd/dist/reset.css';
import './App.css';

// 根据URL hash决定渲染App还是NoteWindow
const isNoteWindow = window.location.hash.startsWith('#note/');

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    {isNoteWindow ? <NoteWindow /> : <App />}
  </React.StrictMode>
);