# Book Reader

Leitor pessoal de livros em PDF com anotações — roda no navegador, instalável como app (PWA) e funciona offline.

- **Biblioteca**: importe PDFs (botão ou arrastar e soltar); capa, progresso e última página lida.
- **Leitura**: rolagem contínua, zoom (botões, Ctrl+roda, pinça), sumário, busca no texto, temas claro/sépia/escuro.
- **Escrita à mão**: caneta e marca-texto com pressão de stylus, borracha (inclusive a ponta-borracha da caneta), desfazer/refazer. Com stylus detectado, o dedo rola a página (rejeição de palma).
- **Destaques e notas**: selecione texto → escolha a cor ou crie uma nota; notas por página no painel lateral.
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

Atalhos: `V` selecionar, `P` caneta, `H` marca-texto, `E` borracha, `Ctrl+Z` / `Ctrl+Shift+Z` desfazer/refazer, `Ctrl +/−/0` zoom, `Ctrl+F` buscar, `←/→` página.

> Para instalar como PWA no tablet a página precisa ser servida via HTTPS (ou `localhost`).
