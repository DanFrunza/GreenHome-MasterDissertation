import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'

export default function PrivateRoute({ children }) {
  const { user, loading } = useUser()
  if (loading) return null
  if (!user) return <Navigate to="/" replace />
  return children
}
