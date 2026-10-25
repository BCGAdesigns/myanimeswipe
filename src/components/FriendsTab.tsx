import { ArrowLeft, AtSign, Check, Pencil, Search, Share2, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  findPeople,
  fetchFriendList,
  inviteLink,
  getMyProfile,
  myFriends,
  normalizeUsername,
  removeFriend,
  requestFriend,
  respondFriend,
  saveMyProfile,
  USERNAME_RULE,
  type FriendRow,
  type MyProfile,
  type Person,
} from '../friends/api'
import { compareLists, type Comparison, type SharedList } from '../friends/compare'
import { useStore } from '../store'
import type { Media } from '../types'
import { Cover, coverThumb } from './MediaCard'
import { TitleSheet } from './TitleSheet'

/** Waits for a pause in typing before searching people. */
const SEARCH_DEBOUNCE_MS = 300

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const label = (p: { displayName: string | null; username: string }) => p.displayName ?? `@${p.username}`

function Avatar({ person }: { person: { displayName: string | null; username: string } }) {
  return (
    <span className="friend-avatar" aria-hidden>
      {(person.displayName ?? person.username).slice(0, 1).toUpperCase()}
    </span>
  )
}

interface Props {
  /** Username from an invite link (?amigo=), offered right away. */
  initialHandle: string | null
  onInitialHandled: () => void
  onOpenSettings: () => void
  /** Incoming requests waiting for an answer (badge on the tab). */
  onRequestsChanged: (count: number) => void
}

