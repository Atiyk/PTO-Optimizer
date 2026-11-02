import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivacyAnalytics } from './ui/PrivacyAnalytics'
import './index.css'
import { Glossary } from './ui/Glossary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Glossary />
    <PrivacyAnalytics />
  </StrictMode>,
)
