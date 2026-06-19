import { createClient } from '@supabase/supabase-js'
import { ADMIN_EMAIL } from './admin'

export async function verifyAdmin(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return false

  const client = createClient(url, anonKey)
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return false
  return data.user.email === ADMIN_EMAIL
}
