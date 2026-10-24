# Waffle Server

Servidor do app Waffle na Vercel (separado do painel `waffle-admin`). Não tem tela: só funções.

| Endereço | O que faz |
|---|---|
| `POST /api/notify` | push de resposta, menção, curtida e novo seguidor (chamado pelo app) |
| `POST /api/notify-message` | push das mensagens do chat, só de dados (o app monta a notificação estilo WhatsApp) |
| `POST /api/notify-episode` | aviso de episódio novo para quem favoritou (chamado pelo painel, só o admin) |
| `POST /api/notify-update` | aviso de atualização do app para todos (chamado pelo painel, só o admin) |
| `POST /api/test-push` | "Testar notificação" do app |
| `GET /api/push-status` | o painel confere se o push está configurado |
| `/o/{obra}` e `/u/{@}` | páginas dos links de compartilhar (abrem o app) |
| `/.well-known/assetlinks.json` | deixa o Android abrir o app direto pelos links |
| `/api/purge-accounts` | Cron diário: apaga de vez as contas com exclusão pedida há mais de 7 dias |

## Variáveis de ambiente (Vercel > Settings > Environment Variables)
- `FIREBASE_SERVICE_ACCOUNT` (obrigatória): o conteúdo inteiro do arquivo `.json` da conta de serviço
  (Firebase > Configurações do projeto > Contas de serviço > Gerar nova chave privada).
- `CRON_SECRET`: qualquer texto secreto (protege o Cron de exclusão de contas).
- `IMGUR_CLIENT_ID` e `CATBOX_USERHASH`: para apagar as imagens enviadas por contas excluídas.

Depois de mudar variáveis, faça um novo deploy (Deployments > ⋯ > Redeploy).

## Abrir o app pelos links (opcional)
Em `public/.well-known/assetlinks.json`, troque o texto do `sha256_cert_fingerprints` pelo SHA-256 da chave que
assina o APK (Android Studio > Gradle > signingReport, ou `keytool -list -v -keystore sua-chave.jks`).

## Avisar episódios novos
`/api/notify-episode` procura quem favoritou a obra com uma consulta de grupo de coleções em `favorites`.
O Firestore pede uma isenção de índice uma vez: Firestore > Índices > Isenções de campo único >
grupo de coleções `favorites`, campo `contentId`, ativar "Escopo do grupo de coleções".
