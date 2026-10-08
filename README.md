# Book Reader

Leitor pessoal de livros em PDF com anotações — roda no navegador, instalável como app (PWA) e funciona offline.

- **Biblioteca**: importe PDFs (botão ou arrastar e soltar); capa, progresso e última página lida.
- **Leitura**: rolagem contínua, zoom (botões, Ctrl+roda, pinça), sumário, busca no texto, temas claro/sépia/escuro.
- **Escrita à mão**: caneta e marca-texto com pressão de stylus, borracha (inclusive a ponta-borracha da caneta), desfazer/refazer. Com stylus detectado, o dedo rola a página (rejeição de palma).
- **Destaques e notas**: selecione texto → escolha a cor ou crie uma nota; notas por página no painel lateral.
- **Buscar livros grátis**: pesquisa no Internet Archive obras em domínio público ou com licença aberta e baixa o PDF direto para a estante.
- **Exportar**: gera um PDF com destaques e traços gravados e as notas como comentários; backup/restauração das anotações em JSON.

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

O Internet Archive permite buscar pelo navegador, mas não envia cabeçalhos CORS nos arquivos. O Worker em `worker/` repassa apenas PDFs de `*.archive.org` e só aceita requisições vindas do app.

```bash
npm run worker:dev     # proxy local em http://localhost:8787 (use VITE_PROXY_URL=http://localhost:8787 em .env.local)
npx wrangler login     # uma vez
npm run worker:deploy  # publica em https://book-proxy.<conta>.workers.dev
gh variable set PROXY_URL --body https://book-proxy.<conta>.workers.dev   # usado pelo build do GitHub Pages
```

Sem `VITE_PROXY_URL`, a busca continua funcionando e o botão abre a página do livro no Internet Archive.

Atalhos: `V` selecionar, `P` caneta, `H` marca-texto, `E` borracha, `Ctrl+Z` / `Ctrl+Shift+Z` desfazer/refazer, `Ctrl +/−/0` zoom, `Ctrl+F` buscar, `←/→` página.

> Para instalar como PWA no tablet a página precisa ser servida via HTTPS (ou `localhost`).
