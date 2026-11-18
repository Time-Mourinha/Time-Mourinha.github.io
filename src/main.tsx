import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registrarAplicativo } from './lib/pwa'
import { aplicarTema } from './Aparencia'
import { vigiarAtualizacoes } from './lib/atualizar'
import { enviandoAgora } from './lib/drive'
import { fotosSoNaMemoria } from './lib/armazenamento'
import './estilo.css'
import './visual.css'

registrarAplicativo()
aplicarTema()
// só recarrega sozinho se não houver vistoria com alteração ainda não salva
vigiarAtualizacoes(() => document.querySelector('[data-pendente="sim"]') !== null || enviandoAgora() || fotosSoNaMemoria() || document.body.dataset.ocupado === 'sim')
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
