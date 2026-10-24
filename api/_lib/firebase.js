// Peças compartilhadas pelas funções da Vercel (pastas com "_" não viram rotas).
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const ADMIN_EMAIL = 'jeosouzazouza@gmail.com';

/**
 * Libera chamadas vindas de outro site (o painel fica em outro projeto da Vercel).
 * Seguro com "*": quem chama sempre se identifica pelo token do Firebase (não há cookies).
 * Devolve true quando era só a "pergunta" do navegador (OPTIONS) e já respondeu.
 */
export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

export function app() {
  if (getApps().length) return getApps()[0];
  return initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

export const db = () => getFirestore(app());

/** Quem está chamando (token do Firebase Auth no cabeçalho Authorization: Bearer ...). null = inválido. */
export async function quemChamou(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try { return await getAuth(app()).verifyIdToken(h.slice(7)); } catch { return null; }
}

/** Corpo da requisição já como objeto (a Vercel às vezes entrega como texto). */
export function corpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

// tipo da notificação -> chave em users/{uid}/private/notifications
const PREF = { reply: 'replies', mention: 'mentions', like: 'likes', follow: 'follows', episode: 'episodes', message: 'messages' };

/**
 * Manda o push para todos os celulares de [uid] (users/{uid}/devices), se ele não desligou esse tipo.
 * Tokens que não valem mais são apagados. Devolve quantos celulares receberam.
 */
export async function enviarPush(uid, tipo, titulo, texto, dados = {}, detalhes = null) {
  const banco = db();
  const prefs = await banco.doc(`users/${uid}/private/notifications`).get();
  if (PREF[tipo] && prefs.exists && prefs.get(PREF[tipo]) === false) return 0;
  const aparelhos = await banco.collection(`users/${uid}/devices`).get();
  const lista = aparelhos.docs.filter(d => typeof d.get('token') === 'string');
  if (!lista.length) return 0;
  // todos os valores de "data" precisam ser texto
  const data = Object.fromEntries(Object.entries({ ...dados, tipo }).map(([k, v]) => [k, v == null ? '' : String(v)]));
  const r = await getMessaging(app()).sendEachForMulticast({
    tokens: lista.map(d => d.get('token')),
    notification: { title: titulo.slice(0, 120), body: texto.slice(0, 240) },
    data,
    android: {
      priority: 'high',
      collapseKey: data.id || undefined,
      notification: { channelId: 'waffle_social', icon: 'ic_notificacao', color: '#E8A83E', tag: data.id || undefined }
    }
  });
  await Promise.all(r.responses.map((x, i) => {
    const codigo = x.error?.code || '';
    if (!x.success && (codigo.includes('registration-token-not-registered') || codigo.includes('invalid-registration-token') || codigo.includes('invalid-argument'))) {
      return lista[i].ref.delete().catch(() => {});
    }
    return null;
  }));
  if (detalhes) detalhes.erros = r.responses.filter(x => !x.success).map(x => x.error?.code || x.error?.message || 'erro');
  return r.successCount;
}

/**
 * Push SÓ DE DADOS (sem "notification"): o app monta a notificação sozinho, mesmo FECHADO.
 * Usado no chat para a notificação estilo WhatsApp (foto, histórico, Responder).
 */
export async function enviarDados(uid, tipo, dados = {}) {
  const banco = db();
  const prefs = await banco.doc(`users/${uid}/private/notifications`).get();
  if (PREF[tipo] && prefs.exists && prefs.get(PREF[tipo]) === false) return 0;
  const aparelhos = await banco.collection(`users/${uid}/devices`).get();
  const lista = aparelhos.docs.filter(d => typeof d.get('token') === 'string');
  if (!lista.length) return 0;
  const data = Object.fromEntries(Object.entries({ ...dados, tipo }).map(([k, v]) => [k, v == null ? '' : String(v)]));
  const r = await getMessaging(app()).sendEachForMulticast({
    tokens: lista.map(d => d.get('token')),
    data,
    // alta prioridade: acorda o celular na hora; vale por 4 semanas se o celular estiver desligado
    android: { priority: 'high', ttl: 28 * 24 * 3600 * 1000 }
  });
  await Promise.all(r.responses.map((x, i) => {
    const codigo = x.error?.code || '';
    if (!x.success && (codigo.includes('registration-token-not-registered') || codigo.includes('invalid-registration-token') || codigo.includes('invalid-argument'))) {
      return lista[i].ref.delete().catch(() => {});
    }
    return null;
  }));
  return r.successCount;
}

