import { BrowserRouter } from 'react-router-dom'
import Navbar from './components/Navbar'
import AppRoutes from './routes'
import { HomeProvider } from './context/HomeContext'
import './styles/theme.css'
import './styles/layout.css'
import './styles/App.css'

function App() {
  return (
    <BrowserRouter>
      <HomeProvider>
        <Navbar />
        <AppRoutes />
      </HomeProvider>
    </BrowserRouter>
  )
}

export default App

