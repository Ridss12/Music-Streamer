import { Routes, Route } from 'react-router-dom'

import Home from './pages/Home.jsx'
import Library from './pages/Library.jsx'
import Settings from './pages/Settings.jsx'
import ServerConnection from './pages/ServerConnection.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Profile from './pages/Profile.jsx'
import LeoAssistant from './LeoAssistant.jsx'

export default function App() {
  return (
    <>
      {/* Persistent Leo Assistant */}
      <LeoAssistant />

      {/* Application Routes */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/server" element={<ServerConnection />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </>
  )
}