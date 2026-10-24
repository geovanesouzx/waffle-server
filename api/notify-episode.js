// =====================================================================================
// POST /api/notify-episode  { contentId, text }   (só o admin; chamado pelo editor do painel)
//
// Avisa todo mundo que tem a obra nos favoritos: grava a notificação no sininho de cada um
// e manda o push (se a pessoa não desligou "Episódios novos").
//
// Precisa de um índice de grupo de coleções (só uma vez): se aparecer erro com um link,
// abra o link e clique em "Criar índice" (ou veja o LEIA-ME do app).
// =====================================================================================
import { FieldValue } from 'firebase-admin/firestore';
import { db, quemChamou, corpo, enviarPush, ADMIN_EMAIL, cors } from './_lib/firebase.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'use POST' });
  const eu = await quemChamou(req);
  if (!eu || eu.email !== ADMIN_EMAIL) return res.status(401).json({ error: 'só o admin pode avisar' });
  const { contentId, text } = corpo(req);
  if (typeof contentId !== 'string' || !contentId || contentId.includes('/')) return res.status(400).json({ error: 'obra inválida' });

  const banco = db();
  const obra = await banco.doc(`content/${contentId}`).get();
  if (!obra.exists) return res.status(404).json({ error: 'obra não encontrada' });
  const titulo = obra.get('title') || 'Um favorito seu';
  const texto = String(text || 'Episódio novo disponível').slice(0, 140);

  let favs;
  try {
    favs = await banco.collectionGroup('favorites').where('contentId', '==', contentId).get();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Falta criar o índice no Firestore (veja o LEIA-ME). ' + (e.message || '') });
  }
  // users/{uid}/favorites/{contentId} -> uid
  const uids = [...new Set(favs.docs.map(d => d.ref.parent.parent?.id).filter(Boolean))];

  const id = `episode_${contentId}_${Date.now()}`;
  for (let i = 0; i < uids.length; i += 400) {
    const lote = banco.batch();
    uids.slice(i, i + 400).forEach(uid => lote.set(banco.doc(`users/${uid}/notifications/${id}`), {
      type: 'episode', fromUid: '', contentId, text: texto, read: false,
      createdAt: FieldValue.serverTimestamp(), pushedAt: FieldValue.serverTimestamp()
    }));
    await lote.commit();
  }

  let celulares = 0;
  for (let i = 0; i < uids.length; i += 20) {
    const r = await Promise.all(uids.slice(i, i + 20).map(uid =>
      enviarPush(uid, 'episode', `Novo episódio de ${titulo}`, texto, { id, contentId }).catch(() => 0)));
    celulares += r.reduce((a, b) => a + b, 0);
  }
  return res.status(200).json({ users: uids.length, celulares });
}
