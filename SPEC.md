# WatchMatch, especificação

Documento de decisões. Tudo aqui foi definido nas conversas com o dono do produto; o que estiver marcado como **ASSUMPTION** é escolha minha e pode ser revisto.

## Visão

App estilo Tinder para decidir e organizar o que assistir: anime, filmes, séries e desenhos ocidentais (ex.: Avatar, a Lenda de Aang). Arraste para marcar o que já viu, o que quer ver e o que não quer, dê nota de 0 a 10 aos vistos e receba recomendações no mesmo formato de swipe. Na primeira vez a pessoa escolhe o que quer classificar, e pode mudar isso a qualquer momento, como as preferências de idade e distância do Tinder.

## Plataforma

* **PWA** (site instalável no celular), mobile first, funciona também no desktop e offline.
* Stack: Vite + React + TypeScript. **ASSUMPTION** (escolha de stack minha).
* Visual: tema escuro, fonte Plus Jakarta Sans (servida pelo próprio app, funciona offline), ícones Lucide, cor de destaque em degradê violeta para rosa. Logo: dois cartões em leque com o símbolo de play (`scripts/generate-brand-assets.cjs` gera todos os tamanhos).
* Hospedagem: Vercel, projeto `myanimeswipe`, produção em https://myanimeswipe.vercel.app. O deploy automático a cada push depende de ligar o repositório ao projeto (Settings → Git); até lá, os deploys são disparados a partir do repo público. O build usa `base: './'`, então roda em qualquer host ou subpasta.
* CI: o workflow `.github/workflows/ci.yml` roda testes e build em todo push.

## Fontes de dados

* **Anime: AniList GraphQL** (`https://graphql.anilist.co`), sem chave, consultado direto do aparelho. A Crunchyroll **não tem API pública oficial**; o selo "Crunchyroll" e os serviços de streaming vêm de `Media.externalLinks`. Links para o MAL vêm de `Media.idMal`. Conteúdo adulto: `isAdult: false` (no AniList essa flag marca só hentai, então seinen e ecchi entram e pornografia fica de fora).
* **Filmes, séries e desenhos: TMDB**, consultado pela função `tmdb` do Supabase (proxy só de leitura). A credencial do TMDB fica no Vault do Supabase (`tmdb_read_token`), nunca no app nem no repositório. A função só aceita os caminhos que o app usa e só responde a origens do app. Idioma `pt-BR`, `include_adult=false`.
  * Filmes: `/discover/movie` sem o gênero Animação.
  * Séries: `/discover/tv` sem Animação, talk shows e jornalismo.
  * Desenhos: Animação (séries e filmes) sem a palavra-chave "anime" do TMDB e sem idioma original japonês, para não repetir o que vem do AniList.
* **Onde assistir no Brasil:** dados da JustWatch via TMDB (`watch_region=BR`). A lista de serviços do filtro (Netflix, Prime Video, Disney+, HBO Max, Globoplay, Apple TV, Paramount+, Crunchyroll, Claro video, MUBI, Looke, Pluto TV) foi conferida na API. Para anime o filtro usa os links do AniList, que não são por país.
* Limites: AniList 90 req/min no normal e 30 no modo degradado; o app busca uma página por vez de cada fonte e guarda tudo no aparelho. O TMDB entrega no máximo 500 páginas por consulta.
* Sinopses: TMDB em pt-BR quando existe; AniList em inglês. **ASSUMPTION**
* Modelo único (`Media` com `source` e `kind`); ids globais `anilist:ID` e `tmdb:movie|tv:ID`. Gêneros das duas fontes viram um vocabulário só (`src/genres.ts`).

## Primeira vez e preferências

* Primeira abertura: tela de boas-vindas com os quatro tipos (Anime, Filmes, Séries, Desenhos), todos marcados; quem já usava a versão só de anime começa só com Anime. Depois, um guia de gestos aparece uma vez (e fica em Configurações).
* Botão de filtros no topo abre as preferências. Escolher os tipos é sempre grátis.
* Filtros avançados, marcados **PRO** e grátis por enquanto (`PREMIUM_FILTERS_UNLOCKED` em `src/prefs.ts`): ordenar por populares, melhor nota ou lançamentos; faixa de anos; nota mínima da comunidade; gêneros a evitar; formatos de anime; máximo de episódios (anime); duração máxima de filmes; idioma original (filmes, séries e desenhos); só o que está em streaming no Brasil; serviços específicos.
* Mudar filtros recomeça o catálogo daquele conjunto de filtros; o que já foi classificado continua guardado.
* Com conta, as preferências sincronizam pela tabela `profiles` (vale a cópia mais recente).

## Persistência

