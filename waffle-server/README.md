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
| `/.well-known/assetlinks.json` | deixa o Android abrir o app direto pelos links (gerado da variável `ANDROID_SHA256`) |
| `/api/purge-accounts` | Cron diário: apaga de vez as contas com exclusão pedida há mais de 7 dias |

## Variáveis de ambiente (Vercel > Settings > Environment Variables)
- `FIREBASE_SERVICE_ACCOUNT` (obrigatória): o conteúdo inteiro do arquivo `.json` da conta de serviço
  (Firebase > Configurações do projeto > Contas de serviço > Gerar nova chave privada).
- `CRON_SECRET`: qualquer texto secreto (protege o Cron de exclusão de contas).
- `IMGUR_CLIENT_ID` e `CATBOX_USERHASH`: para apagar as imagens enviadas por contas excluídas.

Depois de mudar variáveis, faça um novo deploy (Deployments > ⋯ > Redeploy).

## Avisar episódios novos
`/api/notify-episode` procura quem favoritou a obra com uma consulta de grupo de coleções em `favorites`.
O Firestore pede uma isenção de índice uma vez: Firestore > Índices > Isenções de campo único >
grupo de coleções `favorites`, campo `contentId`, ativar "Escopo do grupo de coleções".

## Links abrindo o app direto (variável ANDROID_SHA256)
Os links `https://waffle-server.vercel.app/o/...` e `/u/...` já funcionam: a página mostra a obra/perfil e o botão
"Abrir no Waffle" abre o app (ou baixa o APK, se o app não estiver instalado).
Para o Android abrir o app **direto**, sem passar pela página, cadastre na Vercel a variável `ANDROID_SHA256`
com a impressão digital SHA-256 da chave que assina o APK (formato `AA:BB:CC:...`; várias separadas por vírgula,
por exemplo a de debug e a de release). O `/.well-known/assetlinks.json` é gerado a partir dela.
Como pegar: Android Studio > aba Gradle > app > Tasks > android > signingReport (linha "SHA-256").
