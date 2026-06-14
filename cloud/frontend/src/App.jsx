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

function Layout() {
  const location = useLocation()
  const isAuth = AUTH_PATHS.includes(location.pathname)
  return (
    <>
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
