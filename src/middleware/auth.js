import { verifyJwt } from '../lib/auth.js'
import Membership from '../models/Membership.js'

export async function requireAuth(req, res, next) {
  const h = req.headers['authorization'] || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  const decoded = token ? verifyJwt(token) : null
  if (!decoded) return res.status(401).json({ error: 'unauthorized' })
  req.user = { id: decoded.sub, email: decoded.email, name: decoded.name }
  next()
}

export async function requireTeam(req, res, next) {
  const teamId = req.headers['x-team-id']
  if (!teamId) return res.status(400).json({ error: 'x-team-id header required' })
  const membership = await Membership.findOne({ teamId, userId: req.user.id })
  if (!membership) return res.status(403).json({ error: 'forbidden' })
  req.team = { id: teamId, role: membership.role }
  next()
}

export function requireRole(roles = ['OWNER','ADMIN']) {
  return (req, res, next) => {
    if (!req.team || !roles.includes(req.team.role)) return res.status(403).json({ error: 'forbidden' })
    next()
  }
}