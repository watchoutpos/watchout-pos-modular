import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { WorkspaceProvider } from './shared/WorkspaceProvider'
import { LocalAuthGate } from './modules/auth/LocalAuthGate'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocalAuthGate>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </LocalAuthGate>
  </StrictMode>,
)