import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initDatadog } from './datadog.js'
import './styles/global.css'

// Initialize Datadog RUM before rendering the app
initDatadog()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
