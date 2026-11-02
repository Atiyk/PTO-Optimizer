import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivacyAnalytics } from './ui/PrivacyAnalytics'
import './index.css'
import { Policy } from './ui/Policy.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Policy />
    <PrivacyAnalytics />
  </StrictMode>,
)
