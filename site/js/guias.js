/* Manual do fiscal: o que cobrar e o que fazer em cada tipo de problema.
   Usado nas notícias da mídia, nos alertas, nas obras e nas missões. Edite aqui para melhorar as orientações. */
"use strict";
window.GUIAS = {
  falta: {
    ic: "📦", titulo: "Falta de serviço, profissional ou material",
    quando: "Falta remédio, médico, professor, merenda, água, energia ou outro item básico.",
    cobrar: ["Data exata para a reposição ou para o profissional voltar", "Quantidade em estoque e quando foi feito o último pedido de compra",
      "Plano para não faltar de novo (contrato, ata de registro de preços, escala)"],
    fazer: ["Ir ao local e confirmar a falta (fotografar prateleira, aviso, sala vazia)", "Conversar com 3 pessoas que estão sendo atendidas e anotar o que dizem",
      "Pedir à direção da unidade o documento do último pedido feito à secretaria", "Registrar tudo na Atividade do dia e voltar na data prometida"],
    aquem: "Direção da unidade → secretaria responsável → Ouvidoria. Se continuar, Ministério Público.",
  },
  demora: {
    ic: "⏳", titulo: "Fila, demora ou superlotação",
    quando: "Fila grande, espera longa, atendimento atrasado ou unidade lotada.",
    cobrar: ["Tempo médio de espera hoje e meta da secretaria", "Quantos profissionais deveriam estar na escala e quantos estão",
      "O que será feito para reduzir a fila e em quanto tempo"],
    fazer: ["Chegar no horário de pico e contar quantas pessoas esperam", "Fotografar a fila e o quadro de escala (se estiver à vista)",
      "Perguntar o horário de chegada de algumas pessoas para medir a espera", "Registrar e repetir a visita em outro dia para comparar"],
    aquem: "Coordenação da unidade → secretaria → Ouvidoria.",
  },
  estrutura: {
    ic: "🏚️", titulo: "Prédio ou equipamento em más condições",
    quando: "Infiltração, goteira, mofo, equipamento quebrado, lixo, esgoto, risco de desabamento.",
    cobrar: ["Prazo para o conserto e quem vai fazer (equipe própria ou empresa)", "Se já existe contrato de manutenção e quanto já foi pago a ele",
      "Laudo da Defesa Civil se houver risco para as pessoas"],
    fazer: ["Fotografar cada problema de perto e de longe, com data", "Ver se há contrato de manutenção nos gastos da secretaria (botão Despesas)",
      "Perguntar à direção quando o problema foi informado à secretaria e pedir o protocolo", "Se houver risco, avisar o administrador na hora"],
    aquem: "Direção → secretaria (setor de manutenção) → Defesa Civil se houver risco.",
  },
  obra: {
    ic: "🏗️", titulo: "Obra ou unidade parada",
    quando: "Obra sem trabalhadores, prazo vencido, unidade interditada ou abandonada.",
    cobrar: ["Cronograma da obra e motivo da parada", "Quanto já foi pago e quanto da obra está pronto (medições)",
      "Nova data de entrega assinada pela secretaria"],
    fazer: ["Fotografar a placa da obra (valor, empresa, prazo) e o estado atual", "Contar trabalhadores e máquinas no local",
      "Comparar com o que foi pago no botão Obras e reformas", "Pedir pela Lei de Acesso à Informação o contrato e as medições"],
    aquem: "Secretaria responsável pela obra → Controladoria → Tribunal de Contas.",
  },
  pessoal: {
    ic: "👷", titulo: "Servidores, salários e greve",
    quando: "Salário atrasado, greve, paralisação, protesto de servidores ou terceirizados.",
    cobrar: ["Data do pagamento atrasado e o motivo", "Se a empresa terceirizada recebeu do governo (ver Fornecedores)",
      "Plano para manter o atendimento à população durante a greve"],
    fazer: ["Ouvir a categoria e anotar as reivindicações", "Ver nos gastos se a secretaria pagou a empresa terceirizada",
      "Verificar se o atendimento à população foi afetado e fotografar", "Registrar e acompanhar a negociação"],
    aquem: "Secretaria → Secretaria de Gestão/Fazenda → Ministério Público do Trabalho (terceirizados).",
  },
  irregularidade: {
    ic: "⚖️", titulo: "Investigação ou suspeita de irregularidade",
    quando: "Operação policial, Ministério Público, Tribunal de Contas, CPI, suspeita de fraude ou superfaturamento.",
    cobrar: ["Posição oficial da secretaria e medidas tomadas", "Se o contrato citado foi suspenso",
      "Cópia do contrato e dos pagamentos (Lei de Acesso à Informação)"],
    fazer: ["Procurar a empresa citada no botão Fornecedores e ver quanto recebeu", "Guardar o link da notícia e a data",
      "Não acusar ninguém: anotar só fatos e documentos", "Levar ao administrador antes de qualquer cobrança pública"],
    aquem: "Administrador do time decide o encaminhamento (Controladoria, Tribunal de Contas, Ministério Público).",
  },
  vida: {
    ic: "🚑", titulo: "Risco à vida ou à segurança",
    quando: "Mortes, acidentes, violência, negligência no atendimento.",
    cobrar: ["O que a secretaria está fazendo para apurar o caso", "Se há sindicância aberta e o prazo",
      "Medidas para evitar que se repita"],
    fazer: ["Avisar o administrador na hora", "Reunir as notícias e os documentos públicos sobre o caso",
      "Visitar a unidade só com cuidado e respeito às famílias", "Acompanhar a resposta oficial"],
    aquem: "Administrador do time → secretaria → Ministério Público.",
  },
  gasto: {
    ic: "💸", titulo: "Gasto fora do padrão",
    quando: "Compras divididas, fornecedor concentrando gastos, valor muito alto, empresa nova ou punida.",
    cobrar: ["O processo completo da compra (pedir pela Lei de Acesso à Informação)", "Justificativa para não ter licitação ou para o valor",
      "Comprovação de que o produto ou serviço foi entregue"],
    fazer: ["Abrir o fornecedor no site e ver em quais secretarias ele recebe", "Conferir se a empresa existe no endereço informado",
      "Comparar o preço com compras parecidas de outros órgãos", "Registrar o pedido de informação e o prazo de resposta (20 dias)"],
    aquem: "Secretaria → Controladoria → Tribunal de Contas.",
  },
  reclamacao: {
    ic: "📣", titulo: "Reclamação da população",
    quando: "Denúncias, reclamações, críticas ou suspensão de serviços.",
    cobrar: ["Resposta oficial da secretaria sobre a reclamação", "Prazo para resolver", "Quem é o responsável pelo serviço"],
    fazer: ["Ir ao local e confirmar se o problema existe", "Ouvir quem reclamou", "Fotografar e registrar", "Voltar no prazo prometido"],
    aquem: "Ouvidoria → secretaria responsável.",
  },
};
const MOTIVO_GUIA = {
  falta: "falta", "sem água": "falta", "sem energia": "falta", "sem médico": "falta", "sem professor": "falta", "sem aula": "falta",
  escassez: "falta", desabastecimento: "falta", fila: "demora", superlotação: "demora", atraso: "demora",
  precariedade: "estrutura", infiltração: "estrutura", goteira: "estrutura", mofo: "estrutura", quebrado: "estrutura", danificado: "estrutura",
  desabamento: "estrutura", sucateamento: "estrutura", ratos: "estrutura", lixo: "estrutura", esgoto: "estrutura", buraco: "estrutura",
  alagamento: "estrutura", vazamento: "estrutura", "obra parada": "obra", paralisação: "obra", abandono: "obra", interdição: "obra",
  greve: "pessoal", salários: "pessoal", calote: "pessoal", protesto: "pessoal",
  irregularidade: "irregularidade", investigação: "irregularidade", "Ministério Público": "irregularidade", "Tribunal de Contas": "irregularidade",
  CPI: "irregularidade", "operação policial": "irregularidade", "Polícia Federal": "irregularidade", prisão: "irregularidade",
  afastamento: "irregularidade", superfaturamento: "irregularidade", "suspeita de fraude": "irregularidade", "suspeita de desvio": "irregularidade",
  propina: "irregularidade", processo: "irregularidade", condenação: "irregularidade", multa: "irregularidade",
  morte: "vida", óbito: "vida", acidente: "vida", negligência: "vida", violência: "vida", insegurança: "vida",
};
const ALERTA_GUIA = { obra_parada: "obra", fracionamento: "gasto", concentracao: "gasto", fora_da_curva: "gasto", empresa_nova: "gasto",
  sancionada: "gasto", inconsistencia: "gasto", transparencia: "gasto", data_incomum: "gasto" };
const MISSAO_GUIA = { obra: "obra", escola: "estrutura", saude: "demora", gasto: "gasto" };

window.guiaPor = {
  motivos: (ms) => { for (const p of ["vida", "irregularidade", "obra", "falta", "estrutura", "demora", "pessoal"]) if ((ms || []).some((m) => MOTIVO_GUIA[m] === p)) return p; return "reclamacao"; },
  alerta: (tipo) => ALERTA_GUIA[tipo] || "gasto",
  missao: (tipo) => MISSAO_GUIA[tipo] || "reclamacao",
};
/* Bloco "Como agir" reutilizável: dois botões que abrem o que cobrar e o passo a passo. */
window.comoAgir = (chave, esc) => {
  const g = window.GUIAS[chave];
  if (!g) return "";
  return `<div class="agir"><details><summary>${g.ic} O que cobrar</summary><ul class="checklist">${g.cobrar.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <p class="explica" style="margin-top:6px"><b>A quem:</b> ${esc(g.aquem)}</p></details>
    <details><summary>🧭 O que fazer</summary><ol class="checklist">${g.fazer.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details></div>`;
};
