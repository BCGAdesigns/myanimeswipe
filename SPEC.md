# WatchMatch, especificação

Documento de decisões. Tudo aqui foi definido nas conversas com o dono do produto; o que estiver marcado como **ASSUMPTION** é escolha minha e pode ser revisto.

## Visão

App estilo Tinder para decidir e organizar o que assistir: anime, filmes, séries e desenhos ocidentais (ex.: Avatar, a Lenda de Aang). Arraste para marcar o que já viu, o que quer ver e o que não quer, dê nota de 1 a 9 aos vistos (arrastando na direção da nota; o 9 é o favorito) e receba recomendações no mesmo formato de swipe. Na primeira vez a pessoa escolhe o que quer classificar, e pode mudar isso a qualquer momento, como as preferências de idade e distância do Tinder.

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

* Primeira abertura: **Entrar com e-mail** ou **Continuar sem conta**, com o aviso de que, sem conta, tudo fica só naquele aparelho (limpar os dados do navegador ou trocar de aparelho apaga o que foi classificado) e que a conta pode ser criada depois em Configurações. Quem abriu por um convite vê que precisa entrar para aceitar. Entrar usa o mesmo formulário de Configurações (e-mail, depois o link ou o código de 6 números); ao entrar, o app traz a biblioteca da nuvem antes de seguir, e uma conta que já tem preferências entra direto no app. Sem build com nuvem, essa etapa não aparece.
* Depois vem a escolha dos quatro tipos (Anime, Filmes, Séries, Desenhos), todos marcados; quem já usava a versão só de anime começa só com Anime. Depois, um guia de gestos aparece uma vez (e fica em Configurações).
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
| 2 toques | Gostei | Fila de nota com 7 sugerido, animação de coração |
| Segurar (0,5 s) | Favorito | Já vi + favorito, fila de nota com 8 sugerido, animação de estrela **ASSUMPTION** |

* Toque simples abre a sinopse (espera 0,25 s para não confundir com 2 toques).
* O selo da ação aparece enquanto arrasta e o próximo cartão cresce por trás; só confirma ao soltar. Cada gesto confirmado vibra de leve.
* Botões equivalentes abaixo do cartão (o pad espelha a bússola, com uma linha extra para Gostei e Favorito) e atalhos de teclado: setas, `A` assistindo, `P` pausa, `L` larguei, `N` não gostei, `G` gostei, `F` favorito, `Z` desfazer. Os botões podem ser ocultados (modo só gestos); nesse modo o Desfazer continua visível.

## Abas

1. **Descobrir**: baralho misto com os tipos escolhidos, um de cada tipo por vez (anime, filme, série, desenho), continuando depois do tipo do último cartão marcado. Desenhos alternam séries e filmes. Cada fonte busca a próxima página quando restam menos de 10 cartões dela.
2. **Avaliar**: fila dos "já vi" sem nota confirmada. A nota vai de 1 a 9, definido pelo dono do produto: de 1 a 8 é uma direção de arrasto, como um mostrador (8 para cima e um a menos a cada passo no sentido horário: ↑ 8, ↗ 7, → 6, ↘ 5, ↓ 4, ↙ 3, ← 2, ↖ 1), e o 9 é 2 toques ou segurar o cartão. **9 é o mesmo que favorito**: dar 9 marca favorito, dar outra nota tira, favoritar no Descobrir sugere 9 e tirar dos favoritos um 9 vira 8. A tela é a mesma do Descobrir: o cartão grande do título (toque abre a sinopse) e, embaixo, um painel de botões na posição de cada direção, com o 9 no meio (1 8 7 / 2 9 6 / 3 4 5), cor do vermelho (1) ao verde (8) e dourado no 9, mais Pular, Desfazer e Ocultar. Ocultar deixa só os gestos, com Pular, Desfazer e Mostrar botões numa linha; a escolha fica salva no aparelho, separada da do Descobrir. A nota sugerida (do Descobrir) aparece no cartão e fica destacada no painel; confirmar é tocar nela. O 9 comemora no cartão como o favorito do Descobrir. Durante o arrasto, o botão da nota apontada acende. No teclado: 1 a 9, F dá 9, Enter confirma a sugestão, P pula, Z desfaz. Lista dos já avaliados, com toque para reavaliar. A tabela fica em `RATE_COMPASS` (`src/logic.ts`) e a escala em `src/rating.ts`.
   * **Como dar nota**: antes da primeira nota (e de novo para todo mundo quando a escala mudou) abre uma tela com cada nota, quando dar e o gesto: 9 Favorito (um dos melhores que já viu), 8 Excelente, 7 Muito bom, 6 Bom, 5 Ok (o meio), 4 Fraco, 3 Ruim, 2 Muito ruim, 1 Péssimo. Ela reabre pelo botão "Notas" da aba e em Configurações.
   * **Mudança de 1 a 8 para 1 a 9** (`RESCALE_AT` em `src/rating.ts`): toda nota dada antes dessa data, em qualquer conta, volta para a fila sem nota, com o número antigo como sugestão (9 para favoritos). Roda em cada aparelho ao abrir e em toda nota antiga que chega da nuvem; notas dadas depois da data nunca são tocadas, e a versão do registro sobe só um passo, então qualquer mudança mais nova ganha. O app avisa com uma faixa "Reavaliar" até a pessoa abrir a tela de notas.
