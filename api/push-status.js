// =====================================================================================
// GET /api/push-status   Confere se o servidor de notificações está pronto (usado no Painel).
// Não precisa de login e não mostra nenhum dado secreto: só diz o que está faltando.
// =====================================================================================
import { app, cors } from './_lib/firebase.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) {
    return res.status(200).json({ ok: false, erro: 'Falta a variável FIREBASE_SERVICE_ACCOUNT na Vercel (Settings > Environment Variables). Depois faça um novo deploy.' });
  }
  let conta;
  try { conta = JSON.parse(bruto); } catch {
    return res.status(200).json({ ok: false, erro: 'FIREBASE_SERVICE_ACCOUNT não é um JSON válido. Cole o conteúdo inteiro do arquivo .json da conta de serviço.' });
  }
  if (conta.project_id && conta.project_id !== 'waffle-anime') {
    return res.status(200).json({ ok: false, erro: `A chave é do projeto "${conta.project_id}", mas o app usa "waffle-anime".` });
  }
  try {
    const credencial = app().options.credential;
    await credencial.getAccessToken();
    return res.status(200).json({ ok: true, projeto: conta.project_id || '' });
  } catch (e) {
    return res.status(200).json({ ok: false, erro: 'A chave foi recusada pelo Google: ' + (e.message || e) + '. Gere uma chave nova em Configurações do projeto > Contas de serviço.' });
  }
}