* Local first: tudo é salvo no aparelho (IndexedDB) na hora, e funciona offline.
* Com conta, sincroniza com o Supabase (projeto `myanimeswipe`, São Paulo, plano grátis): envia as alterações pendentes e baixa o que mudou desde a última sincronização. Roda ao entrar, ao voltar para o app, ao recuperar a conexão e alguns segundos depois de cada alteração.
* Conflito entre aparelhos: vale a alteração mais recente de cada título (`rev`, horário da alteração no aparelho). Remoções viram lápides para propagar.
* Cada linha guarda um resumo do título (nome, capa) para outro aparelho conseguir mostrar sem buscar de novo.
* Login por link no e-mail (Supabase Auth). Tabelas `entries` e `profiles` com RLS: cada conta só lê e grava as próprias linhas.
* Excluir conta: Configurações, Zona de perigo. A função `delete-account` apaga o usuário e o banco remove as linhas dele em cascata.
* Limite do e-mail padrão do Supabase: 2 por hora, só para membros da organização. Para abrir para outras pessoas, configurar um SMTP próprio.
* Sem conta, o app continua só local. Exportar e importar JSON nas configurações, como backup extra (inclui as preferências). Importar substitui os registros com o mesmo título e mantém os outros. **ASSUMPTION**

## Gestos (iguais em todas as abas de swipe)

Bússola de 8 direções (fatias iguais de 45°) mais 2 gestos de toque. Esquerda = parado ou fora, direita = em andamento ou terminado; cima = positivo, baixo = negativo. Os status seguem o MyAnimeList (Plan to Watch, Watching, Completed, On-Hold, Dropped), mais "não quero" e "pular".

| Gesto | Ação | Efeito |
|---|---|---|
| ↑ Cima | Quero ver | Lista "Quero ver", sinal positivo |
| ↗ Cima-direita | Assistindo | Lista "Assistindo" |
| → Direita | Já vi | Fila de nota, sem nota sugerida |
| ↘ Baixo-direita | Já vi e não gostei | Fila de nota com 3 sugerido |
| ↓ Baixo | Não quero | Nunca mais aparece, sinal negativo para recomendações |
| ↙ Baixo-esquerda | Larguei | Lista "Larguei", fora da fila de nota **ASSUMPTION** |
| ← Esquerda | Pular | Neutro, volta a aparecer depois dos inéditos |
| ↖ Cima-esquerda | Em pausa | Lista "Em pausa" |
| 2 toques | Gostei | Fila de nota com 8 sugerido, animação de coração |
| Segurar (0,5 s) | Favorito | Já vi + favorito, fila de nota com 10 sugerido, animação de estrela **ASSUMPTION** |

* Toque simples abre a sinopse (espera 0,25 s para não confundir com 2 toques).
* O selo da ação aparece enquanto arrasta e o próximo cartão cresce por trás; só confirma ao soltar. Cada gesto confirmado vibra de leve.
* Botões equivalentes abaixo do cartão (o pad espelha a bússola, com uma linha extra para Gostei e Favorito) e atalhos de teclado: setas, `A` assistindo, `P` pausa, `L` larguei, `N` não gostei, `G` gostei, `F` favorito, `Z` desfazer. Os botões podem ser ocultados (modo só gestos); nesse modo o Desfazer continua visível.

## Abas

1. **Descobrir**: baralho misto com os tipos escolhidos, um de cada tipo por vez (anime, filme, série, desenho), continuando depois do tipo do último cartão marcado. Desenhos alternam séries e filmes. Cada fonte busca a próxima página quando restam menos de 10 cartões dela.
2. **Avaliar**: fila dos "já vi" sem nota confirmada. Grade de 0 a 10 com cor por nota; a nota sugerida aparece destacada. Um toque salva e avança. Swipe para a esquerda pula, para a direita confirma. Lista dos já avaliados, com toque para reavaliar.
3. **Para você**: recomendações no mesmo baralho e com os mesmos gestos, cada cartão com o motivo ("Porque você favoritou X").
4. **Listas**: Quero ver, Assistindo, Em pausa, Larguei, Favoritos e Não quero, com ações e desfazer. Tocar num título abre a ficha dele.
5. **Amigos**: match com amigos (abaixo).

Na lista de avaliados (aba Avaliar) e nas Listas dá para ordenar por mais recentes, maior nota, menor nota, título, lançamento ou nota da comunidade, e filtrar por tipo (e por favoritos, nos avaliados). A escolha fica salva no aparelho.

## Busca

* Lupa no topo: busca por nome no AniList (anime) e no TMDB (`/search/multi`, filmes, séries e desenhos; pessoas e animação japonesa ficam de fora), mais os títulos que já estão na sua biblioteca (sem diferenciar acentos). Espera uma pausa na digitação (0,35 s) antes de consultar.
* Tocar num resultado abre a ficha do título: capa, sinopse, links, situação na sua biblioteca, todas as ações de classificação e, se já viu, a nota de 0 a 10 e o favorito. Registros feitos assim levam `via = 'search'`.
* As últimas 6 buscas ficam salvas no aparelho.

