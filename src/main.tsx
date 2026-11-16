import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registrarAplicativo } from './lib/pwa'
import './estilo.css'

registrarAplicativo()
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
