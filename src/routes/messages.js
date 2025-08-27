import { Router } from 'express'
import { dbConnect } from '../lib/db.js'
import Message from '../models/Message.js'
import { requireAuth, requireTeam } from '../middleware/auth.js'

const r = Router()

r.get('/:id', requireAuth, requireTeam, async (req, res) => {
  await dbConnect()
  const msgs = await Message.find({ teamId: req.team.id, clientId: req.params.id }).sort({ createdAt: 1 }).lean()
  res.json(msgs)
})

export default r