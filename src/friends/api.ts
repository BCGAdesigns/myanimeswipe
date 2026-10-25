// Friend codes (`public.shares`) and reading a friend's list (`public.shared_list`).
import { getClient } from '../sync/client'
import { parseSharedList, type SharedList } from './compare'

/** No i, l, o, 0 or 1: codes get read aloud and typed by hand. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export const CODE_LENGTH = 10

export function newShareCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/** Accepts a bare code or a pasted share link. */
export function codeFromInput(input: string): string | null {
  const text = input.trim()
  let candidate = text
  try {
    const fromLink = new URL(text).searchParams.get('amigo')
    if (fromLink) candidate = fromLink
  } catch {
    // Not a link: a typed code.
  }
  const code = candidate.toLowerCase().replace(/[^a-z0-9]/g, '')
  return code.length === CODE_LENGTH ? code : null
}

export function shareLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}?amigo=${code}`
}

export interface MyShare {
  code: string
  name: string | null
}

async function client() {
  const c = await getClient()
  if (!c) throw new Error('Esta versão do app não tem conexão com o servidor.')
  return c
}

export async function getMyShare(): Promise<MyShare | null> {
  const { data, error } = await (await client()).from('shares').select('code, name').maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function createShare(name: string | null): Promise<MyShare> {
  const c = await client()
  // A collision on a random 10 character code is very unlikely; try a couple of times anyway.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await c.from('shares').insert({ code: newShareCode(), name }).select('code, name').single()
    if (!error) return data
    if (!/duplicate|unique/i.test(error.message)) throw new Error(error.message)
  }
  throw new Error('Não consegui gerar um código agora. Tente de novo.')
}

export async function renameShare(code: string, name: string | null): Promise<void> {
  const { error } = await (await client()).from('shares').update({ name }).eq('code', code)
  if (error) throw new Error(error.message)
}

export async function stopSharing(code: string): Promise<void> {
  const { error } = await (await client()).from('shares').delete().eq('code', code)
  if (error) throw new Error(error.message)
}

/** A friend's list by code; null when no one shares with that code. Works signed out. */
export async function fetchSharedList(code: string): Promise<SharedList | null> {
  const { data, error } = await (await client()).rpc('shared_list', { share_code: code })
  if (error) throw new Error(error.message)
  return parseSharedList(data)
}
