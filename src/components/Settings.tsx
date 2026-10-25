import { useRef, useState } from 'react'
import { useStore, type ExportFile } from '../store'

export function Settings({ onClose }: { onClose: () => void }) {
  const { entries, exportData, importData, resetAll } = useStore()
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const counts = { want: 0, reject: 0, skip: 0, seen: 0 }
  for (const e of entries.values()) counts[e.status]++

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `myanimeswipe-backup-${new Date().toISOString().slice(0, 10)}.json`
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
    if (!window.confirm('Apagar todos os swipes, notas e o catálogo salvo neste aparelho? Não dá para desfazer.')) return
    await resetAll()
    setMessage('Tudo apagado.')
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Configurações</h2>
        <p className="stats">
          Já vi {counts.seen} · Quero ver {counts.want} · Não quero {counts.reject} · Pulados {counts.skip}
        </p>

        <h3>Backup</h3>
        <p>Seus dados ficam só neste aparelho. Exporte de vez em quando para não perder nada.</p>
        <div className="row">
          <button onClick={doExport}>Exportar JSON</button>
          <button onClick={() => fileRef.current?.click()}>Importar JSON</button>
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

        <h3>Gestos</h3>
        <ul className="gesture-help">
          <li>↑ Quero ver</li>
          <li>↓ Não quero (não recomendar)</li>
          <li>← Pular (volta depois)</li>
          <li>→ Já vi</li>
          <li>↗ Já vi e gostei (nota 8 sugerida)</li>
          <li>↘ Já vi e não gostei (nota 3 sugerida)</li>
          <li>Teclado: setas, G gostei, N não gostei, Z desfazer</li>
        </ul>

        <h3>Zona de perigo</h3>
        <button className="danger" onClick={doReset}>
          Apagar tudo
        </button>

        {message && <p className="message">{message}</p>}

        <p className="credits">
          Dados do AniList. Sem afiliação com AniList, MyAnimeList ou Crunchyroll.
        </p>
        <button className="close" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  )
}
