import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import { Glossary } from './ui/Glossary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Glossary />
    <Analytics />
  </StrictMode>,
)
