import { BrowserRouter, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import AppRoutes from './routes'
import { UserProvider } from './context/UserContext'
import { HomeProvider } from './context/HomeContext'
import './styles/theme.css'
import './styles/layout.css'
import './styles/App.css'

const AUTH_PATHS = ['/login', '/register']

function Layout() {
  const location = useLocation()
  const isAuth = AUTH_PATHS.includes(location.pathname)
  return (
    <>
      {!isAuth && <Navbar />}
      <AppRoutes />
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <HomeProvider>
          <Layout />
        </HomeProvider>
      </UserProvider>
    </BrowserRouter>
  )
}

export default App
