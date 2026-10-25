import { AtSign } from 'lucide-react'
import { useState } from 'react'
import { normalizeUsername, saveMyProfile, suggestUsername, USERNAME_RULE, type MyProfile } from '../../friends/api'
import { Avatar, AVATARS, errorText } from './parts'

interface Props {
  me: MyProfile | null
  /** Seeds the username suggestion on the first visit. */
  email: string | null
  /** Replaces the explanation (an invite waiting for the profile). */
  intro?: string
  onSaved: (p: MyProfile) => void
  onCancel?: () => void
}

export function ProfileForm({ me, email, intro, onSaved, onCancel }: Props) {
  const [username, setUsername] = useState(me?.username ?? suggestUsername(email))
  const [displayName, setDisplayName] = useState(me?.displayName ?? '')
  const [avatar, setAvatar] = useState<string | null>(me?.avatar ?? null)
  const [bio, setBio] = useState(me?.bio ?? '')
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
      onSaved(await saveMyProfile({ username: name, displayName: displayName.trim() || null, avatar, bio: bio.trim() || null }))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="section profile-form" onSubmit={save}>
      <h3>
        <AtSign /> {me ? 'Editar perfil' : 'Crie seu perfil'}
      </h3>
      <p>{intro ?? 'É assim que seus amigos te encontram. Eles veem o @usuário, o nome, a foto e a bio, nunca o seu e-mail.'}</p>

      <div className="avatar-preview">
        <Avatar person={{ avatar, displayName: displayName.trim() || null, username: name || '?' }} size="lg" />
      </div>
      <div className="avatar-picker" role="radiogroup" aria-label="Foto do perfil">
        <button type="button" role="radio" aria-checked={avatar === null} aria-label="Inicial do nome" className={avatar === null ? 'on' : ''} onClick={() => setAvatar(null)}>
          Aa
        </button>
        {AVATARS.map((a) => (
          <button key={a} type="button" role="radio" aria-checked={avatar === a} className={avatar === a ? 'on' : ''} onClick={() => setAvatar(a)}>
            {a}
          </button>
        ))}
      </div>

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
      <label className="field">
        Bio (opcional)
        <textarea
          className="code-field"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="O que você gosta de assistir?"
          maxLength={160}
          rows={2}
        />
      </label>
      <div className="row">
        <button type="submit" className="primary" disabled={!valid || saving}>
          {saving ? 'Salvando…' : me ? 'Salvar' : 'Criar perfil'}
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
