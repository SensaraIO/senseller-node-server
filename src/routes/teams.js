import { Router } from 'express'
import crypto from 'crypto'
import { dbConnect } from '../lib/db.js'
import Team from '../models/Team.js'
import Invite from '../models/Invite.js'
import Membership from '../models/Membership.js'
import { requireAuth, requireTeam, requireRole } from '../middleware/auth.js'

const r = Router()

// Create a new team
r.post('/', requireAuth, async (req, res) => {
  await dbConnect()
  const { name } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name required' })
  const team = await Team.create({ name, ownerId: req.user.id })
  await Membership.create({ teamId: team._id, userId: req.user.id, role: 'OWNER' })
  res.json({ id: team._id, name: team.name })
})

// List members
r.get('/:teamId/members', requireAuth, requireTeam, async (req, res) => {
  await dbConnect()
  const members = await Membership.find({ teamId: req.params.teamId }).lean()
  res.json(members)
})

// Invite a user
r.post('/:teamId/invite', requireAuth, requireTeam, requireRole(['OWNER','ADMIN']), async (req, res) => {
  await dbConnect()
  const { email, role } = req.body || {}
  const token = crypto.randomBytes(24).toString('hex')
  const days = Number(process.env.INVITE_TOKEN_TTL_DAYS || 14)
  const expiresAt = new Date(Date.now() + days*24*60*60*1000)
  const invite = await Invite.create({ teamId: req.params.teamId, email: String(email).toLowerCase().trim(), role: role || 'MEMBER', token, expiresAt })
  // TODO: send email with token
  res.json({ ok: true, token })
})

// Accept invite
r.post('/invite/accept', async (req, res) => {
  await dbConnect()
  const { token, userId } = req.body || {}
  const invite = await Invite.findOne({ token })
  if (!invite) return res.status(400).json({ error: 'invalid token' })
  if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'expired token' })
  await Membership.updateOne({ teamId: invite.teamId, userId }, { $set: { role: invite.role } }, { upsert: true })
  invite.acceptedAt = new Date()
  await invite.save()
  res.json({ ok: true, teamId: invite.teamId })
})

export default r