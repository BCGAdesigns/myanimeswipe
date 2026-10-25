# WatchMatch, especificação

Documento de decisões. Tudo aqui foi definido na entrevista inicial; o que estiver marcado como **ASSUMPTION** é escolha minha e pode ser revisto.

## Visão

App estilo Tinder para catalogar animes: marcar o que já viu, o que quer ver e o que não quer, dar nota de 0 a 10 aos vistos e receber recomendações no mesmo formato de swipe. No futuro, suporte a séries e animação ocidental (ex.: Avatar, a Lenda de Aang).

## Plataforma

* **PWA** (site instalável no celular), mobile first, funciona também no desktop.
* Stack: Vite + React + TypeScript. **ASSUMPTION** (escolha de stack minha).
* Hospedagem: Vercel, projeto `myanimeswipe`, produção em https://myanimeswipe.vercel.app. O deploy automático a cada push depende de ligar o repositório ao projeto (Settings → Git); até lá, os deploys são disparados a partir do repo público. O build usa `base: './'`, então roda em qualquer host ou subpasta.
* CI: o workflow `.github/workflows/ci.yml` roda testes e build em todo push.

## Fonte de dados

* **AniList GraphQL** (`https://graphql.anilist.co`), sem chave, sem backend.
* A Crunchyroll **não tem API pública oficial**. O selo "Crunchyroll" vem de `Media.externalLinks` (campo `site`). Links para o MAL vêm de `Media.idMal`.
* Limite de taxa do AniList: 90 req/min no normal, 30 req/min no modo degradado atual. O app busca uma página de 50 animes por vez e guarda tudo em cache local.
* Catálogo: formatos `TV`, `TV_SHORT`, `MOVIE`, `OVA`, `ONA`, `SPECIAL`, ordenados por popularidade.
* Conteúdo adulto: `isAdult: false`. No AniList essa flag marca só hentai, então seinen e ecchi entram e pornografia fica de fora.
* Sinopses ficam no idioma do AniList (inglês). Interface em pt-BR. **ASSUMPTION**
* Modelo de dados genérico (`Media` com `source` e `kind`), para no futuro plugar TMDB (séries e animação ocidental) sem refatorar.

## Persistência

* Local first: tudo é salvo no aparelho (IndexedDB) na hora, e funciona offline.
* Com conta, sincroniza com o Supabase (projeto `myanimeswipe`, São Paulo, plano grátis): envia as alterações pendentes e baixa o que mudou desde a última sincronização. Roda ao entrar, ao voltar para o app, ao recuperar a conexão e alguns segundos depois de cada alteração.
* Conflito entre aparelhos: vale a alteração mais recente de cada anime (`rev`, horário da alteração no aparelho). Remoções viram lápides para propagar.
* Cada linha guarda um resumo do anime (título, capa) para outro aparelho conseguir mostrar sem buscar de novo.
* Login por link no e-mail (Supabase Auth). Tabela `entries` com RLS: cada conta só lê e grava as próprias linhas, já pronta para várias contas.
* Limite do e-mail padrão do Supabase: 2 por hora, só para membros da organização. Para abrir para outras pessoas, configurar um SMTP próprio.
* Sem conta, o app continua só local.
* Exportar/importar JSON nas configurações, como backup extra.
* Importar substitui os registros com o mesmo anime e mantém os outros. **ASSUMPTION**

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
| 2 toques | Gostei | Fila de nota com 8 sugerido |
| Segurar (0,5 s) | Favorito | Já vi + favorito, fila de nota com 10 sugerido, lista "Favoritos" **ASSUMPTION** |

* Toque simples abre a sinopse (espera 0,25 s para não confundir com 2 toques).
* O rótulo da ação aparece enquanto arrasta; só confirma ao soltar. Segurar vibra ao marcar favorito.
* Botão Desfazer sempre visível.
* Botões equivalentes abaixo do card (o pad espelha a bússola, com uma linha extra para Gostei e Favorito) e atalhos de teclado: setas, `A` assistindo, `P` pausa, `L` larguei, `N` não gostei, `G` gostei, `F` favorito, `Z` desfazer. Os botões podem ser ocultados (modo só gestos, preferência salva por aparelho); nesse modo o Desfazer continua visível.

## Abas

1. **Descobrir**: baralho do catálogo com a bússola de gestos.
2. **Avaliar**: fila dos "já vi" sem nota confirmada. Grade de toque com 11 botões (0 a 10, inteiros), a nota sugerida aparece destacada. Um toque salva e avança. Swipe para a esquerda pula (vai para o fim da fila), para a direita confirma a nota destacada. Lista dos já avaliados, com toque para reavaliar. Favoritos aparecem com ⭐.
3. **Para você**: recomendações no mesmo baralho e com os mesmos gestos. Fase 2.
4. **Listas**: Quero ver (Comecei, Já vi, Remover), Assistindo (Terminei, Pausar, Larguei), Em pausa (Retomar, Larguei, Remover), Larguei (Retomar, Remover), Favoritos (Tirar dos favoritos) e Não quero (Restaurar, Quero ver). Tudo com desfazer.

## Recomendações (fase 2)

Motor híbrido, local, custo zero:
* Recomendações da comunidade AniList (`Media.recommendations`) dos animes avaliados, pesadas pela sua nota.
* Afinidade de gêneros e tags calculada a partir das notas (notas altas puxam para cima, baixas e "não quero" puxam para baixo).
* Exclui tudo que já tem registro.

## IA (fase 3, última a ser implementada)

* O motor híbrido gera uns 30 candidatos reais; o LLM reordena e escreve "por que você vai gostar". Nunca inventa títulos.
* Forma de acesso (função serverless ou chave no app) a decidir nessa fase.

## Roadmap

* **Fase 1**: PWA, catálogo AniList, 6 gestos, aba Avaliar, aba Listas, persistência local, exportar/importar, deploy na Vercel.
* **Fase 1.5**: conta por link no e-mail e sincronização entre aparelhos (Supabase).
* **Fase 1.6**: bússola de 8 gestos + 2 toques e segurar; status no padrão MyAnimeList (assistindo, em pausa, larguei) e favoritos.
* **Fase 2**: aba Para você com motor híbrido.
* **Fase 3**: IA reordenando e explicando.
* **Futuro**: séries e animação ocidental via TMDB.
