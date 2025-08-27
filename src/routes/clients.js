import { Router } from 'express'
import multer from 'multer'
import { parse } from 'csv-parse'
import { dbConnect } from '../lib/db.js'
import Client from '../models/Client.js'
import { requireAuth, requireTeam } from '../middleware/auth.js'

const r = Router()
const upload = multer({ storage: multer.memoryStorage() })

r.get('/', requireAuth, requireTeam, async (req, res) => {
  await dbConnect()
  const clients = await Client.find({ teamId: req.team.id }).sort({ updatedAt: -1 }).lean()
  res.json(clients)
})

r.post('/', requireAuth, requireTeam, async (req, res) => {
  await dbConnect()
  const created = await Client.create({
    ...req.body,
    teamId: req.team.id,
    email: String(req.body.email).trim().toLowerCase(),
  })
  res.json(created)
})

r.post('/import', requireAuth, requireTeam, upload.single('file'), async (req, res) => {
  await dbConnect()
  if (!req.file) return res.status(400).send('file missing')

  const text = req.file.buffer.toString('utf8')
  const records = []
  await new Promise((resolve, reject) => {
    const parser = parse(text, { columns: true, trim: true })
    parser.on('readable', () => { let record; while ((record = parser.read())) records.push(record) })
    parser.on('error', reject)
    parser.on('end', resolve)
  })

  let inserted = 0, skipped = 0
  for (const r of records) {
    const name = r.name || r.Name || r.fullname || r.FullName
    const email = String(r.email || r.Email || r.eMail || '').trim().toLowerCase()
        if (!name || !email) { skipped++; continue }
    try {
      await Client.updateOne({ teamId: req.team.id, email }, { $setOnInsert: { teamId: req.team.id, name, email } }, { upsert: true })
      inserted++
    } catch { skipped++ }
  }

  res.json({ inserted, skipped })
})

export default r