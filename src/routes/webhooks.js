import { Router } from 'express'
import { dbConnect } from '../lib/db.js'
import Client from '../models/Client.js'

const r = Router()

r.post('/cal', async (req, res) => {
  await dbConnect()
  const body = req.body || {}

  console.log('=== CAL.COM WEBHOOK RECEIVED ===')
  console.log('Timestamp:', new Date().toISOString())
  console.log('Trigger Event:', body.triggerEvent)
  console.log('Headers:', req.headers)
  console.log('Body:', JSON.stringify(body, null, 2))
  console.log('=================================')

  const triggerEvent = body.triggerEvent || body.event
  let email
  if (Array.isArray(body?.payload?.attendees) && body.payload.attendees[0]?.email) {
    email = String(body.payload.attendees[0].email).toLowerCase()
  }
  if (!email && Array.isArray(body?.attendees) && body.attendees[0]?.email) {
    email = String(body.attendees[0].email).toLowerCase()
  }
  if (!email && body?.payload?.responses?.email?.value) {
    email = String(body.payload.responses.email.value).toLowerCase()
  }
  if (!email && body?.payload?.resource?.invitee?.email) {
    email = String(body.payload.resource.invitee.email).toLowerCase()
  }
  if (!email) return res.status(400).send('no email in webhook')

  let status = 'BOOKED'
  let metaField = 'bookedAt'
  if (triggerEvent === 'BOOKING_CANCELLED') { status = 'CANCELLED'; metaField = 'cancelledAt' }
  else if (triggerEvent === 'BOOKING_RESCHEDULED') { status = 'RESCHEDULED'; metaField = 'rescheduledAt' }

  const result = await Client.updateOne(
    { email },
    { $set: { status, [`meta.${metaField}`]: new Date(), 'meta.lastWebhookPayload': body, 'meta.lastWebhookEvent': triggerEvent } }
  )
  console.log('Update result:', result)
  res.send('ok')
})

export default r