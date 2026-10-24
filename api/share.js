// =====================================================================================
// Página dos links de compartilhar do app:
//   /o/{contentId}  -> obra      (vercel.json manda para /api/share?t=o&id=...)
//   /u/{username}   -> perfil    (vercel.json manda para /api/share?t=u&id=...)
//
// Mostra a capa / avatar (prévia bonita no WhatsApp, Instagram...), tenta abrir o app Waffle
// e, se ele não estiver instalado, oferece baixar a versão publicada em "Atualizações".
// =====================================================================================
import { db, avatarDe } from './_lib/firebase.js';

const PACOTE = 'com.bait.waffle';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const limpo = s => String(s || '').trim().slice(0, 120);

async function dados(tipo, id) {
  try {
    const banco = db();
    const apk = (await banco.doc('config/appUpdate').get()).get('apkUrl') || '';
    if (tipo === 'o') {
      const s = await banco.doc(`content/${id}`).get();
      if (!s.exists) return { apk };
      const d = s.data();
      return {
        apk,
        titulo: d.title,
        texto: (d.overview || '').slice(0, 220),
        imagem: d.backdrop || d.poster,
        info: [d.type === 'movie' ? 'Filme' : 'Série', d.year, (d.genres || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ')
      };
    }
    const u = await banco.doc(`usernames/${id.toLowerCase()}`).get();
    if (!u.exists) return { apk };
    const p = (await banco.doc(`users/${u.get('uid')}`).get()).data() || {};
    if (p.deletionRequestedAt) return { apk };
    return {
      apk,
      titulo: p.displayName || '@' + id,
      texto: p.bio || `Siga @${id} no Waffle`,
      imagem: avatarDe(p),
      info: '@' + (p.username || id),
      avatar: true
    };
  } catch (e) {
    console.error(e);
    return {};
  }
}

// /.well-known/assetlinks.json: deixa o Android abrir o app DIRETO pelos links (sem perguntar).
// A impressão digital vem da variável ANDROID_SHA256 na Vercel (pode ter várias, separadas por vírgula).
function assetlinks(res) {
  const shas = String(process.env.ANDROID_SHA256 || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: PACOTE, sha256_cert_fingerprints: shas }
  }], null, 2));
}

export default async function handler(req, res) {
  if (req.query.t === 'assetlinks') return assetlinks(res);
  const tipo = req.query.t === 'u' ? 'u' : 'o';
  const id = limpo(req.query.id).replace(/[^A-Za-z0-9._\-]/g, '');
  const d = id ? await dados(tipo, id) : {};
  const achou = Boolean(d.titulo);
  const titulo = achou ? d.titulo : 'Waffle';
  const texto = achou ? d.texto : 'Assista animes, séries e filmes, comente e siga seus amigos.';
  const caminho = tipo === 'o' ? `obra/${id}` : `u/${id}`;
  // sem o app instalado, o Android vai direto para o download do APK (quando houver um publicado)
  const reserva = d.apk ? `S.browser_fallback_url=${encodeURIComponent(d.apk)};` : '';
  const intent = `intent://${caminho}#Intent;scheme=waffle;package=${PACOTE};${reserva}end`;
  // tentativa automática ao abrir a página: sem download, só abre o app se ele existir
  const intentAuto = `intent://${caminho}#Intent;scheme=waffle;package=${PACOTE};end`;
  const url = `https://${req.headers.host}${tipo === 'o' ? '/o/' : '/u/'}${id}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200).send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} · Waffle</title>
<meta name="description" content="${esc(texto)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Waffle">
<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(texto)}">
<meta property="og:url" content="${esc(url)}">${d.imagem ? `<meta property="og:image" content="${esc(d.imagem)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="theme-color" content="#000000">
<style>
@font-face{font-family:Pixel;src:url(/fonts/minecraft_regular.otf)}
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#000 radial-gradient(circle at 50% -10%,#e8a83e33,transparent 60%);color:#fff;font-family:Pixel,ui-monospace,monospace;display:grid;place-items:center;padding:16px}
.c{width:min(420px,100%);text-align:center}
.img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:22px;background:#1a1a1a;box-shadow:0 20px 60px #000c}
.img.av{width:140px;height:140px;aspect-ratio:1;border-radius:50%;border:4px solid #e8a83e}
.logo{color:#e8a83e;font-size:22px;letter-spacing:3px;margin:0 0 18px}
h1{font-size:20px;margin:18px 0 4px}.info{color:#e8a83e;font-size:12px}.t{color:#aaa;font-size:12px;line-height:1.6;margin:12px 0 22px}
a.b{display:block;padding:15px;border-radius:16px;text-decoration:none;font-weight:700;margin-top:10px;font-size:13px}
.pri{background:#e8a83e;color:#000}.sec{background:#ffffff14;color:#fff}
small{display:block;color:#666;margin-top:18px;font-size:10px}
</style></head><body><main class="c">
<p class="logo">WAFFLE</p>
${d.imagem ? `<img class="img${d.avatar ? ' av' : ''}" src="${esc(d.imagem)}" alt="">` : ''}
<h1>${esc(titulo)}</h1>${d.info ? `<div class="info">${esc(d.info)}</div>` : ''}
<p class="t">${esc(achou ? texto : (tipo === 'o' ? 'Essa obra não está mais no catálogo.' : 'Esse perfil não existe ou não está disponível.'))}</p>
<a class="b pri" id="abrir" href="${esc(intent)}">Abrir no Waffle</a>
${d.apk ? `<a class="b sec" href="${esc(d.apk)}">Baixar o app (Android)</a>` : ''}
<small>Se nada acontecer ao tocar em "Abrir", instale o Waffle e toque no link de novo.</small>
</main><script>
// no Android, tenta abrir o app direto
if (/Android/i.test(navigator.userAgent)) setTimeout(function(){ location.href = ${JSON.stringify(intentAuto)}; }, 300);
</script></body></html>`);
}
