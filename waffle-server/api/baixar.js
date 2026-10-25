// =====================================================================================
// /baixar  ->  sempre o APK da versão MAIS RECENTE (o mesmo publicado em "Atualizações" no painel,
// que aponta para o GitHub Releases). É o link do QR code dos cards da retrospectiva: o QR nunca
// muda, mas quem escaneia sempre baixa a última versão.
// =====================================================================================
import { db } from './_lib/firebase.js';

export default async function handler(req, res) {
  let apk = '';
  try {
    apk = (await db().doc('config/appUpdate').get()).get('apkUrl') || '';
  } catch (e) {
    console.error('baixar', e);
  }
  // nada de cache: quando sair versão nova, o mesmo QR já leva para ela
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (typeof apk === 'string' && apk.startsWith('https://')) {
    res.writeHead(302, { Location: apk });
  } else {
    res.writeHead(302, { Location: '/' });
  }
  res.end();
}
