# Book Reader

Leitor pessoal de livros em PDF e EPUB com anotações — roda no navegador, instalável como app (PWA) e funciona offline.

- **Biblioteca**: importe PDFs e EPUBs (botão ou arrastar e soltar); capa, progresso e última posição lida.
- **EPUB**: texto que se ajusta à tela, com tamanho e fonte ajustáveis, temas, sumário, busca, destaques e notas. Modo página (com toque/deslize nas bordas) ou rolagem. Escrita à mão livre e exportação em PDF são só para PDFs.
- **Leitura**: rolagem contínua, zoom (botões, Ctrl+roda, pinça), sumário, busca no texto, temas claro/sépia/escuro.
- **Escrita à mão**: caneta e marca-texto com pressão de stylus, borracha (inclusive a ponta-borracha da caneta), desfazer/refazer. Com stylus detectado, o dedo rola a página (rejeição de palma).
- **Destaques e notas**: selecione texto → escolha a cor ou crie uma nota; notas por página no painel lateral.
- **Livros grátis** (estilo loja): vitrine com prateleiras (mais baixados, clássicos do idioma, romances, poesia…), gêneros e autores; página de cada livro com capa, resumo, assuntos, "mais do autor" e "mais do gênero"; busca nas duas fontes ao mesmo tempo. Livros do Project Gutenberg (EPUB) e do Internet Archive (PDF/EPUB, domínio público ou licença aberta), baixados direto para a estante; os que já estão nela aparecem marcados.
- **Cadernos** (aba "Cadernos"): pastas por matéria; cadernos com páginas A4 (liso, pautado, quadriculado, pontilhado) ou tela infinita; caneta, marca-texto, borracha, laço (mover, redimensionar, mudar cor, duplicar, copiar/colar), texto, imagens (arquivo, colar, arrastar), formas (linha, seta, retângulo, elipse) e "desenhar e segurar" para endireitar; régua (arrastar, girar com dois dedos, traços retos ao longo da borda, marcações em cm); girar a folha com dois dedos (a página sob os dedos, ou a tela infinita inteira), com "Endireitar"; S Pen escreve e o dedo navega; importar PDF como caderno para escrever por cima; exportar caderno em PDF; capa personalizável (qualquer cor, padrões como listras, couro e kraft, ou uma imagem sua, com o título numa etiqueta), mostrada na lista no lugar da primeira página.
- **Estudo com livros**: envie um trecho destacado para um caderno (com link de volta à página) e abra livro e caderno lado a lado, com divisória ajustável.
- **Rotina** (aba "Rotina"): hábitos do dia a dia (água, academia, leitura, estudo…) feitos ou não, por quantidade ou por tempo, com meta e dias da semana; grade do ano no estilo do GitHub (geral e por hábito), sequências que não quebram em fins de semana, feriados nacionais ou folgas marcadas; leitura e estudo contados sozinhos pelo tempo de uso dos livros e cadernos.
- **Exportar**: gera um PDF com destaques e traços gravados e as notas como comentários; backup/restauração das anotações em JSON.
- **Backup**: em um toque pelo menu "⋯" da Estante (direto no Google Drive, se conectado; no tablet/celular abre o "Compartilhar" para mandar ao Drive ou Arquivos; no computador baixa ou salva sozinho numa pasta escolhida, todo dia em que houver mudanças); aviso na Estante depois de uma semana sem backup; mostra se o armazenamento está protegido.
- **Receber livros**: com o app instalado no Android, "Compartilhar → Book Reader" em qualquer app adiciona o PDF/EPUB à estante; no computador (Chrome/Edge), "Abrir com → Book Reader".

Tudo fica salvo localmente no navegador (IndexedDB). Livros são identificados pelo hash do arquivo, então um backup restaurado em outro dispositivo reconecta as anotações quando o mesmo PDF for importado.

## Uso

```bash
npm install
npm run dev        # http://localhost:5173 (também exposto na rede local para testar no tablet)
npm run test       # testes (Vitest)
npm run build      # build de produção em dist/ (com service worker)
npm run preview    # serve o build
```

## Proxy de download (Cloudflare Worker)

