import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET missing')

export function signJwt(payload, opts = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d', ...opts })
}

export function verifyJwt(token) {
  try { return jwt.verify(token, JWT_SECRET) } catch { return null }
}