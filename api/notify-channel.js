// =====================================================================================
// POST /api/notify-channel  { post }   (só o admin; o painel chama depois de postar no canal)
//
// Avisa TODO MUNDO que tem o app que saiu um post novo no canal oficial do Waffle.
// Quem desligou "Canal Waffle" nas notificações (users/{uid}/private/notifications.channel = false)
// não recebe. Só manda uma vez por post (channelPosts/{post}.pushedAt).
// O push é só de dados: o app monta a notificação (foto do canal, texto e a imagem do post).
// =====================================================================================
import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { app, db, quemChamou, corpo, ADMIN_EMAIL, cors } from './_lib/firebase.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'use POST' });
  const eu = await quemChamou(req);
  if (!eu || eu.email !== ADMIN_EMAIL) return res.status(401).json({ error: 'só o admin pode avisar' });
  const { post } = corpo(req);
  if (typeof post !== 'string' || !post || post.includes('/')) return res.status(400).json({ error: 'post inválido' });

  const banco = db();
  const ref = banco.doc(`channelPosts/${post}`);
  const p = await banco.runTransaction(async t => {
    const s = await t.get(ref);
    if (!s.exists || s.get('pushedAt')) return null;
    t.update(ref, { pushedAt: FieldValue.serverTimestamp() });
    return s.data();
  });
  if (!p) return res.status(200).json({ enviados: 0, motivo: 'já avisado ou não existe' });

  const canal = (await banco.doc('config/channel').get()).data() || {};
  const nome = (canal.name || 'Waffle').slice(0, 40);
  const texto = (p.text || '').trim()
    ? (p.video ? '🎥 ' : p.image ? '📷 ' : '') + p.text.trim().slice(0, 300)
    : p.video ? '🎥 Vídeo novo no canal' : p.image ? '📷 Foto nova no canal' : p.sticker ? 'Figurinha nova no canal' : 'Post novo no canal';
  const imagem = p.image?.url || p.video?.thumb || '';

  const aparelhos = await banco.collectionGroup('devices').get();
  const lista = aparelhos.docs.filter(d => typeof d.get('token') === 'string');
  // quem desligou o canal
  const uids = [...new Set(lista.map(d => d.ref.parent.parent?.id).filter(Boolean))];
  const desligados = new Set();
  for (let i = 0; i < uids.length; i += 300) {
    const refs = uids.slice(i, i + 300).map(u => banco.doc(`users/${u}/private/notifications`));
    const docs = refs.length ? await banco.getAll(...refs) : [];
    docs.forEach(d => { if (d.exists && d.get('channel') === false) desligados.add(d.ref.parent.parent.id); });
  }
  const alvo = lista.filter(d => !desligados.has(d.ref.parent.parent?.id));

  let enviados = 0;
  for (let i = 0; i < alvo.length; i += 500) {
    const parte = alvo.slice(i, i + 500);
    const r = await getMessaging(app()).sendEachForMulticast({
      tokens: parte.map(d => d.get('token')),
      data: {
        tipo: 'channel', id: `channel_${post}`, post, nome, texto, imagem,
        avatar: canal.avatarUrl || '', em: String(p.createdAt?.toMillis?.() ?? Date.now()),
        title: nome, body: texto
      },
      android: { priority: 'high', ttl: 3 * 24 * 3600 * 1000 }
    });
    enviados += r.successCount;
    await Promise.all(r.responses.map((x, k) => {
      const c = x.error?.code || '';
      return !x.success && (c.includes('not-registered') || c.includes('invalid-registration-token')) ? parte[k].ref.delete().catch(() => {}) : null;
    }));
  }
  return res.status(200).json({ celulares: alvo.length, enviados, desligaram: desligados.size });
}
