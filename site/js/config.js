// Configuração do Time Mourinha.
// Depois de criar o projeto no Supabase, cole aqui a "Project URL" e a chave "anon public"
// (Supabase → Project Settings → API). A chave "anon" pode ficar pública: quem protege os
// dados são as regras de segurança criadas pelo arquivo docs/supabase.sql.
window.MOURINHA = {
  SUPABASE_URL: "https://apqkewsdzwawtiajbmyl.supabase.co",
  SUPABASE_ANON_KEY: "",

  // Integrantes do time (aparecem no cadastro para cada um escolher o seu nome).
  MEMBROS: [
    { id: "mourinha",   nome: "Mourinha",   funcao: "Chefe do time" },
    { id: "orlandinho", nome: "Orlandinho", funcao: "Administrador" },
    { id: "bene",       nome: "Bené",       funcao: "Administrador" },
    { id: "diogo",      nome: "Diogo",      funcao: "Fiscal" },
    { id: "fabio",      nome: "Fábio",      funcao: "Fiscal" },
    { id: "hamona",    nome: "Hamona",    funcao: "Fiscal" },
    { id: "ricardo",    nome: "Ricardo",    funcao: "Fiscal" },
  ],

  TIPOS_ATIVIDADE: ["Visita", "Reunião", "Pedido de informação", "Acompanhamento de obra", "Denúncia recebida", "Outro"],
};
