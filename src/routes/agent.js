import { Router } from 'express'
import Agent from '../models/Agent.js'
import { dbConnect } from '../lib/db.js'
import { requireAuth, requireTeam } from '../middleware/auth.js'

const r = Router()

r.get('/', requireAuth, requireTeam, async (req, res) => {
  await dbConnect()
  const agent = await Agent.findOne({ teamId: req.team.id }).lean()
  res.json(agent || null)
})

r.put('/', requireAuth, requireTeam, async (req, res) => {
  await dbConnect()
  const body = req.body || {}
  const agent = await Agent.findOneAndUpdate({ teamId: req.team.id }, { ...body, teamId: req.team.id }, { upsert: true, new: true })
  res.json(agent)
})

export default r