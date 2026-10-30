import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import { FaqPage } from './ui/FaqPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FaqPage />
    <Analytics />
  </StrictMode>,
)