export function FriendsTab({ initialHandle, onInitialHandled, onOpenSettings, onRequestsChanged }: Props) {
  const { cloud, entries, media } = useStore()
  const signedIn = Boolean(cloud.email)
  const [me, setMe] = useState<MyProfile | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<FriendRow[]>([])
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Person[] | null>(null)
  /** person: undefined while looking up, null when nobody has that username. */
  const [invite, setInvite] = useState<{ handle: string; person: Person | null | undefined } | null>(null)
  const [active, setActive] = useState<{ friend: Person; list: SharedList } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [open, setOpen] = useState<Media | null>(null)

  const refresh = useCallback(async () => {
    try {
      const list = await myFriends()
      setRows(list)
      onRequestsChanged(list.filter((r) => r.state === 'incoming').length)
    } catch (e) {
      setNotice(errorText(e))
    }
  }, [onRequestsChanged])

  useEffect(() => {
    if (!signedIn) {
      setMe(undefined)
      setRows([])
      return
    }
    getMyProfile()
      .then((p) => {
        setMe(p)
        if (p) void refresh()
      })
      .catch((e) => setNotice(errorText(e)))
  }, [signedIn, refresh])

  // An invite link names a person: look them up once there is someone signed in to add them.
  useEffect(() => {
    if (!initialHandle) return
    const handle = normalizeUsername(initialHandle)
    setInvite({ handle, person: undefined })
    if (!signedIn || !me) return
    onInitialHandled()
    findPeople(handle)
      .then((people) => setInvite({ handle, person: people.find((p) => p.username === handle) ?? null }))
      .catch((e) => setNotice(errorText(e)))
  }, [initialHandle, signedIn, me, onInitialHandled])

  useEffect(() => {
    const q = normalizeUsername(query)
    if (q.length < 3) {
      setFound(null)
      return
    }
    const timer = window.setTimeout(() => {
      findPeople(q)
        .then(setFound)
        .catch((e) => setNotice(errorText(e)))
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const stateOf = (userId: string) => rows.find((r) => r.userId === userId)?.state ?? null

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    setNotice(null)
    try {
      await action()
      await refresh()
      if (done) setNotice(done)
    } catch (e) {
      setNotice(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const add = (p: Person) =>
    run(async () => {
      const result = await requestFriend(p.userId)
      setNotice(result === 'friends' ? `Você e ${label(p)} agora são amigos.` : `Pedido enviado para @${p.username}.`)
    })

  const openFriend = async (p: Person) => {
    setBusy(true)
    setNotice(null)
    try {
      const list = await fetchFriendList(p.userId)
      if (!list) {
        setNotice('Essa amizade não está mais ativa.')
        await refresh()
        return
      }
      setActive({ friend: p, list })
    } catch (e) {
      setNotice(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const unfriend = (p: Person) => {
    if (!window.confirm(`Desfazer a amizade com ${label(p)}? Vocês dois deixam de ver as listas um do outro.`)) return
    setActive(null)
    void run(() => removeFriend(p.userId), 'Amizade desfeita.')
  }

  const share = async () => {
    if (!me) return
    const url = inviteLink(me.username)
    try {
      if (navigator.share) {
        await navigator.share({ title: 'WatchMatch', text: `Me adiciona no WatchMatch: @${me.username}`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setNotice('Link de convite copiado.')
    } catch {
      // Share sheet dismissed.
    }
  }

  const comparison: Comparison | null = useMemo(
    () => (active ? compareLists(entries, media, active.list) : null),
    [active, entries, media],
  )

  if (active && comparison) {
    return (
      <>
        <CompareView
          name={label(active.friend)}
          comparison={comparison}
          onBack={() => setActive(null)}
          onOpen={setOpen}
          onUnfriend={() => unfriend(active.friend)}
        />
        {open && <TitleSheet media={open} via="friend" onClose={() => setOpen(null)} />}
      </>
    )
  }

  const friends = rows.filter((r) => r.state === 'friend')
  const incoming = rows.filter((r) => r.state === 'incoming')
  const outgoing = rows.filter((r) => r.state === 'outgoing')

  return (
    <div className="friends">
      <div className="friends-hero">
        <Users />
        <h2>Match com amigos</h2>
        <p>
          Adicione pelo @usuário. Quando a pessoa aceitar, vocês dois veem as listas um do outro e descobrem o que querem ver
          juntos.
        </p>
      </div>

      {cloud.status === 'off' ? (
        <section className="section">
          <p>Amigos precisam da conexão com o servidor, que esta versão não tem.</p>
        </section>
      ) : !signedIn ? (
        <section className="section">
          <h3>
            <UserPlus /> Entre para ter amigos
          </h3>
          <p>
            {invite
              ? `Você recebeu um convite de @${invite.handle}. Entre com seu e-mail para aceitar.`
              : 'Amigos precisam de conta: entre com seu e-mail e escolha um nome de usuário.'}
          </p>
          <div className="row">
            <button className="primary" onClick={onOpenSettings}>
              Entrar
            </button>
          </div>
        </section>
      ) : me === undefined ? (
        <div className="skeleton-line" aria-label="Carregando" />
      ) : me === null || editing ? (
        <ProfileForm
          me={me}
          onSaved={(p) => {
            setMe(p)
            setEditing(false)
            void refresh()
          }}
          onCancel={me ? () => setEditing(false) : undefined}
        />
      ) : (
        <>
          <section className="section me-card">
            <Avatar person={me} />
            <div className="me-info">
              <strong>{me.displayName ?? me.username}</strong>
              <span>@{me.username}</span>
            </div>
            <button className="icon-btn" aria-label="Editar perfil" onClick={() => setEditing(true)}>
              <Pencil />
            </button>
            <button className="primary" onClick={() => void share()}>
              <Share2 /> Convidar
            </button>
          </section>

          {invite && (
            <section className="section invite">
              {invite.person === undefined ? (
                <p>Procurando @{invite.handle}…</p>
              ) : invite.person ? (
                <PersonRow
                  person={invite.person}
                  state={stateOf(invite.person.userId)}
                  busy={busy}
                  onAdd={add}
                  onOpen={openFriend}
                  onAccept={(p) => void run(() => respondFriend(p.userId, true), `Você e ${label(p)} agora são amigos.`)}
                />
              ) : (
                <p>Ninguém com o usuário @{invite.handle}. Confira o link com quem te convidou.</p>
              )}
              <button className="icon-btn invite-close" aria-label="Fechar convite" onClick={() => setInvite(null)}>
                <X />
              </button>
            </section>
          )}

          {incoming.length > 0 && (
            <section className="section">
              <h3>Pedidos de amizade</h3>
              <ul className="friend-list">
                {incoming.map((p) => (
                  <li key={p.userId}>
                    <span className="friend">
                      <Avatar person={p} />
                      <span className="friend-name">
                        {label(p)}
                        <small>@{p.username}</small>
                      </span>
                    </span>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void run(() => respondFriend(p.userId, true), `Você e ${label(p)} agora são amigos.`)}
                    >
                      <Check /> Aceitar
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Recusar ${label(p)}`}
                      disabled={busy}
                      onClick={() => void run(() => respondFriend(p.userId, false))}
                    >
                      <X />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="section">
            <h3>
              <Users /> Amigos <span className="muted">{friends.length}</span>
            </h3>
            {friends.length === 0 ? (
              <p>Ninguém ainda. Busque pelo @usuário abaixo ou toque em Convidar e mande o link.</p>
            ) : (
              <ul className="friend-list">
                {friends.map((p) => (
                  <li key={p.userId}>
                    <button className="friend" disabled={busy} onClick={() => void openFriend(p)}>
                      <Avatar person={p} />
                      <span className="friend-name">
                        {label(p)}
                        <small>@{p.username}</small>
                      </span>
                      <span className="friend-go">Comparar</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section">
            <h3>
              <UserPlus /> Adicionar amigo
            </h3>
            <label className="search-field small">
              <Search />
              <input
                placeholder="Buscar @usuário"
                aria-label="Buscar pessoas pelo nome de usuário"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {found && found.length === 0 && <p className="small muted">Ninguém com esse começo de nome.</p>}
            {found && found.length > 0 && (
              <ul className="friend-list">
                {found.map((p) => (
                  <li key={p.userId}>
                    <PersonRow
                      person={p}
                      state={stateOf(p.userId)}
                      busy={busy}
                      onAdd={add}
                      onOpen={openFriend}
                      onAccept={(x) => void run(() => respondFriend(x.userId, true), `Você e ${label(x)} agora são amigos.`)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {outgoing.length > 0 && (
              <>
                <h4 className="title-section">Aguardando resposta</h4>
                <ul className="friend-list">
                  {outgoing.map((p) => (
                    <li key={p.userId}>
                      <span className="friend">
                        <Avatar person={p} />
                        <span className="friend-name">
                          {label(p)}
                          <small>@{p.username}</small>
                        </span>
                      </span>
                      <button className="link-btn" disabled={busy} onClick={() => void run(() => removeFriend(p.userId))}>
                        Cancelar
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
      {notice && <p className="message center">{notice}</p>}
    </div>
  )
}

function PersonRow({
  person,
  state,
  busy,
  onAdd,
  onOpen,
  onAccept,
}: {
  person: Person
  state: FriendRow['state'] | null
  busy: boolean
  onAdd: (p: Person) => void
  onOpen: (p: Person) => void
  onAccept: (p: Person) => void
}) {
  return (
    <div className="person-row">
      <span className="friend">
        <Avatar person={person} />
        <span className="friend-name">
          {label(person)}
          <small>@{person.username}</small>
        </span>
      </span>
      {state === 'friend' ? (
        <button disabled={busy} onClick={() => onOpen(person)}>
          Comparar
        </button>
      ) : state === 'outgoing' ? (
        <span className="small muted">Pedido enviado</span>
      ) : state === 'incoming' ? (
        <button className="primary" disabled={busy} onClick={() => onAccept(person)}>
          <Check /> Aceitar
        </button>
      ) : (
        <button className="primary" disabled={busy} onClick={() => onAdd(person)}>
          <UserPlus /> Adicionar
        </button>
      )}
    </div>
  )
}

function ProfileForm({
  me,
  onSaved,
  onCancel,
}: {
  me: MyProfile | null
  onSaved: (p: MyProfile) => void
  onCancel?: () => void
}) {
  const [username, setUsername] = useState(me?.username ?? '')
  const [displayName, setDisplayName] = useState(me?.displayName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = normalizeUsername(username)
  const valid = USERNAME_RULE.test(name)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      const profile = { username: name, displayName: displayName.trim() || null }
      await saveMyProfile(profile.username, profile.displayName)
      onSaved(profile)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="section" onSubmit={save}>
      <h3>
        <AtSign /> {me ? 'Seu perfil' : 'Escolha seu nome de usuário'}
      </h3>
      <p>É assim que seus amigos te encontram. Só aparecem o @usuário e o nome, nunca seu e-mail.</p>
      <label className="field">
        Nome de usuário
        <span className="at-input">
          <span>@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
            placeholder="seunome"
            maxLength={21}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </span>
      </label>
      <p className={`field-hint after${username && !valid ? ' warn' : ''}`}>3 a 20 caracteres: letras sem acento, números, _ ou ponto.</p>
      <label className="field">
        Nome para mostrar (opcional)
        <input
          className="code-field"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Como seus amigos te chamam"
          maxLength={40}
        />
      </label>
      <div className="row">
        <button type="submit" className="primary" disabled={!valid || saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
      {error && <p className="message">{error}</p>}
    </form>
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
  onUnfriend,
}: {
  name: string
  comparison: Comparison
  onBack: () => void
  onOpen: (m: Media) => void
  onUnfriend: () => void
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
      <div className="row center">
        <button className="link-btn danger-link" onClick={onUnfriend}>
          <UserMinus size={15} /> Desfazer amizade
        </button>
      </div>
    </div>
  )
}
