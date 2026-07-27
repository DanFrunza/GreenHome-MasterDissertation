import { BrowserRouter, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import AppRoutes from './routes'
import { UserProvider } from './context/UserContext'
import { HomeProvider } from './context/HomeContext'
import { ToastProvider } from './context/ToastContext'
import Toaster from './components/Toaster'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/theme.css'
import './styles/layout.css'
import './styles/App.css'

const AUTH_PATHS = ['/login', '/register', '/']

const PAGE_GLOW = {
  '/home':        '59, 130, 246',
  '/dashboard':   '59, 130, 246',
  '/statistics':  '34, 197, 94',
  '/devices':     '6, 182, 212',
  '/diagnostics': '245, 158, 11',
  '/automations': '139, 92, 246',
  '/eco-guide':   '34, 197, 94',
  '/roi':         '139, 92, 246',
  '/settings':    '148, 163, 184',
}

function AppBackground({ pathname }) {
  const rgb = PAGE_GLOW[pathname] || '0, 86, 179'
  return (
    <div
      className="app-bg"
      aria-hidden="true"
      style={{ '--page-glow-rgb': rgb }}
    />
  )
}

function Layout() {
  const location = useLocation()
  const isAuth = AUTH_PATHS.includes(location.pathname)
  return (
    <>
      {!isAuth && <AppBackground pathname={location.pathname} />}
      {!isAuth && <Navbar />}
      <AppRoutes />
      <Toaster />
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ToastProvider>
          <UserProvider>
            <HomeProvider>
              <Layout />
            </HomeProvider>
          </UserProvider>
        </ToastProvider>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App
