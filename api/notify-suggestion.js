// =====================================================================================
// POST /api/notify-suggestion  { id }   (só o admin; o painel chama ao responder uma sugestão)
//
// Avisa quem mandou a sugestão que ela foi respondida (ou mudou de situação).
// O toque na notificação abre "Sugestões e bugs" no app.
// =====================================================================================
import { db, quemChamou, corpo, enviarDados, ADMIN_EMAIL, cors } from './_lib/firebase.js';

const SITUACAO = { seen: 'foi vista', planned: 'vai entrar no app', done: 'já está no app', declined: 'não vai entrar agora' };

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'use POST' });
  const eu = await quemChamou(req);
  if (!eu || eu.email !== ADMIN_EMAIL) return res.status(401).json({ error: 'só o admin pode avisar' });
  const { id } = corpo(req);
  if (typeof id !== 'string' || !id || id.includes('/')) return res.status(400).json({ error: 'sugestão inválida' });

  const s = await db().doc(`suggestions/${id}`).get();
  if (!s.exists) return res.status(404).json({ error: 'sugestão não encontrada' });
  const d = s.data();
  const resposta = (d.reply || '').trim();
  const titulo = resposta ? 'O Waffle respondeu sua sugestão' : `Sua sugestão ${SITUACAO[d.status] || 'foi atualizada'}`;
  const texto = resposta ? resposta.slice(0, 300) : (d.text || '').slice(0, 140);
  const celulares = await enviarDados(d.uid, 'suggestion', {
    id: `suggestion_${id}`, texto, em: Date.now(), title: titulo, body: texto
  });
  return res.status(200).json({ celulares });
}
