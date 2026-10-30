import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import { DataSources } from './ui/DataSources.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataSources />
    <Analytics />
  </StrictMode>,
)
