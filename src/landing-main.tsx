import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import { Landing } from './ui/Landing.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Landing />
    <Analytics />
  </StrictMode>,
)
