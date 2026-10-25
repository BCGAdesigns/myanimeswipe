# MyAnimeSwipe, especificação

Documento de decisões. Tudo aqui foi definido na entrevista inicial; o que estiver marcado como **ASSUMPTION** é escolha minha e pode ser revisto.

## Visão

App estilo Tinder para catalogar animes: marcar o que já viu, o que quer ver e o que não quer, dar nota de 0 a 10 aos vistos e receber recomendações no mesmo formato de swipe. No futuro, suporte a séries e animação ocidental (ex.: Avatar, a Lenda de Aang).

## Plataforma

* **PWA** (site instalável no celular), mobile first, funciona também no desktop.
* Stack: Vite + React + TypeScript. **ASSUMPTION** (escolha de stack minha).
* Hospedagem: GitHub Pages servindo o branch `gh-pages`. O workflow `.github/workflows/pages.yml` roda testes e build em todo push e, no branch padrão, publica o `dist/` no `gh-pages`. O build usa `base: './'`, então roda em qualquer subpasta. Endereço: https://bcgadesigns.github.io/myanimeswipe/
* GitHub Pages em repositório privado exige plano pago (Pro, Team ou Enterprise). No plano Free o repositório precisa ser público.

## Fonte de dados

* **AniList GraphQL** (`https://graphql.anilist.co`), sem chave, sem backend.
* A Crunchyroll **não tem API pública oficial**. O selo "Crunchyroll" vem de `Media.externalLinks` (campo `site`). Links para o MAL vêm de `Media.idMal`.
* Limite de taxa do AniList: 90 req/min no normal, 30 req/min no modo degradado atual. O app busca uma página de 50 animes por vez e guarda tudo em cache local.
* Catálogo: formatos `TV`, `TV_SHORT`, `MOVIE`, `OVA`, `ONA`, `SPECIAL`, ordenados por popularidade.
* Conteúdo adulto: `isAdult: false`. No AniList essa flag marca só hentai, então seinen e ecchi entram e pornografia fica de fora.
* Sinopses ficam no idioma do AniList (inglês). Interface em pt-BR. **ASSUMPTION**
* Modelo de dados genérico (`Media` com `source` e `kind`), para no futuro plugar TMDB (séries e animação ocidental) sem refatorar.

## Persistência

* Só no aparelho (IndexedDB). Sem conta, sem nuvem.
* Exportar/importar JSON nas configurações, como backup.
* Importar substitui os registros com o mesmo anime e mantém os outros. **ASSUMPTION**

## Gestos (iguais em todas as abas de swipe)

Lado direito é sempre "já vi", eixo vertical é sempre interesse.

| Gesto | Ação | Efeito |
|---|---|---|
| Cima | Quero ver | Vai para a lista "quero ver", sinal positivo |
| Baixo | Não quero | Nunca mais aparece, sinal negativo para recomendações |
| Esquerda | Pular | Neutro, volta a aparecer depois dos inéditos |
| Direita | Já vi | Vai para a fila de nota, sem nota sugerida |
| Diagonal cima-direita | Já vi e gostei | Fila de nota com 8 sugerido |
| Diagonal baixo-direita | Já vi e não gostei | Fila de nota com 3 sugerido |

* O rótulo da ação aparece enquanto arrasta; só confirma ao soltar.
* Botão Desfazer sempre visível.
* Botões equivalentes abaixo do card e atalhos de teclado (setas, `G` gostei, `N` não gostei, `Z` desfazer).

## Abas

1. **Descobrir**: baralho do catálogo com os 6 gestos.
2. **Avaliar**: fila dos "já vi" sem nota confirmada. Grade de toque com 11 botões (0 a 10, inteiros), a nota sugerida aparece destacada. Um toque salva e avança. Swipe para a esquerda pula (vai para o fim da fila), para a direita confirma a nota destacada. Lista dos já avaliados, com toque para reavaliar.
3. **Para você**: recomendações no mesmo baralho e com os mesmos 6 gestos. Fase 2.
4. **Listas**: "Quero ver" (marcar como já vi, que manda para a fila de nota, ou remover) e "Não quero" (restaurar, que devolve o anime ao baralho, ou mover para quero ver). Tudo com desfazer.

## Recomendações (fase 2)

Motor híbrido, local, custo zero:
* Recomendações da comunidade AniList (`Media.recommendations`) dos animes avaliados, pesadas pela sua nota.
* Afinidade de gêneros e tags calculada a partir das notas (notas altas puxam para cima, baixas e "não quero" puxam para baixo).
* Exclui tudo que já tem registro.

## IA (fase 3, última a ser implementada)

* O motor híbrido gera uns 30 candidatos reais; o LLM reordena e escreve "por que você vai gostar". Nunca inventa títulos.
* Forma de acesso (função serverless ou chave no app) a decidir nessa fase.

## Roadmap

* **Fase 1**: PWA, catálogo AniList, 6 gestos, aba Avaliar, aba Listas, persistência local, exportar/importar, deploy no GitHub Pages.
* **Fase 2**: aba Para você com motor híbrido.
* **Fase 3**: IA reordenando e explicando.
* **Futuro**: séries e animação ocidental via TMDB.
