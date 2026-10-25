import { ArrowLeft, Copy, Link2, Share2, Trash, UserPlus, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { codeFromInput, createShare, fetchSharedList, getMyShare, renameShare, shareLink, stopSharing, type MyShare } from '../friends/api'
import { compareLists, type Comparison, type SharedList } from '../friends/compare'
import { useStore } from '../store'
import type { Media } from '../types'
import { Cover, coverThumb } from './MediaCard'
import { TitleSheet } from './TitleSheet'

interface SavedFriend {
  code: string
  name: string | null
  compatibility: number | null
  savedAt: number
}

const FRIENDS_KEY = 'watchmatch:friends'

function readFriends(): SavedFriend[] {
  try {
    const list = JSON.parse(localStorage.getItem(FRIENDS_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((f) => f && typeof f.code === 'string') : []
  } catch {
    return []
  }
}

function writeFriends(list: SavedFriend[]) {
  try {
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(list.slice(0, 30)))
  } catch {
    // Kept for this session only.
  }
}

const spaced = (code: string) => `${code.slice(0, 5)} ${code.slice(5)}`

function errorText(e: unknown) {
  const text = e instanceof Error ? e.message : String(e)
  return /failed to fetch|network|load failed/i.test(text) ? 'Sem conexão. Tente de novo.' : text
}

interface Props {
  /** Code from a shared link (?amigo=), compared right away. */
  initialCode: string | null
  onInitialHandled: () => void
  onOpenSettings: () => void
}

export function FriendsTab({ initialCode, onInitialHandled, onOpenSettings }: Props) {
  const { cloud, entries, media } = useStore()
  const [myShare, setMyShare] = useState<MyShare | null | undefined>(undefined)
  const [shareName, setShareName] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [friends, setFriends] = useState(readFriends)
  const [active, setActive] = useState<{ code: string; list: SharedList } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Media | null>(null)

  const signedIn = Boolean(cloud.email)

  useEffect(() => {
    if (!signedIn) {
      setMyShare(undefined)
      return
    }
    getMyShare()
      .then((s) => {
        setMyShare(s)
        setShareName(s?.name ?? '')
      })
      .catch((e) => setNotice(errorText(e)))
  }, [signedIn])

  const compare = useCallback(async (raw: string) => {
    const code = codeFromInput(raw)
    if (!code) {
      setError('Código inválido: são 10 letras e números.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const list = await fetchSharedList(code)
      if (!list) {
        setError('Nenhuma lista com esse código. Confira com seu amigo.')
        return
      }
      setActive({ code, list })
      setCodeInput('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!initialCode) return
    onInitialHandled()
    void compare(initialCode)
  }, [initialCode, compare, onInitialHandled])

  const comparison: Comparison | null = useMemo(
    () => (active ? compareLists(entries, media, active.list) : null),
    [active, entries, media],
  )

  // Remember who was compared, with the latest score, for one tap next time.
  useEffect(() => {
    if (!active || !comparison || active.code === myShare?.code) return
    const next = [
      { code: active.code, name: active.list.name, compatibility: comparison.compatibility, savedAt: Date.now() },
      ...readFriends().filter((f) => f.code !== active.code),
    ]
    writeFriends(next)
    setFriends(next)
  }, [active, comparison, myShare?.code])

  const create = async () => {
    setBusy(true)
    setNotice(null)
    try {
      setMyShare(await createShare(shareName.trim() || null))
    } catch (e) {
      setNotice(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const saveName = async () => {
    if (!myShare) return
    const name = shareName.trim() || null
    if (name === myShare.name) return
    try {
      await renameShare(myShare.code, name)
      setMyShare({ ...myShare, name })
      setNotice('Nome atualizado.')
    } catch (e) {
      setNotice(errorText(e))
    }
  }

  const share = async () => {
    if (!myShare) return
    const url = shareLink(myShare.code)
    const text = 'Bora ver o que a gente tem em comum para assistir? Meu código no WatchMatch:'
    try {
      if (navigator.share) {
        await navigator.share({ title: 'WatchMatch', text: `${text} ${spaced(myShare.code)}`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setNotice('Link copiado.')
    } catch {
      // Share sheet dismissed.
    }
  }

  const copyCode = async () => {
    if (!myShare) return
    try {
      await navigator.clipboard.writeText(myShare.code)
      setNotice('Código copiado.')
    } catch {
      setNotice(`Seu código: ${spaced(myShare.code)}`)
    }
  }

  const stop = async () => {
    if (!myShare) return
    if (!window.confirm('Parar de compartilhar? Quem tem seu código não verá mais sua lista. Um código novo pode ser criado depois.')) return
    try {
      await stopSharing(myShare.code)
      setMyShare(null)
      setNotice('Você parou de compartilhar.')
    } catch (e) {
      setNotice(errorText(e))
    }
  }

  const forget = (code: string) => {
    const next = friends.filter((f) => f.code !== code)
    writeFriends(next)
    setFriends(next)
  }

  if (active && comparison) {
    return (
      <>
        <CompareView
          name={active.list.name ?? 'Seu amigo'}
          comparison={comparison}
          onBack={() => setActive(null)}
          onOpen={setOpen}
        />
        {open && <TitleSheet media={open} via="friend" onClose={() => setOpen(null)} />}
      </>
    )
  }

  return (
    <div className="friends">
      <div className="friends-hero">
        <Users />
        <h2>Match com amigos</h2>
        <p>Compare suas listas e descubra o que vocês dois querem ver, o que um recomenda ao outro e quanto o gosto bate.</p>
      </div>

      <section className="section">
        <h3>
          <UserPlus /> Comparar com alguém
        </h3>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            void compare(codeInput)
          }}
        >
          <input
            className="code-field"
            placeholder="Código do amigo"
            aria-label="Código do amigo"
            autoCapitalize="none"
            autoCorrect="off"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
          />
          <button type="submit" className="primary" disabled={busy || !codeInput.trim()}>
            {busy ? 'Buscando…' : 'Comparar'}
          </button>
        </form>
        {error && <p className="message">{error}</p>}
        {friends.length > 0 && (
          <ul className="friend-list">
            {friends.map((f) => (
              <li key={f.code}>
                <button className="friend" onClick={() => void compare(f.code)} disabled={busy}>
                  <span className="friend-avatar" aria-hidden>
                    {(f.name ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="friend-name">{f.name ?? spaced(f.code)}</span>
                  {f.compatibility !== null && <span className="friend-score">{f.compatibility}%</span>}
                </button>
                <button className="icon-btn" aria-label={`Esquecer ${f.name ?? 'amigo'}`} onClick={() => forget(f.code)}>
                  <X />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h3>
          <Link2 /> Seu código
        </h3>
        {cloud.status === 'off' ? (
          <p>Compartilhar precisa da conexão com o servidor, que esta versão não tem.</p>
        ) : !signedIn ? (
          <>
            <p>Para outra pessoa comparar com você, sua lista precisa estar na nuvem. Entre com seu e-mail e volte aqui.</p>
            <div className="row">
              <button onClick={onOpenSettings}>Entrar</button>
            </div>
          </>
        ) : myShare === undefined ? (
          <p>Carregando…</p>
        ) : myShare === null ? (
          <>
            <p>Crie um código e mande para quem você quiser. Quem tiver o código vê suas listas e notas (nunca seu e-mail).</p>
            <div className="row">
              <input
                className="code-field"
                placeholder="Seu nome para amigos (opcional)"
                maxLength={40}
                value={shareName}
                onChange={(e) => setShareName(e.target.value)}
              />
              <button className="primary" disabled={busy} onClick={() => void create()}>
                Criar meu código
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="share-code" aria-label="Seu código">
              {spaced(myShare.code)}
            </p>
            <div className="row">
              <button className="primary" onClick={() => void share()}>
                <Share2 /> Compartilhar link
              </button>
              <button onClick={() => void copyCode()}>
                <Copy /> Copiar código
              </button>
            </div>
            <div className="row">
              <input
                className="code-field"
                placeholder="Seu nome para amigos (opcional)"
                maxLength={40}
                value={shareName}
                onChange={(e) => setShareName(e.target.value)}
                onBlur={() => void saveName()}
              />
            </div>
            <div className="row">
              <button className="link-btn danger-link" onClick={() => void stop()}>
                <Trash size={15} /> Parar de compartilhar
              </button>
            </div>
          </>
        )}
        {notice && <p className="message">{notice}</p>}
      </section>
    </div>
  )
}

function Row({ title, ids, comparison, onOpen }: { title: string; ids: string[]; comparison: Comparison; onOpen: (m: Media) => void }) {
  if (!ids.length) return null
  return (
    <section className="compare-row">
      <h4>
        {title} <span>{ids.length}</span>
      </h4>
      <div className="poster-row">
        {ids.slice(0, 30).map((id) => {
          const m = comparison.media.get(id)
          if (!m) return null
          return (
            <button key={id} className="poster" onClick={() => onOpen(m)}>
              <Cover src={coverThumb(m)} lazy />
              <span>{m.title}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function CompareView({
  name,
  comparison,
  onBack,
  onOpen,
}: {
  name: string
  comparison: Comparison
  onBack: () => void
  onOpen: (m: Media) => void
}) {
  const c = comparison
  const total = c.bothWant.length + c.bothLoved.length + c.theyRecommend.length + c.youRecommend.length + c.disagree.length
  return (
    <div className="compare">
      <button className="link-btn" onClick={onBack}>
        <ArrowLeft size={16} /> Amigos
      </button>
      <div className="compare-head">
        <div className="compat" style={{ ['--p' as string]: c.compatibility ?? 0 }}>
          <strong>{c.compatibility === null ? '?' : `${c.compatibility}%`}</strong>
        </div>
        <div>
          <h2>Você e {name}</h2>
          <p>
            {c.compatibility === null
              ? 'Ainda não dá para medir a compatibilidade: avaliem alguns títulos em comum.'
              : `Compatibilidade de gosto, com base em ${c.common} ${c.common === 1 ? 'título' : 'títulos'} em comum.`}
          </p>
        </div>
      </div>
      <Row title="Vocês dois querem ver" ids={c.bothWant} comparison={c} onOpen={onOpen} />
      <Row title={`${name} recomenda para você`} ids={c.theyRecommend} comparison={c} onOpen={onOpen} />
      <Row title="Os dois amaram" ids={c.bothLoved} comparison={c} onOpen={onOpen} />
      <Row title={`Você recomenda para ${name}`} ids={c.youRecommend} comparison={c} onOpen={onOpen} />
      <Row title="Vocês discordam" ids={c.disagree} comparison={c} onOpen={onOpen} />
      {total === 0 && (
        <div className="empty-state">
          <p className="empty-icon" aria-hidden>
            🤝
          </p>
          <p>Nada em comum por enquanto. Classifiquem mais títulos e comparem de novo.</p>
        </div>
      )}
    </div>
  )
}
