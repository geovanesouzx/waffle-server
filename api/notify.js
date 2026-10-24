// =====================================================================================
// POST /api/notify  { uid, id }   (cabeçalho Authorization: Bearer <token do Firebase do app>)
//
// O app grava a notificação em users/{uid}/notifications/{id} (as regras conferem a ação) e chama
// esta função, que manda o push para o celular de quem recebeu. Só manda uma vez por notificação
// e só se quem chamou é quem fez a ação.
// =====================================================================================
import { FieldValue } from 'firebase-admin/firestore';
import { db, quemChamou, corpo, enviarPush, cors } from './_lib/firebase.js';

const MAX_IDADE_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'use POST' });
  const eu = await quemChamou(req);
  if (!eu) return res.status(401).json({ error: 'não autorizado' });
  const { uid, id } = corpo(req);
  if (typeof uid !== 'string' || typeof id !== 'string' || !uid || !id || uid.includes('/') || id.includes('/')) {
    return res.status(400).json({ error: 'dados inválidos' });
  }

  const banco = db();
  const ref = banco.doc(`users/${uid}/notifications/${id}`);
  // marca como enviada numa transação: chamar duas vezes não manda dois push
  const n = await banco.runTransaction(async t => {
    const s = await t.get(ref);
    if (!s.exists) return null;
    const d = s.data();
    const idade = Date.now() - (d.createdAt?.toMillis?.() ?? 0);
    if (d.fromUid !== eu.uid || d.pushedAt || idade > MAX_IDADE_MS) return null;
    t.update(ref, { pushedAt: FieldValue.serverTimestamp() });
    return d;
  });
  if (!n) return res.status(200).json({ enviado: false });

  const autor = (await banco.doc(`users/${n.fromUid}`).get()).data() || {};
  const nome = autor.displayName || autor.username || 'Alguém';
  let obra = '';
  if (n.contentId) obra = (await banco.doc(`content/${n.contentId}`).get()).get('title') || '';
  const em = obra ? ` em ${obra}` : '';

  const textos = {
    reply: [`${nome} respondeu você${em}`, n.text || ''],
    mention: [`${nome} mencionou você${em}`, n.text || ''],
    like: [`${nome} curtiu seu comentário`, n.text || ''],
    follow: [`${nome} começou a seguir você`, autor.username ? `@${autor.username}` : 'Toque para ver o perfil']
  };
  const [titulo, texto] = textos[n.type] || [];
  if (!titulo) return res.status(200).json({ enviado: false });

  const celulares = await enviarPush(uid, n.type, titulo, texto, {
    id,
    contentId: n.contentId || '',
    commentId: n.commentId || '',
    parentId: n.parentId || '',
    uid: n.fromUid
  });
  return res.status(200).json({ enviado: celulares > 0, celulares });
}
