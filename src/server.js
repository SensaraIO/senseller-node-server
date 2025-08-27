import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { dbConnect } from './lib/db.js'

import agentRoutes from './routes/agent.js'
import campaignRoutes from './routes/campaign.js'
import clientsRoutes from './routes/clients.js'
import emailRoutes from './routes/email.js'
import messagesRoutes from './routes/messages.js'
import healthRoutes from './routes/health.js'
import webhooksRoutes from './routes/webhooks.js'
import authRoutes from './routes/auth.js'
import teamsRoutes from './routes/teams.js'
import metricsRoutes from './routes/metrics.js'

const app = express()

// Basic middlewares
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/teams', teamsRoutes)
app.use('/api/metrics', metricsRoutes)
app.use('/api/agent', agentRoutes)
app.use('/api/campaign', campaignRoutes)
app.use('/api/clients', clientsRoutes)
app.use('/api/email', emailRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/health', healthRoutes)
app.use('/api/webhooks', webhooksRoutes)

// Root
app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'sales-agent-node-server' })
})

const PORT = process.env.PORT || 3000

// Boot
;(async () => {
  await dbConnect()
  app.listen(PORT, () => console.log(`Server listening on :${PORT}`))
})()