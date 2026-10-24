// =====================================================================================
// POST /api/test-push   (cabeçalho Authorization: Bearer <token do app>)
// Manda uma notificação de TESTE para os celulares de quem chamou e explica o que deu errado.
// Usado em Configurações > Notificações > "Testar notificação".
// =====================================================================================
import { db, quemChamou, enviarDados, cors } from './_lib/firebase.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'use POST' });
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return res.status(500).json({ error: 'Falta a variável FIREBASE_SERVICE_ACCOUNT na Vercel (Settings > Environment Variables). Depois faça um novo deploy.' });
  }
  let eu;
  try { eu = await quemChamou(req); } catch (e) { return res.status(500).json({ error: 'A chave FIREBASE_SERVICE_ACCOUNT está inválida: ' + e.message }); }
  if (!eu) return res.status(401).json({ error: 'Sessão inválida. Saia e entre de novo no app.' });

  try {
    const aparelhos = await db().collection(`users/${eu.uid}/devices`).get();
    if (aparelhos.empty) return res.status(400).json({ error: 'Este celular ainda não foi registrado. Feche e abra o app com a internet ligada.' });
    const detalhes = {};
    const enviados = await enviarDados(eu.uid, 'test', {
      id: 'teste_' + Date.now(),
      title: 'Teste do Waffle', body: 'Se você está vendo isso, as notificações estão funcionando!',
      texto: 'Se você está vendo isso, as notificações estão funcionando, até com o app fechado.'
    }, detalhes);
    if (!enviados) {
      return res.status(500).json({ error: 'O Firebase recusou o envio: ' + (detalhes.erros || []).join(', ') + '. Confira se a "Firebase Cloud Messaging API (V1)" está ativada no Google Cloud do projeto waffle-anime.' });
    }
    return res.status(200).json({ ok: true, celulares: aparelhos.size, enviados });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Falha ao enviar' });
  }
}
