# WatchMatch

PWA estilo Tinder para decidir e organizar o que assistir: anime, filmes, séries e desenhos. Arraste para marcar o que já viu, o que quer ver e o que não quer, dê nota de 1 a 9 (arrastando na direção da nota, e 9 é o favorito) e receba recomendações. Dados do [AniList](https://anilist.co) (anime) e do [TMDB](https://www.themoviedb.org) (filmes, séries e desenhos), com onde assistir da JustWatch.

O nome do produto fica em `src/brand.ts`; identificadores internos (banco local, backup) continuam `myanimeswipe` para não perder dados.

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

Sem as variáveis do Supabase (abaixo), o app roda só com anime e sem conta. Com elas, liga filmes, séries e desenhos (pelo proxy do TMDB) e a sincronização.

## Publicar

Produção: https://myanimeswipe.vercel.app (projeto `myanimeswipe` na Vercel). Abra no celular e use "Adicionar à tela inicial" para instalar.

O projeto ainda não está ligado ao repositório, então um push não publica sozinho; cada deploy é disparado a partir do repo público (pelo conector da Vercel no Claude). Para ativar o deploy automático (uma vez só): no painel da Vercel, abra o projeto, vá em **Settings → Git → Connect Git Repository**, escolha GitHub, instale o app da Vercel quando pedir e selecione `BCGAdesigns/myanimeswipe`. A partir daí, cada push no branch padrão vira deploy de produção e os outros branches geram previews.

O workflow `.github/workflows/ci.yml` roda testes e build em todo push. `dist/` é estático e usa caminhos relativos, então também serve em outros hosts sem mudanças.

## Supabase

* Projeto `myanimeswipe` (região São Paulo). Esquema em `supabase/migrations/`: `entries`, `profiles`, a camada social (`usernames`, `friendships`, `reactions`, `recommendations`, `taste_tests`, `comments` e as funções que conferem a amizade) e a função `tmdb_token`. A tabela `shares` e a função `shared_list` são da primeira versão do match com amigos e estão desativadas.
* Variáveis de build (já cadastradas na Vercel; para rodar local, copie `.env.example` para `.env.local`): `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. As duas são públicas por design; quem protege os dados são as regras RLS.
* Funções em `supabase/functions/`:
  * `tmdb`: proxy só de leitura para a API do TMDB (sem verificação de JWT, para funcionar sem conta). Lê o token do secret `TMDB_READ_TOKEN` da função ou, se não houver, do Vault (`select vault.create_secret('<token de leitura do TMDB>', 'tmdb_read_token')`). Para trocar a chave, atualize o segredo no Vault; nada no app muda.
  * `delete-account`: exclui a conta de quem chama (com verificação de JWT); as linhas somem em cascata.
* No painel do Supabase, **Authentication → URL Configuration → Site URL** precisa ser o endereço do app, para o link do e-mail voltar para ele.
* E-mails de login em português: `supabase/templates/`. No painel, **Authentication → Email Templates**, cole `magic-link.html` em **Magic Link** (assunto: "Seu acesso ao WatchMatch") e `confirmation.html` em **Confirm signup** (assunto: "Confirme seu e-mail no WatchMatch"). Os dois trazem o link e o código de 6 dígitos; o código entra pelo próprio app (Configurações, Conta), o que resolve o app instalado na tela inicial do iPhone, que não recebe o link, e os provedores de e-mail que abrem o link antes da pessoa.

## Estrutura

* `src/logic.ts`: regras puras dos gestos, fila de notas e listas.
* `src/prefs.ts` e `src/genres.ts`: preferências, filtros e o vocabulário único de gêneros.
* `src/sources/`: AniList (`anilist.ts`), TMDB pelo proxy (`tmdb.ts`), serviços de streaming (`providers.ts`) e o baralho misto (`catalog.ts`).
* `src/recs/engine.ts`: motor de recomendações da fase 2.
* `src/library.ts`: ordenação, filtros e busca na biblioteca do usuário.
* `src/friends/`: camada social: chamadas ao servidor (`api.ts`), estado compartilhado e contadores (`social.tsx`), compatibilidade e comparação de listas (`compare.ts`), teste de gosto (`taste.ts`) e textos do feed (`feed.ts`).
* `src/db.ts`: IndexedDB (catálogos, títulos, registros, preferências, recomendações e a fila de alterações a sincronizar).
* `src/sync/`: motor de sincronização, cliente Supabase e o hook de login.
* `src/store.tsx`: estado do app, desfazer, exportar e importar.
* `src/components/`: telas (primeira vez, Descobrir, Avaliar, Para você, Listas, busca, ficha do título, preferências, configurações, guia de gestos). As telas da aba Amigos ficam em `src/components/social/`.
* `public/`: ícones, imagem de compartilhamento, logo do TMDB, Termos de Uso e Política de Privacidade.
* `scripts/generate-brand-assets.cjs`: gera ícones e a imagem de compartilhamento a partir do desenho do logo (precisa do Playwright).

Testes: `src/**/*.test.ts` cobrem gestos, sincronização, preferências, consultas ao AniList e ao TMDB, baralho misto, filtros locais, recomendações, ordenação e busca na biblioteca, a compatibilidade e a comparação com amigos, o teste de gosto e os textos do feed.
