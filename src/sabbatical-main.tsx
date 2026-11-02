import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivacyAnalytics } from './ui/PrivacyAnalytics'
import './index.css'
import { Sabbatical } from './ui/Sabbatical.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sabbatical />
    <PrivacyAnalytics />
  </StrictMode>,
)
