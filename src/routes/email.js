import { Router } from 'express'
import multer from 'multer'
import { dbConnect } from '../lib/db.js'
import Agent from '../models/Agent.js'
import Client from '../models/Client.js'
import Message from '../models/Message.js'
import { composeReply } from '../lib/ai.js'
import { sendEmail } from '../lib/sendgrid.js'
import { extractPlain, isOutOfOffice, safeParseHeaders } from '../lib/utils.js'
import { renderEmailHtml, renderEmailText, sanitizeAIOutput } from '../lib/email.js'
import { meetingPrefill } from '../lib/meeting.js'
import { buildMessageId } from '../lib/utils.js'
import { requireAuth, requireTeam } from '../middleware/auth.js'

const r = Router()
const upload = multer({ storage: multer.memoryStorage() })

// Manual send endpoint (parity with /api/email/send)
r.post('/send', requireAuth, requireTeam, async (req, res) => {
  await dbConnect()
  const { clientId, subject, text, html, inReplyTo } = req.body || {}
  const client = await Client.findOne({ _id: clientId, teamId: req.team.id })
  const agent = await Agent.findOne({ teamId: req.team.id })
  if (!client || !agent) return res.status(400).json({ error: 'missing client/agent' })

  const prefilledUrl = meetingPrefill(agent.meetingUrl, client.name, client.email)
  const cleanText = sanitizeAIOutput(text || '')
  const htmlEmail = renderEmailHtml(cleanText, prefilledUrl, agent.signature, client.name)
  const textEmail = renderEmailText(cleanText, prefilledUrl, agent.signature, client.name)
  const messageId = buildMessageId()

  const { providerMessageId } = await sendEmail({
    to: client.email,
    from: agent.fromEmail,
    subject,
    text: textEmail,
    html: htmlEmail,
    headers: { 'Message-ID': messageId, ...(inReplyTo ? { 'In-Reply-To': inReplyTo, 'References': inReplyTo } : {}) },
  })

  await Message.create({
    teamId: req.team.id,
    clientId: client._id,
    direction: 'outbound',
    from: agent.fromEmail,
    to: client.email,
    subject,
    text: textEmail,
    html: htmlEmail,
    messageId,
    inReplyTo: inReplyTo || null,
    providerId: providerMessageId || null,
  })

  await Client.updateOne({ _id: client._id }, { $set: { status: 'CONTACTED', lastMessageAt: new Date(), lastOutboundMessageId: messageId, threadSubject: subject } })

  res.json({ ok: true })
})

// SendGrid Inbound Parse webhook (multipart/form-data)
r.post('/inbound', upload.any(), async (req, res) => {
  await dbConnect()

  const get = (k) => {
    const v = req.body?.[k]
    return typeof v === 'string' ? v : (Array.isArray(v) ? v[0] : '')
  }

  const from = String(get('from') || '')
  const to = String(get('to') || '')
  const subject = String(get('subject') || '')
  const text = String(get('text') || get('email') || '')
  const html = String(get('html') || '')
  const headersRaw = String(get('headers') || '')
  const inReplyTo = String(get('in-reply-to') || get('In-Reply-To') || '')
  const messageId = String(get('Message-Id') || get('message-id') || '')

  console.log('INBOUND EMAIL:', { from, to, subject, inReplyTo, messageId, textPreview: text?.substring(0, 200) })

  // Determine which team this inbound belongs to by recipient domain or agent.fromEmail
  const toEmail = (to.match(/<([^>]+)>/)?.[1] || to).trim().toLowerCase()
  const agent = await Agent.findOne({ fromEmail: toEmail }) || await Agent.findOne({ fromEmail: new RegExp('@' + toEmail.split('@')[1] + '$', 'i') })
  if (!agent) { console.warn('[inbound] No agent matched for recipient', toEmail); return res.send('ok') }
  const teamId = agent.teamId

  const fromEmail = (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase()
  let client = await Client.findOne({ teamId, email: fromEmail })
  if (!client) {
    console.warn('[inbound] No client found for', fromEmail)
    // OPTIONAL: auto-create client so threads never die on lookup mismatches
    if (process.env.AUTO_CREATE_CLIENTS === '1') {
      const guessedName = (from.match(/^([^<]+)/)?.[1] || '').trim().replace(/["']/g,'') || fromEmail.split('@')[0]
      client = await Client.create({ teamId, name: guessedName || 'Unknown', email: fromEmail, status: 'REPLIED' })
      console.log('[inbound] Auto-created client', client._id.toString(), client.email)
    } else {
      return res.send('ok') // keep current behavior
    }
  }

  const plain = extractPlain(text, html)

  await Message.create({
    teamId,
    clientId: client._id,
    direction: 'inbound',
    from: fromEmail,
    to,
    subject,
    text: plain,
    html,
    messageId: messageId || undefined,
    inReplyTo: inReplyTo || undefined,
    rawHeaders: headersRaw ? safeParseHeaders(headersRaw) : undefined,
  })
  console.log('[inbound] Saved inbound message for client', client._id.toString())

  if (['BOOKED','CANCELLED','RESCHEDULED'].includes(client.status)) return res.send('ok')
  if (client.status !== 'STOPPED') await Client.updateOne({ _id: client._id }, { $set: { status: 'REPLIED', lastMessageAt: new Date() } })
  if (client.status === 'STOPPED') return res.send('ok')
  if (isOutOfOffice(plain)) return res.send('ok')

  const historyDocs = await Message.find({ clientId: client._id }).sort({ createdAt: 1 }).limit(30).lean()
  const history = historyDocs.map((m) => ({ role: m.direction === 'outbound' ? 'assistant' : 'user', content: m.text || '' }))

  // Agent already resolved above, just check if it exists
  if (!agent) { console.warn('[inbound] No agent configured'); return res.send('ok') }

  const reply = await composeReply({ agent, client, history })
  console.log('[inbound] AI reply length:', (reply || '').length)

  const prefilledUrl = meetingPrefill(agent.meetingUrl, client.name, client.email)
  const signature = agent.useHtmlSignature && agent.signatureHtml
    ? { html: agent.signatureHtml, imageUrl: agent.signatureImageUrl }
    : agent.signature
  const htmlEmail = renderEmailHtml(reply, prefilledUrl, signature, client.name, true)
  const textEmail = renderEmailText(reply, prefilledUrl, typeof signature === 'string' ? signature : agent.signature, client.name)

  const { providerMessageId } = await sendEmail({
    to: client.email,
    from: agent.fromEmail,
    subject: client.threadSubject || subject || 'Re: quick intro',
    text: textEmail,
    html: htmlEmail,
    headers: client.lastOutboundMessageId ? { 'In-Reply-To': client.lastOutboundMessageId, 'References': client.lastOutboundMessageId } : {},
  })
  console.log('[inbound] SendGrid message id:', providerMessageId || '(none)')

  await Message.create({
    teamId,
    clientId: client._id,
    direction: 'outbound',
    from: agent.fromEmail,
    to: client.email,
    subject: client.threadSubject || subject || 'Re: quick intro',
    text: textEmail,
    html: htmlEmail,
    providerId: providerMessageId || null,
  })
  console.log('[inbound] Saved outbound reply for client', client._id.toString())

  res.send('ok')
})

export default r