## Match com amigos

* Quem tem conta cria um **código de amigo** (10 letras e números, sem caracteres que se confundem) e manda o link `?amigo=CÓDIGO` ou o código. Pode escolher um nome para aparecer e parar de compartilhar quando quiser (o código deixa de funcionar).
* Qualquer pessoa, mesmo sem conta, compara a própria lista com a de quem compartilhou: compatibilidade de gosto, "Vocês dois querem ver", "Fulano recomenda para você", "Os dois amaram", "Você recomenda para Fulano" e "Vocês discordam". Tocar num pôster abre a ficha para classificar.
* Compatibilidade: com 3 ou mais títulos avaliados pelos dois, 100 menos 10 vezes a diferença média das notas; senão, a proporção de concordância entre os sinais fortes (gostei ou não gostei) dos dois, também com no mínimo 3. **ASSUMPTION**: fórmula simples, escolhida por ser fácil de explicar.
* Servidor: tabela `shares` (código e nome, só o dono mexe) e a função `shared_list(código)`, que devolve as listas de quem compartilha (sem pulados, sem e-mail, sem sinopse). Segurar o código é a permissão, por isso a função roda com privilégio do banco e aceita chamadas sem login; o alerta do Supabase sobre isso é esperado.
* Amigos comparados ficam salvos no aparelho, com a última compatibilidade.

## Recomendações (fase 2, sem IA)

Motor local, custo zero (`src/recs/engine.ts`):
* Peso de cada registro: favorito 3; nota confirmada ou sugerida vira `(nota − 5,5) ÷ 2` (10 = 2,25; 8 = 1,25; 3 = −1,25); assistindo 1; quero ver 0,5; em pausa 0,2; já vi sem nota 0,3; não quero −0,75; larguei −1.
* Sementes: registros com peso 0,75 ou mais (nota 7 para cima, gostei, assistindo, favorito) dos tipos escolhidos. Até 20 de anime (lotes de 10 por consulta no AniList) e até 8 do TMDB (uma consulta cada).
* Candidatos: recomendações da comunidade AniList (pesadas pelos votos) e listas de recomendação do TMDB (pesadas pela posição), multiplicadas pelo peso da semente.
* Nota final: 0,6 × colaborativo + 0,3 × afinidade de gêneros e tags + 0,1 × nota da comunidade. **ESTIMATIVA**: pesos ajustados à mão, não aprendidos.
* Exclui o que já tem registro (menos os pulados, que voltam no fim) e aplica os filtros que dá para checar no aparelho.
* Começa com 3 sinais positivos. A lista fica guardada e é refeita quando os filtros mudam, depois de 24 h, ou quando restam menos de 5 cartões e há sementes novas. Botão Atualizar força.

## IA (fase 3)

* Adiada por decisão do dono do produto. Plano: o motor gera uns 30 candidatos reais; um LLM reordena e escreve "por que você vai gostar", sem inventar títulos.

## Legal e créditos

* Termos de Uso (`public/termos.html`) e Política de Privacidade com base na LGPD (`public/privacidade.html`), linkados na primeira tela e em Configurações.
* Mantenedor: BCGA Designs; contato pelos issues do GitHub. **ASSUMPTION** (dá para trocar por um e-mail).
* Créditos: logo do TMDB com o aviso "Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB", dados de onde assistir da JustWatch, dados de anime do AniList.
* Uso comercial (por exemplo, cobrar pelos filtros PRO) exige licença comercial do TMDB e revisão dos termos do AniList e da JustWatch antes de ligar a cobrança.

## Roadmap

* **Fase 1** (feito): PWA, catálogo AniList, gestos, aba Avaliar, aba Listas, persistência local, exportar e importar, deploy na Vercel.
* **Fase 1.5** (feito): conta por link no e-mail e sincronização entre aparelhos (Supabase).
* **Fase 1.6** (feito): bússola de 8 gestos + 2 toques e segurar; status no padrão MyAnimeList e favoritos.
* **Fase 2** (feito): aba Para você com motor híbrido.
* **Fase 2.5** (feito): nome WatchMatch, filmes, séries e desenhos via TMDB, primeira tela, preferências e filtros PRO, visual novo, termos e privacidade, excluir conta.
* **Fase 2.6** (feito): busca, ficha do título, ordenação e filtros nos avaliados e nas listas, match com amigos por código, login também por código de 6 dígitos.
* **Fase 3**: IA reordenando e explicando.
* **Futuro**: cobrança dos filtros PRO, SMTP próprio para abrir o login a qualquer pessoa.
