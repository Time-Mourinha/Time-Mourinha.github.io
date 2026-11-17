/**
 * Fiscalização · Google Drive
 * Recebe do app os PDFs dos relatórios e as fotos e guarda numa pasta do Google Drive desta conta:
 *   {{PASTA}} / <unidade> / <data> · vistoria <nº>
 * Só aceita quem está logado e APROVADO no app (confere o login no Supabase).
 * Arquivos ficam "qualquer pessoa com o link pode ver" para aparecerem no relatório do app.
 */
var SUPABASE_URL = '{{SUPABASE_URL}}';
var SUPABASE_CHAVE = '{{SUPABASE_CHAVE}}';   // chave pública (a mesma que o site usa)
var PASTA_RAIZ = '{{PASTA}}';

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var quem = usuario_(d.token);
    if (!quem) return json_({ erro: 'acesso negado: entre no app com uma conta aprovada.' });
    if (d.acao === 'enviar') {
      var pasta = pastaDaVistoria_(d.unidade, d.data, d.vistoria, true);
      // regerar o relatório substitui o arquivo de mesmo nome
      var velhos = pasta.getFilesByName(d.nome);
      while (velhos.hasNext()) velhos.next().setTrashed(true);
      var blob = Utilities.newBlob(Utilities.base64Decode(d.base64), d.tipo, d.nome);
      var arq = pasta.createFile(blob);
      arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return json_({ id: arq.getId(), url: arq.getUrl(), pasta: pasta.getUrl() });
    }
    if (d.acao === 'apagar') {
      var p = pastaDaVistoria_(null, null, d.vistoria, false);
      if (p) p.setTrashed(true);
      return json_({ ok: true });
    }
    if (d.acao === 'teste') return json_({ ok: true, pasta: raiz_().getUrl() });
    return json_({ erro: 'ação desconhecida' });
  } catch (err) {
    return json_({ erro: String(err && err.message || err) });
  }
}

function doGet() { return json_({ ok: true, servico: 'Fiscalização · Google Drive' }); }

/** Confere o login no Supabase e se a conta está aprovada. */
function usuario_(token) {
  if (!token) return null;
  var cab = { apikey: SUPABASE_CHAVE, Authorization: 'Bearer ' + token };
  var r = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user', { headers: cab, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  var id = JSON.parse(r.getContentText()).id;
  var p = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/profiles?select=approved,role&id=eq.' + id, { headers: cab, muteHttpExceptions: true });
  var lista = JSON.parse(p.getContentText() || '[]');
  return lista.length && lista[0].approved ? lista[0] : null;
}

function raiz_() {
  var it = DriveApp.getFoldersByName(PASTA_RAIZ);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PASTA_RAIZ);
}

/** Pasta de uma vistoria; acha pelo nº (as 8 primeiras letras do id) em qualquer unidade. */
function pastaDaVistoria_(unidade, data, vistoria, criar) {
  var marca = 'vistoria ' + String(vistoria).slice(0, 8).toUpperCase();
  var achou = DriveApp.searchFolders("title contains '" + marca + "' and trashed = false");
  if (achou.hasNext()) return achou.next();
  if (!criar) return null;
  var raiz = raiz_();
  var nomeU = String(unidade).replace(/[\/\\]/g, '-').slice(0, 120);
  var it = raiz.getFoldersByName(nomeU);
  var pastaU = it.hasNext() ? it.next() : raiz.createFolder(nomeU);
  return pastaU.createFolder(data + ' · ' + marca);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
