# MyAnimeSwipe

PWA estilo Tinder para catalogar animes: marque o que já viu, o que quer ver e o que não quer, dê nota de 0 a 10 e (em breve) receba recomendações. Dados do [AniList](https://anilist.co), com selo de Crunchyroll e link para o MyAnimeList.

Decisões de produto e roadmap: [SPEC.md](SPEC.md).

## Rodar

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm test           # testes unitários
npm run build      # typecheck + build de produção em dist/
npm run preview    # serve o build (necessário para testar o PWA/service worker)
```

Para abrir no celular durante o desenvolvimento: `npm run dev -- --host` e acesse o IP da máquina na mesma rede.

## Publicar

`dist/` é estático e usa caminhos relativos, então serve em qualquer host (Vercel, Netlify, GitHub Pages). Depois de publicado, abra no celular e use "Adicionar à tela inicial" para instalar.

## Estrutura

* `src/logic.ts`: regras puras (classificação dos gestos, baralho, fila de notas), coberto por testes.
* `src/sources/anilist.ts`: consulta GraphQL e conversão para o modelo genérico `Media`.
* `src/db.ts`: IndexedDB (catálogo, animes, swipes e notas).
* `src/store.tsx`: estado do app, desfazer, exportar/importar.
* `src/components/`: abas e cards.
