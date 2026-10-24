// =====================================================================================
// POST /api/notify-message  { conversa, mensagem }   (cabeçalho Authorization: Bearer <token do app>)
// O app chama depois de enviar uma mensagem no chat: manda o push para a outra pessoa da conversa.
// Só manda se quem chamou é quem escreveu a mensagem, e só uma vez por mensagem.
//
// O push é SÓ DE DADOS: o app monta a notificação estilo WhatsApp (foto, últimas mensagens,
// Responder, Marcar como lida) mesmo com o app fechado, e marca a mensagem como "entregue".
// Não manda se a pessoa silenciou a conversa, restringiu quem enviou ou bloqueou.
// =====================================================================================
import { FieldValue } from 'firebase-admin/firestore';
import { db, quemChamou, corpo, enviarDados, cors } from './_lib/firebase.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'use POST' });
  const eu = await quemChamou(req);
  if (!eu) return res.status(401).json({ error: 'não autorizado' });
  const { conversa, mensagem } = corpo(req);
  if (typeof conversa !== 'string' || typeof mensagem !== 'string' || conversa.includes('/') || mensagem.includes('/')) {
    return res.status(400).json({ error: 'dados inválidos' });
  }
  const banco = db();
  const conv = await banco.doc(`conversations/${conversa}`).get();
  if (!conv.exists) return res.status(404).json({ error: 'conversa não encontrada' });
  const membros = conv.get('members') || [];
  if (!membros.includes(eu.uid)) return res.status(403).json({ error: 'você não está nesta conversa' });
  const outro = membros.find(u => u !== eu.uid);

  const ref = banco.doc(`conversations/${conversa}/messages/${mensagem}`);
  const m = await banco.runTransaction(async t => {
    const s = await t.get(ref);
    if (!s.exists || s.get('from') !== eu.uid || s.get('pushedAt') || s.get('system')) return null;
    t.update(ref, { pushedAt: FieldValue.serverTimestamp() });
    return s.data();
  });
  if (!m || !outro) return res.status(200).json({ enviado: false });

  // silenciou a conversa / restringiu quem mandou / bloqueou: não avisa
  const c = conv.data();
  if (c.muted?.[outro] === true || c.restricted?.[outro] === true) return res.status(200).json({ enviado: false, motivo: 'silenciada' });
  if ((await banco.doc(`users/${outro}/blocked/${eu.uid}`).get()).exists) return res.status(200).json({ enviado: false });

  const autor = (await banco.doc(`users/${eu.uid}`).get()).data() || {};
  const nome = (c.nicknames?.[eu.uid] || '').trim() || autor.displayName || autor.username || 'Alguém';
  const texto = m.text
    ? (m.image ? '📷 ' : '') + m.text.slice(0, 300)
    : m.image ? '📷 Foto' : m.sticker ? 'Figurinha' : 'Nova mensagem';
  const celulares = await enviarDados(outro, 'message', {
    id: `msg_${conversa}`,
    conversa,
    uid: eu.uid,
    msgId: mensagem,
    nome,
    texto,
    avatar: avatarDe(autor),
    em: m.createdAt?.toMillis?.() ?? Date.now()
  });
  return res.status(200).json({ enviado: celulares > 0, celulares });
}

// mesma regra do app (UserProfile.avatarUrl)
function avatarDe(u) {
  if (u.avatarImg) return u.avatarImg;
  if (!u.avatarSeed && u.photoUrl) return u.photoUrl;
  const seed = u.avatarSeed || u.username || 'waffle';
  return `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(seed)}&backgroundColor=E8A83E`;
}

