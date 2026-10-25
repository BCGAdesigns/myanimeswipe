import { Code, Download, FileText, Hand, Info, Lock, ShieldAlert, SlidersHorizontal, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { APP_NAME } from '../brand'
import { useStore, type ExportFile } from '../store'
import { CloudSection } from './CloudSection'
import { Sheet } from './Sheet'

const STATS: { key: string; label: string }[] = [
  { key: 'seen', label: 'Já vi' },
  { key: 'favorite', label: 'Favoritos' },
  { key: 'watching', label: 'Assistindo' },
  { key: 'want', label: 'Quero ver' },
  { key: 'paused', label: 'Em pausa' },
  { key: 'dropped', label: 'Larguei' },
  { key: 'reject', label: 'Não quero' },
  { key: 'skip', label: 'Pulados' },
]

interface Props {
  onClose: () => void
  onOpenPrefs: () => void
  onOpenGuide: () => void
}

export function Settings({ onClose, onOpenPrefs, onOpenGuide }: Props) {
  const { entries, exportData, importData, resetAll, cloud, deleteAccount } = useStore()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const counts: Record<string, number> = {}
  for (const e of entries.values()) {
    counts[e.status] = (counts[e.status] ?? 0) + 1
    if (e.favorite) counts.favorite = (counts.favorite ?? 0) + 1
  }

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `watchmatch-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const doImport = async (file: File) => {
    try {
      const n = await importData(JSON.parse(await file.text()) as ExportFile)
      setMessage(`${n} registros importados.`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  const doReset = async () => {
    const question = cloud.email
      ? 'Apagar os dados deste aparelho? A cópia da nuvem continua e volta na próxima sincronização.'
      : 'Apagar todos os seus registros, notas e preferências deste aparelho? Não dá para desfazer.'
    if (!window.confirm(question)) return
    await resetAll()
    onClose()
  }

  const doDeleteAccount = async () => {
    if (!window.confirm(`Excluir sua conta do ${APP_NAME} e tudo o que está na nuvem? Não dá para desfazer.`)) return
    setBusy(true)
    try {
      await deleteAccount()
      onClose()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Configurações" onClose={onClose}>
      <CloudSection />

      <section className="section">
        <h3>Seu histórico</h3>
        <div className="stats">
          {STATS.map((s) => (
            <div key={s.key} className="stat">
              <strong>{counts[s.key] ?? 0}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h3>
          <SlidersHorizontal /> Preferências
        </h3>
        <p>O que classificar, ordem e filtros do Descobrir e do Para você.</p>
        <div className="row">
          <button onClick={onOpenPrefs}>Abrir preferências</button>
        </div>
      </section>

      <section className="section">
        <h3>
          <Hand /> Gestos
        </h3>
        <ul className="gesture-help">
          <li>
            <b>↑</b> Quero ver
          </li>
          <li>
            <b>↗</b> Assistindo
          </li>
          <li>
            <b>→</b> Já vi
          </li>
          <li>
            <b>↘</b> Não gostei
          </li>
          <li>
            <b>↓</b> Não quero
          </li>
          <li>
            <b>↙</b> Larguei
          </li>
          <li>
            <b>←</b> Pular
          </li>
          <li>
            <b>↖</b> Em pausa
          </li>
          <li>
            <b>2×</b> Gostei (nota 8)
          </li>
          <li>
            <b>●</b> Segurar: favorito
          </li>
        </ul>
        <p>No teclado: setas, A assistindo, P pausa, L larguei, N não gostei, G gostei, F favorito e Z desfaz.</p>
        <div className="row">
          <button onClick={onOpenGuide}>Ver guia de gestos</button>
        </div>
      </section>

      <section className="section">
        <h3>
          <Download /> Backup
        </h3>
        <p>
          {cloud.email
            ? 'Um arquivo extra, para guardar fora da nuvem.'
            : 'Sem conta, seus dados ficam só neste aparelho. Exporte de vez em quando para não perder nada.'}
        </p>
        <div className="row">
          <button onClick={doExport}>
            <Download /> Exportar
          </button>
          <button onClick={() => fileRef.current?.click()}>
            <Upload /> Importar
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) doImport(f)
              e.target.value = ''
            }}
          />
        </div>
      </section>

      <section className="section">
        <h3>
          <Info /> Sobre
        </h3>
        <p>
          {APP_NAME} {__APP_VERSION__}. Gratuito e sem anúncios.
        </p>
        <div className="list-links">
          <a href="./termos.html" target="_blank" rel="noreferrer">
            <FileText /> Termos de Uso
          </a>
          <a href="./privacidade.html" target="_blank" rel="noreferrer">
            <Lock /> Política de Privacidade
          </a>
          <a href="https://github.com/BCGAdesigns/myanimeswipe" target="_blank" rel="noreferrer">
            <Code /> Código aberto
          </a>
        </div>
        <div className="credits">
          <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer" aria-label="The Movie Database">
            <img src="./tmdb.svg" alt="TMDB" />
          </a>
          <p>Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.</p>
          <p>
            Dados de anime: <a href="https://anilist.co" target="_blank" rel="noreferrer">AniList</a>. Onde assistir:
            JustWatch, via TMDB. Sem afiliação com AniList, MyAnimeList, Crunchyroll ou os serviços de streaming
            citados.
          </p>
        </div>
      </section>

      <section className="section">
        <h3>
          <ShieldAlert /> Zona de perigo
        </h3>
        <div className="row">
          <button className="danger" onClick={doReset}>
            Apagar dados deste aparelho
          </button>
          {cloud.email && (
            <button className="danger" disabled={busy} onClick={doDeleteAccount}>
              {busy ? 'Excluindo…' : 'Excluir conta'}
            </button>
          )}
        </div>
      </section>

      {message && <p className="message">{message}</p>}
    </Sheet>
  )
}
