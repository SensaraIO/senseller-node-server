import { Router } from 'express'
import { dbConnect } from '../lib/db.js'
import Message from '../models/Message.js'

const r = Router()

r.get('/:id', async (req, res) => {
  await dbConnect()
  const msgs = await Message.find({ clientId: req.params.id }).sort({ createdAt: 1 }).lean()
  res.json(msgs)
})

export default r