3. **Para você**: recomendações no mesmo baralho e com os mesmos gestos, cada cartão com o motivo ("Porque você favoritou X").
4. **Listas**: Quero ver, Assistindo, Em pausa, Larguei, Favoritos e Não quero, com ações e desfazer. Tocar num título abre a ficha dele.
5. **Amigos**: feed, amigos, indicações e testes de gosto (abaixo).

**Escala guardada**: os registros continuam guardando a nota de 0 a 10 (como antes), e o app mostra de 1 a 8 (`src/rating.ts`). Notas novas são salvas como 0, 1, 3, 4, 6, 7, 8 e 10; as antigas aparecem no degrau mais próximo (8 e 9 viram 7, 5 e 6 viram 5). Assim sincronização, recomendações, listas de amigos e versões antigas do app seguem funcionando sem migrar dados, e nada se perde se a escala mudar de novo.

Na lista de avaliados (aba Avaliar) e nas Listas dá para ordenar por mais recentes, maior nota, menor nota, título, lançamento ou nota da comunidade, e filtrar por tipo (e por favoritos, nos avaliados). A escolha fica salva no aparelho.

## Busca

* Lupa no topo: busca por nome no AniList (anime) e no TMDB (`/search/multi`, filmes, séries e desenhos; pessoas e animação japonesa ficam de fora), mais os títulos que já estão na sua biblioteca (sem diferenciar acentos). Espera uma pausa na digitação (0,35 s) antes de consultar.
* Tocar num resultado abre a ficha do título: capa, sinopse, links, situação na sua biblioteca, todas as ações de classificação e, se já viu, a nota de 1 a 8 e o favorito. Registros feitos assim levam `via = 'search'`.
* As últimas 6 buscas ficam salvas no aparelho.

## Amigos (camada social)

Quem tem conta cria um **perfil**: @usuário (3 a 20 letras sem acento, números, `_` ou ponto; sugerido a partir do e-mail), nome para mostrar, foto (um emoji ou a inicial) e bio de até 160 caracteres. O e-mail nunca aparece. A aba tem quatro seções, com contador do que espera a pessoa:

* **Feed**: o que os amigos fizeram, do mais recente para o mais antigo (deu nota, favoritou, quer ver, está assistindo, pausou, largou), 40 por página, misturado por data com o que os amigos comentaram sobre títulos (o balão do comentário, o título e "Responder" com o número de respostas). Cada atividade tem curtida, "Comentar" com o número de comentários e, se o título não está na sua biblioteca, um atalho "Quero ver". No topo, **Para você** junta as curtidas recebidas e os comentários para a pessoa (nas conversas dela e respostas depois das dela), com os novos destacados até serem vistos; tocar num comentário abre a conversa. Pulados e "Não quero" nunca entram no feed. Enquanto um dos dois fluxos tem página mais antiga, nada mais antigo que o último item dele aparece, para a próxima página não cair acima do que já está na tela.
* **Amigos**: seu cartão, o **código de convite** (10 letras e números sem caracteres que se confundem) e o link `?convite=CÓDIGO`; quem usa o código vira amigo na hora, porque o código foi entregue de propósito. Dá para trocar o código (o antigo para de funcionar). Também dá para buscar pelo começo do @usuário e mandar pedido (vira amizade quando o outro aceita; se os dois pedirem, vira na hora). A lista de amigos vem ordenada pela compatibilidade. O link `?amigo=usuario` abre a pessoa para adicionar. Convites recebidos ficam guardados no aparelho por até 7 dias, até a pessoa entrar e criar o perfil.
* **Indicações**: recomendações enviadas de propósito, com mensagem opcional (até 280 caracteres), a partir da ficha de qualquer título ("Recomendar para amigos", vários amigos de uma vez). Quem recebe pode curtir, pôr em Quero ver ou dispensar. Quem envia acompanha o que aconteceu: ainda não viu, viu a indicação, curtiu, colocou na lista Quero ver, está assistindo, viu e deu nota X, favoritou, largou, não quis ou dispensou.
* **Testes de gosto**: o app escolhe até 8 títulos que pelo menos um dos dois já viu (um terço que os dois viram, um terço só do amigo, o resto só seu, puxando opiniões fortes). Para cada título, cada um dá, no próprio aparelho, a sua nota de 1 a 8 (ou "não vi") e o palpite da nota que o outro daria (ou "acho que não viu"). As respostas são finais e só aparecem para o outro quando os dois terminam. Resultado: gosto parecido (média de `max(0, 1 − diferença ÷ 3)` nos títulos que os dois viram, como na compatibilidade), quantas notas foram iguais, quantos palpites cada um acertou em cheio e a comparação título por título. Respostas da primeira versão (amei, gostei...) viram notas 8, 6, 4 e 2.

