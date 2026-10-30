import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import { Policy } from './ui/Policy.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Policy />
    <Analytics />
  </StrictMode>,
)
