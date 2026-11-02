import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivacyAnalytics } from './ui/PrivacyAnalytics'
import './index.css'
import { FaqPage } from './ui/FaqPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FaqPage />
    <PrivacyAnalytics />
  </StrictMode>,
)
