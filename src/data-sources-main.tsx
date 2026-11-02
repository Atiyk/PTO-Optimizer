import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivacyAnalytics } from './ui/PrivacyAnalytics'
import './index.css'
import { DataSources } from './ui/DataSources.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataSources />
    <PrivacyAnalytics />
  </StrictMode>,
)
