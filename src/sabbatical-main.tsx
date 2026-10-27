import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import { Sabbatical } from './ui/Sabbatical.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sabbatical />
    <Analytics />
  </StrictMode>,
)
