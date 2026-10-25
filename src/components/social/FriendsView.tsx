import { Check, ChevronRight, Copy, Pencil, RefreshCw, Search, Share2, Ticket, UserPlus, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  addByInvite,
  findPeople,
  inviteCodeFromInput,
  inviteLink,
  normalizeUsername,
  regenerateInvite,
  removeFriend,
  requestFriend,
  respondFriend,
  spacedCode,
  usernameFromInput,
  type FriendState,
  type Person,
} from '../../friends/api'
import { personName } from '../../friends/feed'
import { useSocial } from '../../friends/social'
import { Avatar, errorText, PersonName } from './parts'

/** Waits for a pause in typing before searching people. */
const SEARCH_DEBOUNCE_MS = 300

interface Props {
  onOpenFriend: (p: Person) => void
  onEditProfile: () => void
  /** Username from a profile link (?amigo=), offered once. */
  linkHandle: string | null
  onLinkHandled: () => void
}

export function FriendsView({ onOpenFriend, onEditProfile, linkHandle, onLinkHandled }: Props) {
  const { me, loaded, rows, friends, compat, refresh, setMe } = useSocial()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Person[] | null>(null)
  /** person: undefined while looking up, null when nobody has that username. */
  const [linked, setLinked] = useState<{ handle: string; person: Person | null | undefined } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!linkHandle) return
    const handle = normalizeUsername(linkHandle)
    onLinkHandled()
    setLinked({ handle, person: undefined })
    findPeople(handle)
      .then((people) => setLinked({ handle, person: people.find((p) => p.username === handle) ?? null }))
      .catch((e) => setNotice(errorText(e)))
  }, [linkHandle, onLinkHandled])

  const code = inviteCodeFromInput(query)
  const handle = usernameFromInput(query)
  useEffect(() => {
    if (!handle) {
      setFound(null)
      return
    }
    const timer = window.setTimeout(() => {
      findPeople(handle)
        .then(setFound)
        .catch((e) => setNotice(errorText(e)))
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [handle])

  const stateOf = (userId: string): FriendState | null => rows.find((r) => r.userId === userId)?.state ?? null
  const incoming = rows.filter((r) => r.state === 'incoming')
  const outgoing = rows.filter((r) => r.state === 'outgoing')
  // Best matches first; friends never compared go after, by name.
  const ranked = useMemo(
    () =>
      [...friends].sort((a, b) => (compat[b.userId] ?? -1) - (compat[a.userId] ?? -1) || personName(a).localeCompare(personName(b), 'pt-BR')),
    [friends, compat],
  )

  const run = async (action: () => Promise<string | void>) => {
    setBusy(true)
    setNotice(null)
    try {
      const done = await action()
      await refresh()
      if (done) setNotice(done)
    } catch (e) {
      setNotice(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const add = (p: Person) =>
    run(async () => ((await requestFriend(p.userId)) === 'friends' ? `Você e ${personName(p)} agora são amigos.` : `Pedido enviado para @${p.username}.`))
  const accept = (p: Person) =>
    run(async () => {
      await respondFriend(p.userId, true)
      return `Você e ${personName(p)} agora são amigos.`
    })
  const redeem = (c: string) =>
    run(async () => {
      const p = await addByInvite(c)
      setQuery('')
      return p ? `Você e ${personName(p)} agora são amigos.` : undefined
    })

  if (!me) return null

  const share = async () => {
    if (!me.inviteCode) return
    const url = inviteLink(me.inviteCode)
    try {
      if (navigator.share) {
        await navigator.share({ title: 'WatchMatch', text: `Vamos comparar o que a gente assiste? Me adiciona no WatchMatch:`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setNotice('Link de convite copiado.')
    } catch {
      // Share sheet dismissed.
    }
  }

  const copyCode = async () => {
    if (!me.inviteCode) return
    try {
      await navigator.clipboard.writeText(me.inviteCode)
      setNotice('Código copiado.')
    } catch {
      setNotice(`Seu código: ${spacedCode(me.inviteCode)}`)
    }
  }

  const newCode = () => {
    if (!window.confirm('Gerar um código novo? O código e o link antigos param de funcionar.')) return
    void run(async () => {
      const fresh = await regenerateInvite()
      setMe({ ...me, inviteCode: fresh })
      return 'Código novo pronto.'
    })
  }

  return (
    <div className="friends-view">
      <section className="section me-card">
        <Avatar person={me} size="lg" />
        <div className="me-info">
          <strong>{personName(me)}</strong>
          <span>@{me.username}</span>
          {me.bio && <p className="me-bio">{me.bio}</p>}
        </div>
        <button className="icon-btn" aria-label="Editar perfil" onClick={onEditProfile}>
          <Pencil />
        </button>
      </section>

      {me.inviteCode && (
        <section className="section invite-card">
          <h3>
            <Ticket /> Seu convite
          </h3>
          <p>Quem usar seu código ou abrir seu link vira seu amigo na hora. Mande só para quem você quer adicionar.</p>
          <p className="share-code" aria-label="Seu código de convite">
            {spacedCode(me.inviteCode)}
          </p>
          <div className="row">
            <button className="primary" onClick={() => void share()}>
              <Share2 /> Enviar convite
            </button>
            <button onClick={() => void copyCode()}>
              <Copy /> Copiar código
            </button>
            <button className="link-btn" disabled={busy} onClick={newCode}>
              <RefreshCw size={15} /> Trocar
            </button>
          </div>
        </section>
      )}

      {linked && (
        <section className="section invite">
          {linked.person === undefined ? (
            <p>Procurando @{linked.handle}…</p>
          ) : linked.person ? (
            <PersonRow person={linked.person} state={stateOf(linked.person.userId)} busy={busy} onAdd={add} onOpen={onOpenFriend} onAccept={accept} />
          ) : (
            <p>Ninguém com o usuário @{linked.handle}. Confira o link com quem te mandou.</p>
          )}
          <button className="icon-btn invite-close" aria-label="Fechar" onClick={() => setLinked(null)}>
            <X />
          </button>
        </section>
      )}

      <section className="section">
        <h3>
          <UserPlus /> Adicionar amigo
        </h3>
        <label className="search-field small">
          <Search />
          <input
            placeholder="Código de convite ou @usuário"
            aria-label="Código de convite ou nome de usuário"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {code && (
          <button className="primary use-code" disabled={busy} onClick={() => void redeem(code)}>
            <Ticket /> Usar o código {spacedCode(code)}
          </button>
        )}
        {found && found.length === 0 && !code && <p className="small muted">Ninguém com esse começo de nome.</p>}
        {found && found.length > 0 && (
          <ul className="friend-list">
            {found.map((p) => (
              <li key={p.userId}>
                <PersonRow person={p} state={stateOf(p.userId)} busy={busy} onAdd={add} onOpen={onOpenFriend} onAccept={accept} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {incoming.length > 0 && (
        <section className="section">
          <h3>Pedidos de amizade</h3>
          <ul className="friend-list">
            {incoming.map((p) => (
              <li key={p.userId}>
                <span className="friend">
                  <Avatar person={p} />
                  <PersonName person={p} />
                </span>
                <button className="primary" disabled={busy} onClick={() => void accept(p)}>
                  <Check /> Aceitar
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Recusar ${personName(p)}`}
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
        {!loaded ? (
          <div className="skeleton-line short" aria-label="Carregando" />
        ) : friends.length === 0 ? (
          <p>Ninguém ainda. Mande seu convite ou busque pelo @usuário acima.</p>
        ) : (
          <ul className="friend-list">
            {ranked.map((p) => {
              const c = compat[p.userId]
              return (
                <li key={p.userId}>
                  <button className="friend" onClick={() => onOpenFriend(p)}>
                    <Avatar person={p} />
                    <PersonName person={p} />
                    {c !== undefined && c !== null && (
                      <span className="compat-chip" title="Compatibilidade">
                        {c}%
                      </span>
                    )}
                    <ChevronRight className="friend-go-icon" />
                  </button>
                </li>
              )
            })}
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
                    <PersonName person={p} />
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
  state: FriendState | null
  busy: boolean
  onAdd: (p: Person) => void
  onOpen: (p: Person) => void
  onAccept: (p: Person) => void
}) {
  return (
    <div className="person-row">
      <span className="friend">
        <Avatar person={person} />
        <PersonName person={person} />
      </span>
      {state === 'friend' ? (
        <button disabled={busy} onClick={() => onOpen(person)}>
          Ver perfil
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
