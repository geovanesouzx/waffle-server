// =====================================================================================
// POST /api/notify-update  { versionCode, versionName, notes }   (só o admin; chamado ao publicar uma atualização)
//
// Manda um push "Atualização disponível" para TODOS os celulares com o app (users/{uid}/devices).
// Tokens que não valem mais são apagados.
// =====================================================================================
import { getMessaging } from 'firebase-admin/messaging';
import { app, db, quemChamou, corpo, ADMIN_EMAIL, cors } from './_lib/firebase.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'use POST' });
  const eu = await quemChamou(req);
  if (!eu || eu.email !== ADMIN_EMAIL) return res.status(401).json({ error: 'só o admin pode avisar' });
  const { versionCode, versionName, notes } = corpo(req);
  const nome = String(versionName || versionCode || '').slice(0, 20);
  const texto = String(notes || 'Toque para abrir o app e atualizar.').split('\n').find(l => l.trim())?.replace(/^[#\-*\s]+/, '').slice(0, 140) || 'Toque para abrir o app e atualizar.';

  const aparelhos = await db().collectionGroup('devices').get();
  const lista = aparelhos.docs.filter(d => typeof d.get('token') === 'string');
  let enviados = 0;
  for (let i = 0; i < lista.length; i += 500) {
    const parte = lista.slice(i, i + 500);
    const r = await getMessaging(app()).sendEachForMulticast({
      tokens: parte.map(d => d.get('token')),
      // só dados: o app monta a notificação (com as novidades e o botão Atualizar)
      data: {
        tipo: 'update', id: `update_${versionCode}`, versao: nome, texto, notas: String(notes || '').slice(0, 900),
        title: `Atualização disponível: Waffle ${nome}`, body: texto
      },
      android: { priority: 'high' }
    });
    enviados += r.successCount;
    await Promise.all(r.responses.map((x, k) => {
      const c = x.error?.code || '';
      return !x.success && (c.includes('not-registered') || c.includes('invalid-registration-token')) ? parte[k].ref.delete().catch(() => {}) : null;
    }));
  }
  return res.status(200).json({ celulares: lista.length, enviados });
}
