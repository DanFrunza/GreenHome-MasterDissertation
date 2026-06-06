import { Routes, Route, Navigate } from 'react-router-dom'
import PrivateRoute from './components/PrivateRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import Automations from './pages/Automations'
import Statistics from './pages/Statistics'
import Diagnostics from './pages/Diagnostics'
import Settings from './pages/Settings'
import ROICalculator from './pages/ROICalculator'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/"            element={<PrivateRoute><Home /></PrivateRoute>} />
      <Route path="/dashboard"   element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/devices"     element={<PrivateRoute><Devices /></PrivateRoute>} />
      <Route path="/automations" element={<PrivateRoute><Automations /></PrivateRoute>} />
      <Route path="/statistics"  element={<PrivateRoute><Statistics /></PrivateRoute>} />
      <Route path="/diagnostics" element={<PrivateRoute><Diagnostics /></PrivateRoute>} />
      <Route path="/settings"    element={<PrivateRoute><Settings /></PrivateRoute>} />
      <Route path="/roi"         element={<PrivateRoute><ROICalculator /></PrivateRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRoutes
