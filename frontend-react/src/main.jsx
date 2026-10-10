import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ServerProvider } from './ServerContext.jsx'
import { AuthProvider } from './AuthContext.jsx'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ServerProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ServerProvider>
    </BrowserRouter>
  </React.StrictMode>,
)