import marca from './assets/marca.png'
import { REGRA_CLASSIFICACAO, impactosDoTexto, resumir } from './lib/analise'
import { dataBR, fotosDaObservacao, fotosDoAmbiente, obsComConteudo, precisaFoto, semAcento, type Midia, type Unidade, type Vistoria } from './lib/modelo'
import { VerMidia } from './ui'
import { CFG } from './config'

export const ESTILOS_RELATORIO = [
  { id: 'institucional', nome: 'Institucional', desc: 'Faixa azul, formal, para ofício e apresentação' },
  { id: 'moderno', nome: 'Moderno', desc: 'Cartões claros com destaque laranja, para tela e reunião' },
  { id: 'compacto', nome: 'Compacto', desc: 'Preto e branco, denso, economiza papel e tinta' },
] as const
export type EstiloRelatorio = (typeof ESTILOS_RELATORIO)[number]['id']

const hojeBR = () => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', dateStyle: 'long' }).format(new Date())

/** Relatório de visita técnica: pronto para imprimir em PDF ou apresentar. */
export function Relatorio({ vistoria: v, unidade: u, estilo }: { vistoria: Vistoria; unidade?: Unidade; estilo: EstiloRelatorio }) {
  const r = resumir(v)
  const numero = v.id.slice(0, 8).toUpperCase()
  const ordemSit: Record<string, number> = { 'Péssimo': 0, Regular: 1, Bom: 2 }
  // ambientes com problema primeiro (péssimo, regular), depois os bons, na ordem da visita
  const ambientes = [...v.rooms].sort((a, b) => (ordemSit[a.situacao ?? ''] ?? 3) - (ordemSit[b.situacao ?? ''] ?? 3))
  // observações vazias (rascunho não preenchido) não entram; primeiro as dos ambientes, na ordem do relatório, depois as gerais
  const posAmb = (room?: string) => (room ? ambientes.findIndex((a) => a.id === room) : 999)
  const obs = (v.observacoes ?? []).filter((o) => obsComConteudo(v, o)).sort((a, b) => posAmb(a.room) - posAmb(b.room))
  // fotos numeradas na ordem em que aparecem no relatório
  let n = 0
  const numerar = (lista: Midia[]) => lista.map((m) => ({ m, num: ++n }))
  const fotosAmb = ambientes.map((amb) => ({ amb, fotos: numerar(fotosDoAmbiente(v, amb.id)) })).filter((x) => x.fotos.length)
  const fotosObs = obs.map((o) => ({ o, fotos: numerar(fotosDaObservacao(v, o.id)) }))
  const temFotos = fotosAmb.length > 0
  const sec = { fotos: temFotos ? 4 : 0, obs: obs.length ? (temFotos ? 5 : 4) : 0 }
  const texto = r.avaliados
    ? `Foram avaliados ${r.avaliados} ambiente(s): ${r.bons} bom(ns), ${r.regulares} regular(es) e ${r.pessimos} péssimo(s).` +
      (r.problemas ? ` Os ambientes com problema estão descritos abaixo, com fotos.` : ' Nenhum ambiente com problema.')
    : 'Nenhum ambiente foi avaliado nesta vistoria.'

  return (
    <article className={`relatorio estilo-${estilo}`}>
      <div className="rel-capa">
        <img src={marca} alt={CFG.orgao_logo_alt} />
        <div>
          <p className="rel-orgao">{CFG.vinculo} · {CFG.secretaria}</p>
          <h1>Relatório de Visita Técnica</h1>
          <p className="rel-sub">{CFG.titulo} · vistoria de {CFG.unidade_tipo} · nº {numero} · emitido em {hojeBR()}</p>
        </div>
      </div>

      <section className="rel-bloco">
        <h2>1. Identificação</h2>
        <table className="rel-ficha"><tbody>
          <tr><th>Unidade</th><td colSpan={3}><strong>{u?.name ?? 'Unidade não encontrada'}</strong></td></tr>
          <tr><th>Tipo</th><td>{u?.kind}</td><th>Distrito sanitário</th><td>{u?.district}</td></tr>
          <tr><th>Endereço</th><td colSpan={3}>{u?.address}</td></tr>
          <tr><th>CNES</th><td>{u?.cnes || 'pendente'}</td><th>Data da vistoria</th><td>{dataBR(v.inspected_on)}</td></tr>
          <tr><th>Vistoriador(a)</th><td colSpan={3}>{v.inspector} · {CFG.secretaria}</td></tr>
        </tbody></table>
      </section>

      <section className="rel-bloco">
        <h2>2. Classificação da unidade</h2>
        <div className={'rel-classif ' + r.nivel.cor}>
          <span className="sinal" aria-hidden="true" />
          <div><small>Classificação</small><strong>Unidade {r.nivel.nome.toLowerCase()}</strong></div>
          <div className="indice"><small>Índice</small><strong>{r.pontos}</strong><small>de 100</small></div>
        </div>
        <div className="rel-kpis">
          <div><strong>{r.avaliados}</strong><span>ambientes avaliados</span></div>
          <div className="k-pessimo"><strong>{r.pessimos}</strong><span>🔴 péssimos</span></div>
          <div className="k-regular"><strong>{r.regulares}</strong><span>🟡 regulares</span></div>
          <div className="k-bom"><strong>{r.bons}</strong><span>🟢 bons</span></div>
          <div><strong>{r.fotos}</strong><span>fotos</span></div>
          <div><strong>{r.observacoes}</strong><span>observações</span></div>
        </div>
        <p className="rel-texto">{texto}</p>
        <p className="rel-regra">Critério: {REGRA_CLASSIFICACAO} Índice: 0 = todos os ambientes bons; 100 = todos péssimos.</p>
      </section>

      <section className="rel-bloco">
        <h2>3. Situação de cada ambiente</h2>
        <table className="rel-tabela">
          <thead><tr><th>Ambiente</th><th>Situação</th><th>O que foi observado</th></tr></thead>
          <tbody>
            {ambientes.map((amb) => {
              const imp = precisaFoto(amb.situacao) ? impactosDoTexto([amb.descricao, ...fotosDoAmbiente(v, amb.id).map((m) => m.caption)].join(' '), 1)[0] : ''
              return (
                <tr key={amb.id} className={'sit-' + (amb.situacao ? semAcento(amb.situacao) : 'nada')}>
                  <td><strong>{amb.name}</strong></td>
                  <td className="sit-cel">{amb.situacao ? `${amb.situacao === 'Bom' ? '🟢' : amb.situacao === 'Regular' ? '🟡' : '🔴'} ${amb.situacao}` : '—'}</td>
                  <td>{amb.descricao || (amb.situacao === 'Bom' ? 'Sem problemas.' : '—')}{imp && <><br /><small className="p-causa">O que causa: {imp}</small></>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {temFotos && (
        <section className="rel-bloco">
          <h2>{sec.fotos}. Registro fotográfico por ambiente</h2>
          {fotosAmb.map(({ amb, fotos }) => (
            <div className="rel-fotos-amb" key={amb.id}>
              <h3>{amb.name} <small>{amb.situacao}</small></h3>
              <div className="rel-fotos">
                {fotos.map(({ m, num }) => (
                  <div className="rel-foto" key={m.id}><span className="f-num">Foto {num}</span><VerMidia media={m} /></div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {obs.length > 0 && (
        <section className="rel-bloco">
          <h2>{sec.obs}. Observações da visita</h2>
          <p className="rel-texto">Demandas e situações registradas durante a visita.</p>
          {fotosObs.map(({ o, fotos }, i) => (
            <div className="rel-obs" key={o.id}>
              <p><strong>{i + 1}. {o.room ? (v.rooms.find((r) => r.id === o.room)?.name ?? 'Ambiente') : 'Geral'}</strong>{o.quem ? ` · relatado por ${o.quem}` : ''}{o.texto.trim() ? ': ' + o.texto : ''}</p>
              {fotos.length > 0 && (
                <div className="rel-fotos">
                  {fotos.map(({ m, num }) => <div className="rel-foto" key={m.id}><span className="f-num">Foto {num}</span><VerMidia media={m} /></div>)}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="rel-bloco rel-assinaturas">
        <div><span />{v.inspector || 'Vistoriador(a)'}<small>Vistoriador(a) da {CFG.secretaria}</small></div>
        <div><span />Responsável pela unidade<small>Nome e matrícula</small></div>
      </section>
      <footer className="rel-rodape">{CFG.orgao} · {CFG.vinculo} · {CFG.secretaria} · {CFG.titulo} · Relatório nº {numero} · {u?.name}</footer>
    </article>
  )
}
