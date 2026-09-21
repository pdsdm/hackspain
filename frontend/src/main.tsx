import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './data/useAuth'
import { AuthGate } from './components/layout/AuthGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  </StrictMode>,
)
