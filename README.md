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

Hospedado na Vercel, que publica sozinha a cada push. Configuração (uma vez só):

1. Em https://vercel.com/new, entre com a conta do GitHub e importe `BCGAdesigns/myanimeswipe`.
2. Mantenha o que a Vercel detectar (Framework Preset: Vite, saída em `dist`) e toque em **Deploy**.

O branch padrão do repositório vira produção; pushes em outros branches geram previews com URL própria. O endereço de produção aparece no painel da Vercel. Abra no celular e use "Adicionar à tela inicial" para instalar.

O workflow `.github/workflows/ci.yml` roda testes e build em todo push.

`dist/` é estático e usa caminhos relativos, então também serve em outros hosts (Netlify, GitHub Pages) sem mudanças.

## Estrutura

* `src/logic.ts`: regras puras (classificação dos gestos, baralho, fila de notas), coberto por testes.
* `src/sources/anilist.ts`: consulta GraphQL e conversão para o modelo genérico `Media`.
* `src/db.ts`: IndexedDB (catálogo, animes, swipes e notas).
* `src/store.tsx`: estado do app, desfazer, exportar/importar.
* `src/components/`: abas (Descobrir, Avaliar, Para você, Listas) e cards.
