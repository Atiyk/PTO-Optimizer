import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivacyAnalytics } from './ui/PrivacyAnalytics'
import './index.css'
import { Family } from './ui/Family.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Family />
    <PrivacyAnalytics />
  </StrictMode>,
)
