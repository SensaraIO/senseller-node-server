import { Router } from 'express'
import Agent from '../models/Agent.js'
import { dbConnect } from '../lib/db.js'

const r = Router()

r.get('/', async (_req, res) => {
  await dbConnect()
  const agent = await Agent.findOne().lean()
  res.json(agent || null)
})

r.put('/', async (req, res) => {
  await dbConnect()
  const body = req.body || {}
  const agent = await Agent.findOneAndUpdate({}, body, { upsert: true, new: true })
  res.json(agent)
})

export default r