**Perfil do amigo**: cartão, números (vistos, nota média, favoritos, quer ver), compatibilidade e três vistas:
* **Em comum**: "Vocês dois querem ver", "Assistindo ao mesmo tempo", "Fulano recomenda para você" (o que ele avaliou com 6 ou mais, favoritou ou está assistindo e você não viu, ordenado por quanto ele gostou vezes quanto combina com os seus gêneros), "Você recomenda para Fulano" (o mesmo no sentido contrário, com os gêneros dele), "Na lista de Fulano, e você já viu", "Os dois amaram", "Onde vocês discordam" (notas 3 ou mais pontos distantes, ou sinais opostos) e **Notas lado a lado**, com todos os títulos em comum e a nota de cada um, ordenável por mais parecidas, mais diferentes, sua maior nota, maior nota dele ou mais recentes.
* **Lista**: notas, favoritos, quero ver, assistindo ou tudo.
* **Atividade**: as últimas mudanças dele.

**Compatibilidade**: cada título que os dois avaliaram vale `max(0, 1 − diferença ÷ 3)` na escala de 1 a 8 (mesma nota 100%, 1 ponto 67%, 2 pontos 33%, 3 ou mais 0%). Títulos sem as duas notas mas com opinião forte dos dois lados (favorito, largou, gostei) valem meio título: 1 se concordam, 0 se não. O resultado é puxado para 50% com peso de 2 títulos, para não exagerar com pouca coisa em comum: `(soma + 1) ÷ (títulos + 2)`. Abaixo de 2 títulos de evidência aparece "?". **ESTIMATIVA**: a escala de 3 pontos e o peso de 2 títulos foram escolhidos à mão.

Na ficha de qualquer título aparece **Seus amigos**, com o que cada amigo fez com ele (tocar abre a conversa sobre a nota daquele amigo, com o número de comentários), e **Comentários**: o que você e seus amigos disseram sobre o título, do mais novo para o mais antigo (4 primeiro, "Ver todos" mostra até 50), com "na conversa de Fulano" quando o comentário foi feito na nota de alguém, e um campo para comentar sobre o título.

**Comentários**: cada conversa é de uma pessoa e um título. Comentar a nota de um amigo escreve na conversa dele; comentar sobre um título escreve na sua. Quem é dono da conversa e os amigos dessa pessoa leem e escrevem (até 500 caracteres, espaços nas pontas cortados); quem escreveu apaga o próprio comentário, e o dono apaga qualquer um na conversa dele. A conversa abre numa folha alta, como um chat: a capa, de quem é a conversa e a nota, os comentários do mais antigo para o mais novo e o campo embaixo. Ao fechar, os contadores se atualizam.

Servidor (`supabase/migrations/20261025150000_usernames_and_friendships.sql`, `20261025170000_social.sql` e `20261025190000_comments.sql`): tabelas `usernames` (perfil e código de convite; cada um só lê o próprio), `friendships`, `reactions` (curtidas), `recommendations`, `taste_tests` e `comments` (sem leitura direta). Tudo sobre outras pessoas passa por funções com privilégio do banco que conferem a amizade antes (`friend_profile`, `friends_feed`, `friends_on_title`, `toggle_like`, `recommend`, `sent_recommendations`, `my_taste_tests`, `post_comment`, `thread_comments`, `title_comments`, `comments_received`, `friends_comments`, `comment_counts` e outras); ninguém sem login chama essas funções. Ao desfazer a amizade, o acesso some na hora para os dois lados. Excluir a conta apaga tudo em cascata.

## Recomendações (fase 2, sem IA)

Motor local, custo zero (`src/recs/engine.ts`):
* Peso de cada registro: favorito 3; nota confirmada ou sugerida vira `(nota guardada − 5,5) ÷ 2` (8 = 2,25; 7 = 1,25; 6 = 0,75; 3 = −1,25); assistindo 1; quero ver 0,5; em pausa 0,2; já vi sem nota 0,3; não quero −0,75; larguei −1.
* Sementes: registros com peso 0,75 ou mais (nota 6 para cima, gostei, assistindo, favorito) dos tipos escolhidos. Até 20 de anime (lotes de 10 por consulta no AniList) e até 8 do TMDB (uma consulta cada).
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
* **Fase 2.7** (feito): camada social com perfil, convites, amizade mútua, feed com curtidas, indicações com acompanhamento, testes de gosto e compatibilidade pelas notas.
* **Fase 2.8** (feito): comentários nas notas dos amigos e sobre títulos, no feed e na ficha do título.
* **Fase 3**: IA reordenando e explicando.
* **Futuro**: cobrança dos filtros PRO, SMTP próprio para abrir o login a qualquer pessoa.
