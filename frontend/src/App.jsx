import { BrowserRouter } from 'react-router-dom'
import Navbar from './components/Navbar'
import AppRoutes from './routes'
import './styles/theme.css'
import './styles/layout.css'
import './styles/App.css'

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App

