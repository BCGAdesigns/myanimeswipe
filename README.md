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

O workflow `.github/workflows/pages.yml` roda testes e build em todo push. No branch padrão, ele publica o `dist/` no branch `gh-pages`, que o GitHub Pages serve (modo "Deploy from a branch").

* O repositório precisa ser público, a menos que a conta tenha plano pago (Pro, Team ou Enterprise).
* O Pages foi ligado automaticamente quando o branch `gh-pages` foi criado. Se um dia ele for desligado, reative em **Settings → Pages** com **Source: Deploy from a branch**, branch `gh-pages`, pasta `/ (root)`.

Endereço: https://bcgadesigns.github.io/myanimeswipe/. Abra no celular e use "Adicionar à tela inicial" para instalar.

`dist/` é estático e usa caminhos relativos, então também serve em Vercel ou Netlify sem mudanças.

## Estrutura

* `src/logic.ts`: regras puras (classificação dos gestos, baralho, fila de notas), coberto por testes.
* `src/sources/anilist.ts`: consulta GraphQL e conversão para o modelo genérico `Media`.
* `src/db.ts`: IndexedDB (catálogo, animes, swipes e notas).
* `src/store.tsx`: estado do app, desfazer, exportar/importar.
* `src/components/`: abas (Descobrir, Avaliar, Para você, Listas) e cards.