O Internet Archive e o Project Gutenberg permitem buscar pelo navegador, mas não enviam cabeçalhos CORS nos arquivos. O Worker em `worker/` repassa apenas PDFs e EPUBs de `*.archive.org` e `*.gutenberg.org` e só aceita requisições vindas do app.

```bash
npm run worker:dev     # proxy local em http://localhost:8787 (use VITE_PROXY_URL=http://localhost:8787 em .env.local)
npx wrangler login     # uma vez
npm run worker:deploy  # publica em https://book-proxy.<conta>.workers.dev
gh variable set PROXY_URL --body https://book-proxy.<conta>.workers.dev   # usado pelo build do GitHub Pages
```

Sem `VITE_PROXY_URL`, a busca continua funcionando e o botão abre a página do livro no Internet Archive.

## Backup no Google Drive (opcional)

Com um ID de cliente OAuth do Google, o menu "⋯" da Estante ganha "Conectar ao Google Drive": os backups vão direto para uma pasta "Book Reader" no Drive (os 10 mais recentes) e "Restaurar backup" lista os que estão lá. Com o Worker configurado (abaixo), basta conectar uma vez: ao abrir o app, ao voltar para ele e a cada 30 minutos com ele aberto, se o último backup tem mais de um dia e algo mudou, o backup vai ao Drive sozinho, também no celular e no tablet. Sem o Worker, o acesso do Google dura uma hora e é renovado com um toque, então o backup no Drive é em um toque.

1. No [Google Cloud](https://console.cloud.google.com): criar um projeto, ativar a **Google Drive API**, configurar a tela de consentimento OAuth (externa) com o escopo `.../auth/drive.file`.
2. Criar um **ID do cliente OAuth** do tipo "Aplicativo da Web" com as origens JavaScript `https://<usuario>.github.io` e `http://localhost:5173`.
3. `gh variable set GOOGLE_CLIENT_ID --body <id>` (build do GitHub Pages) e `VITE_GOOGLE_CLIENT_ID=<id>` em `.env.local`.

Sem `VITE_GOOGLE_CLIENT_ID`, nada do Drive aparece.

### Backup automático (pelo Worker)

O Worker guarda a autorização de longo prazo do Google (cifrada, no KV) e entrega ao aparelho acessos de uma hora; o aparelho guarda só uma chave própria. Só as contas em `ALLOWED_EMAILS` podem conectar.

1. No cliente OAuth: **URIs de redirecionamento autorizados** `https://<worker>.workers.dev/auth/callback` (e `http://localhost:8788/auth/callback` para testes); copiar a **chave secreta do cliente**.
2. Na tela de consentimento → Branding: página inicial `https://<usuario>.github.io/Book-Reader/`, política de privacidade `https://<usuario>.github.io/Book-Reader/privacidade.html`, domínios autorizados `<usuario>.github.io` e `<worker-subdominio>.workers.dev` (sem logo, para não precisar de verificação). Depois, Público-alvo → **Publicar app**: em modo de teste o Google faz a autorização vencer em 7 dias.
3. Worker: `GOOGLE_CLIENT_ID` em `[vars]` de `worker/wrangler.toml`; `npx wrangler kv namespace create DRIVE_LINKS` e o binding no `wrangler.toml`; segredos (de dentro de `worker/`) `npx wrangler secret put GOOGLE_CLIENT_SECRET`, `TOKEN_KEY` (`openssl rand -base64 32`) e `ALLOWED_EMAILS` (e-mails separados por vírgula). Para testar localmente, os mesmos valores em `worker/.dev.vars`.
4. `npm run worker:deploy`. O app usa o mesmo `VITE_PROXY_URL` do download de livros.

Atalhos no leitor: `V` selecionar, `P` caneta, `H` marca-texto, `E` borracha, `Ctrl+Z` / `Ctrl+Shift+Z` desfazer/refazer, `Ctrl +/−/0` zoom, `Ctrl+F` buscar, `←/→` página.

> Para instalar como PWA no tablet a página precisa ser servida via HTTPS (ou `localhost`).

Atalhos no caderno: `P` caneta, `H` marca-texto, `E` borracha, `L` laço, `T` texto, `S` formas, `R` régua, `Ctrl+C/V/D` copiar/colar/duplicar, `Delete` apagar seleção, espaço + arrastar (ou roda) para mover a tela infinita, `Ctrl` + roda para zoom.
