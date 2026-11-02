import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivacyAnalytics } from './ui/PrivacyAnalytics'
import './index.css'
import { Landing } from './ui/Landing.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Landing />
    <PrivacyAnalytics />
  </StrictMode>,
)
