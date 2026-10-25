import { UserPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { addByInvite, type Person } from '../../friends/api'
import { personName } from '../../friends/feed'
import { useSocial } from '../../friends/social'
import { useStore } from '../../store'
import { FeedView } from './FeedView'
import { FriendProfile } from './FriendProfile'
import { FriendsView } from './FriendsView'
import { errorText, Tabs } from './parts'
import { ProfileForm } from './ProfileForm'
import { RecsView } from './RecsView'
import { TestsView } from './TestsView'

/** An invite (?convite=code) or a profile link (?amigo=username) the app was opened with. */
export type SocialLink = { kind: 'invite'; code: string } | { kind: 'profile'; username: string }

type Section = 'feed' | 'friends' | 'recs' | 'tests'

interface Props {
  link: SocialLink | null
  onLinkHandled: () => void
  onOpenSettings: () => void
}

export function SocialTab({ link, onLinkHandled, onOpenSettings }: Props) {
  const { cloud } = useStore()
  const social = useSocial()
  const { me, counts } = social
  const [section, setSection] = useState<Section>(() =>
    link ? 'friends' : counts.recs ? 'recs' : counts.tests ? 'tests' : counts.requests ? 'friends' : 'feed',
  )
  const [friend, setFriend] = useState<Person | null>(null)
  const [testWith, setTestWith] = useState<Person | null>(null)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const redeemed = useRef<string | null>(null)

  // An invite link makes friends at once, as soon as the user has a card.
  useEffect(() => {
    if (link?.kind !== 'invite' || !me || redeemed.current === link.code) return
    redeemed.current = link.code
    addByInvite(link.code)
      .then((p) => {
        onLinkHandled()
        if (!p) return
        setNotice(`Você e ${personName(p)} agora são amigos.`)
        void social.refresh()
        setFriend(p)
      })
      .catch((e) => {
        const message = errorText(e)
        setNotice(message)
        // Offline: keep the invite for the next visit.
        if (!/conexão/i.test(message)) onLinkHandled()
      })
  }, [link, me, onLinkHandled, social])

  if (cloud.status === 'off') {
    return (
      <div className="social">
        <section className="section">
          <p>Amigos precisam da conexão com o servidor, que esta versão do app não tem.</p>
        </section>
      </div>
    )
  }

  if (!cloud.email) {
    return (
      <div className="social">
        <div className="friends-hero">
          <UserPlus />
          <h2>Assista junto com seus amigos</h2>
          <p>
            Veja o que eles estão assistindo, compare notas, mande recomendações e descubra quem tem o gosto mais parecido
            com o seu.
          </p>
        </div>
        <section className="section">
          <p>
            {link?.kind === 'invite'
              ? 'Você recebeu um convite. Entre com seu e-mail para aceitar.'
              : link?.kind === 'profile'
                ? `Entre com seu e-mail para adicionar @${link.username}.`
                : 'Para ter amigos você precisa de uma conta: entre com seu e-mail. Leva um minuto.'}
          </p>
          <div className="row">
            <button className="primary" onClick={onOpenSettings}>
              Entrar
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (me === undefined) {
    return (
      <div className="social">
        <div className="skeleton-line" aria-label="Carregando" />
        {social.error && <p className="message center">{social.error}</p>}
      </div>
    )
  }

  if (me === null || editing) {
    return (
      <div className="social">
        <ProfileForm
          me={me}
          email={cloud.email}
          intro={!me && link?.kind === 'invite' ? 'Você recebeu um convite. Crie seu perfil e a amizade é feita na hora.' : undefined}
          onSaved={(p) => {
            social.setMe(p)
            setEditing(false)
          }}
          onCancel={me ? () => setEditing(false) : undefined}
        />
      </div>
    )
  }

  if (friend) {
    return (
      <div className="social">
        <FriendProfile
          person={friend}
          onBack={() => setFriend(null)}
          onStartTest={(p) => {
            setFriend(null)
            setTestWith(p)
            setSection('tests')
          }}
        />
      </div>
    )
  }

  return (
    <div className="social">
      <Tabs
        label="Amigos"
        value={section}
        onChange={(s) => {
          setSection(s)
          setNotice(null)
        }}
        items={[
          { id: 'feed', label: 'Feed', badge: counts.likes },
          { id: 'friends', label: 'Amigos', badge: counts.requests },
          { id: 'recs', label: 'Indicações', badge: counts.recs },
          { id: 'tests', label: 'Testes', badge: counts.tests },
        ]}
      />
      {notice && <p className="message center">{notice}</p>}
      {section === 'feed' && <FeedView onOpenFriend={setFriend} onGoFriends={() => setSection('friends')} />}
      {section === 'friends' && (
        <FriendsView
          onOpenFriend={setFriend}
          onEditProfile={() => setEditing(true)}
          linkHandle={link?.kind === 'profile' ? link.username : null}
          onLinkHandled={onLinkHandled}
        />
      )}
      {section === 'recs' && <RecsView onOpenFriend={setFriend} />}
      {section === 'tests' && <TestsView startWith={testWith} onStarted={() => setTestWith(null)} onOpenFriend={setFriend} />}
    </div>
  )
}
