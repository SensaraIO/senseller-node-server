import { Router } from 'express'
import bcrypt from 'bcrypt'
import { dbConnect } from '../lib/db.js'
import User from '../models/User.js'
import Team from '../models/Team.js'
import Membership from '../models/Membership.js'
import { signJwt } from '../lib/auth.js'

const r = Router()

r.post('/register', async (req, res) => {
  await dbConnect()
  const { name, email, password, teamName } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })
  
  // Check for existing user
  const existing = await User.findOne({ email: email.toLowerCase().trim() })
  if (existing) return res.status(400).json({ error: 'Email already registered' })
  
  const passwordHash = await bcrypt.hash(password, 12)
  const user = await User.create({ name, email: email.toLowerCase().trim(), passwordHash })
  const team = await Team.create({ name: teamName || `${name || 'Owner'}'s Team`, ownerId: user._id })
  await Membership.create({ teamId: team._id, userId: user._id, role: 'OWNER' })
  const token = signJwt({ sub: user._id.toString(), email: user.email, name: user.name })
  res.json({ token, user: { id: user._id, name: user.name, email: user.email }, team: { id: team._id, name: team.name } })
})

r.post('/login', async (req, res) => {
  await dbConnect()
  const { email, password } = req.body || {}
  const user = await User.findOne({ email: String(email).toLowerCase().trim() })
  if (!user) return res.status(401).json({ error: 'invalid credentials' })
  const ok = await bcrypt.compare(password || '', user.passwordHash)
  if (!ok) return res.status(401).json({ error: 'invalid credentials' })
  const token = signJwt({ sub: user._id.toString(), email: user.email, name: user.name })
  res.json({ token, user: { id: user._id, name: user.name, email: user.email } })
})

r.get('/me', async (req, res) => {
  // optional: attach requireAuth here if you want to validate the token
  res.json({ ok: true })
})

export default r