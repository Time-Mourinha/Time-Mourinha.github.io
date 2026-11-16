import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registrarAplicativo } from './lib/pwa'
import { aplicarTema } from './Aparencia'
import './estilo.css'
import './visual.css'

registrarAplicativo()
aplicarTema()
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
