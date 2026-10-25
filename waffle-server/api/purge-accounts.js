// =====================================================================================
// Exclusão DEFINITIVA de contas (roda 1x por dia pela Vercel Cron, ver vercel.json).
//
// Quando a pessoa toca em "Excluir conta" no app, users/{uid}.deletionRequestedAt é gravado.
// Ela tem 7 dias para recuperar. Passado o prazo, esta função apaga TUDO da conta:
//   - comentários (e respostas a eles), curtidas em comentários, curtidas e avaliações das obras
//   - quem ela segue / quem segue ela (dos dois lados)
//   - users/{uid} inteiro (perfil, favoritos, histórico, lista, notificações, celulares, bloqueados, figurinhas...)
//   - denúncias que ela fez
//   - arquivos de figurinhas que ela enviou (Imgur / Catbox)
//   - a reserva usernames/{@} (o @ fica livre de novo)
//   - a conta do Firebase Authentication
//
// Variáveis de ambiente na Vercel (Settings > Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT  JSON da conta de serviço (Firebase > Configurações > Contas de serviço > Gerar chave)
//   CRON_SECRET               qualquer texto secreto (a Vercel manda no cabeçalho Authorization)
//   IMGUR_CLIENT_ID           Client-ID do Imgur (para apagar as imagens enviadas)
//   CATBOX_USERHASH           userhash do Catbox (para apagar os arquivos enviados)
// =====================================================================================
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

const DIAS = 7;

function app() {
  if (getApps().length) return getApps()[0];
  return initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

async function apagarArquivo(u) {
  try {
    if (u.host === 'imgur' && u.deleteHash && process.env.IMGUR_CLIENT_ID) {
      await fetch(`https://api.imgur.com/3/image/${u.deleteHash}`, {
        method: 'DELETE',
        headers: { Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}` }
      });
    } else if (u.host === 'catbox' && u.fileName && process.env.CATBOX_USERHASH) {
      const form = new FormData();
      form.append('reqtype', 'deletefiles');
      form.append('userhash', process.env.CATBOX_USERHASH);
      form.append('files', u.fileName);
      await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
    }
  } catch (e) {
    console.warn('arquivo não apagado', u.url, e.message);
  }
}

async function apagarConta(db, auth, uid, dados) {
  const user = db.collection('users').doc(uid);
  const w = db.bulkWriter();

  // 1) arquivos enviados (figurinhas)
  const uploads = await user.collection('uploads').get();
  for (const d of uploads.docs) await apagarArquivo(d.data());

  // 2) seguir: remove dos dois lados
  for (const d of (await user.collection('following').get()).docs)
    w.delete(db.collection('users').doc(d.id).collection('followers').doc(uid));
  for (const d of (await user.collection('followers').get()).docs)
    w.delete(db.collection('users').doc(d.id).collection('following').doc(uid));

  // 3) obras: comentários, respostas a eles, curtidas e avaliações
  const obras = await db.collection('content').select().get();
  for (const obra of obras.docs) {
    const comentarios = obra.ref.collection('comments');
    const meus = await comentarios.where('uid', '==', uid).get();
    const ids = meus.docs.map(d => d.id);
    meus.docs.forEach(d => w.delete(d.ref));
    for (let i = 0; i < ids.length; i += 30) {
      const respostas = await comentarios.where('parentId', 'in', ids.slice(i, i + 30)).get();
      respostas.docs.forEach(d => w.delete(d.ref));
    }
    const curtidos = await comentarios.where('likedBy', 'array-contains', uid).get();
    curtidos.docs.forEach(d => { if (!ids.includes(d.id)) w.update(d.ref, { likedBy: FieldValue.arrayRemove(uid) }); });
    w.delete(obra.ref.collection('likes').doc(uid));
    w.delete(obra.ref.collection('ratings').doc(uid));
  }
  await w.close();

  // 3a) conversas (mensagens) em que ela está
  const conversas = await db.collection('conversations').where('members', 'array-contains', uid).get();
  for (const c of conversas.docs) await db.recursiveDelete(c.ref);

  // 3b) denúncias feitas por ela (as feitas contra ela ficam no histórico da moderação)
  const denuncias = await db.collection('reports').where('reporterUid', '==', uid).get();
  if (denuncias.size) {
    const w2 = db.bulkWriter();
    denuncias.docs.forEach(d => w2.delete(d.ref));
    await w2.close();
  }

  // 4) o @ volta a ficar livre
  const username = dados.usernameLower || dados.username;
  if (username) {
    const ref = db.collection('usernames').doc(username);
    const snap = await ref.get();
    if (snap.exists && snap.get('uid') === uid) await ref.delete();
  }

  // 5) users/{uid} com TODAS as subcoleções
  await db.recursiveDelete(user);

  // 6) login
  try { await auth.deleteUser(uid); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }
}

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'não autorizado' });
  }
  const db = getFirestore(app());
  const auth = getAuth(app());
  const limite = Timestamp.fromMillis(Date.now() - DIAS * 24 * 60 * 60 * 1000);
  const vencidas = await db.collection('users').where('deletionRequestedAt', '<=', limite).limit(25).get();

  const resultado = [];
  for (const d of vencidas.docs) {
    try {
      await apagarConta(db, auth, d.id, d.data());
      resultado.push({ uid: d.id, ok: true });
    } catch (e) {
      console.error('falha ao apagar', d.id, e);
      resultado.push({ uid: d.id, ok: false, erro: e.message });
    }
  }
  return res.status(200).json({ apagadas: resultado.filter(r => r.ok).length, resultado });
}
