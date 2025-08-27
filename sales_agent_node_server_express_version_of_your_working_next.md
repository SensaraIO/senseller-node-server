# Sales Agent Node Server (Express)

A drop-in Node.js/Express server that mirrors your working Next.js API. It handles:

- SendGrid Inbound Parse webhooks (multipart) → logs + stores inbound emails, AI-composes replies, sends via SendGrid, threads correctly
- Outbound campaign send to `NEW` clients
- Manual email send endpoint
- Agent configuration CRUD
- Client CRUD + CSV import
- Message history per client
- Cal.com / Calendly booking webhooks to set status (BOOKED / CANCELLED / RESCHEDULED)
- MongoDB (Mongoose) models identical to your app


---

## Project Structure

```
.
├─ package.json
├─ .env.example
├─ README.md
└─ src/
   ├─ server.js
   ├─ lib/
   │  ├─ db.js
   │  ├─ openai.js
   │  ├─ ai.js
   │  ├─ email.js
   │  ├─ meeting.js
   │  ├─ sendgrid.js
   │  └─ utils.js
   ├─ models/
   │  ├─ Agent.js
   │  ├─ Client.js
   │  └─ Message.js
   └─ routes/
      ├─ agent.js
      ├─ campaign.js
      ├─ clients.js
      ├─ email.js
      ├─ messages.js
      ├─ health.js
      └─ webhooks.js
```

---

## package.json

```json
{
  "name": "sales-agent-node-server",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=18.17.0" },
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js"
  },
  "dependencies": {
    "@sendgrid/mail": "^8.1.0",
    "cors": "^2.8.5",
    "csv-parse": "^5.5.6",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.2",
    "mongoose": "^8.5.0",
    "openai": "^4.58.1"
  }
}
```

---

## .env.example

```bash
# Server
PORT=3000
APP_URL=http://localhost:3000

# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster/dbname?retryWrites=true&w=majority

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# SendGrid
SENDGRID_API_KEY=SG....
# used to mint Message-ID headers like <abc@yourdomain>
SENDGRID_MESSAGE_DOMAIN=mailer.example.com
```

---

## src/server.js

```js
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

const app = express()

// Basic middlewares
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Routes
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
```
```

---

## src/lib/db.js

```js
import mongoose from 'mongoose'

const uri = process.env.MONGODB_URI
let conn = null

export async function dbConnect() {
  if (conn) return conn
  if (!uri) throw new Error('MONGODB_URI not set')
  conn = await mongoose.connect(uri)
  return conn
}
```

---

## src/lib/openai.js

```js
import OpenAI from 'openai'
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing')
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
```

---

## src/lib/ai.js

```js
import { openai } from './openai.js'

export async function composeReply({ agent, client, history }) {
  let conversationContext = ''
  if (history.length > 0) {
    conversationContext = '\n\nCONVERSATION HISTORY:\n'
    history.forEach((msg) => {
      const sender = msg.role === 'assistant' ? agent.name : client.name
      conversationContext += `\n${sender}: ${msg.content}\n`
    })
    conversationContext += '\n---END OF CONVERSATION HISTORY---\n'
  }

  const system = `You are ${agent.name}, a helpful, concise, and persistent but polite sales assistant.
Company context: ${agent.companyContext}
Rules: ${agent.rules}
Goal: Book a meeting using the link: ${agent.meetingUrl}

CRITICAL FORMATTING RULES:
- Output ONLY the email body text - no subject line, no "Subject:", no greeting like "Hi [Name]"
- Do NOT include any meeting links or URLs in your response
- Do NOT include any signature, sign-off, or closing (no "Best,", "Thanks,", "Regards,", etc.)
- Do NOT include your name at the end
- Just write the core message content

Guidelines:
- Keep replies short and skimmable while addressing the lead's questions
- Reference the meeting but don't include the actual link
- Maintain a professional and friendly tone
- If the prospect booked already or clearly declines, thank them and do not push further
${conversationContext}
IMPORTANT: You MUST read the conversation history above and respond appropriately to the prospect's latest message. Address their specific questions and concerns directly.`

  const messagesForOpenAI = [
    { role: 'system', content: system },
    { role: 'user', content: `The prospect ${client.name} just sent you a message. Based on the conversation history in your system prompt, craft an appropriate reply that addresses their latest message.` }
  ]

  const completion = await openai.chat.completions.create({
    model: agent.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: messagesForOpenAI,
    temperature: 0.6,
  })

  return completion.choices?.[0]?.message?.content?.trim() || ''
}

export async function composeInitial({ agent, client }) {
  const system = `You are ${agent.name}, an energetic but respectful outbound SDR. Your single goal is to start a thread that gets a meeting booked.

CRITICAL FORMATTING RULES:
- Output ONLY the email body text - no subject line, no "Subject:", no greeting
- Do NOT include any meeting links or URLs in your response
- Do NOT include any signature, sign-off, or closing (no "Best,", "Thanks,", etc.)
- Do NOT include your name at the end
- Keep it 4-7 sentences max
- Write a personalized message that references booking a meeting but without the actual link`

  const prompt = `Prospect details:\nName: ${client.name}\nEmail: ${client.email}\nCompany context: ${agent.companyContext}\nRules: ${agent.rules}\n\nWrite a short, engaging first outreach email. Reference the value of a meeting but don't include the actual link. Be specific and personalized.`

  const bodyComp = await openai.chat.completions.create({
    model: agent.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [ { role: 'system', content: system }, { role: 'user', content: prompt } ],
    temperature: 0.7,
  })
  const bodyText = bodyComp.choices?.[0]?.message?.content?.trim() || ''

  const subjComp = await openai.chat.completions.create({
    model: agent.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Write a concise, friendly sales email subject (max 6 words). No emojis.' },
      { role: 'user', content: `Context: ${agent.companyContext}\nRules: ${agent.rules}` }
    ],
    temperature: 0.6,
  })
  const subject = subjComp.choices?.[0]?.message?.content?.trim() || 'Quick intro'

  return { subject, bodyText }
}
```

---

## src/lib/email.js

```js
// Utilities from your Next.js lib/email.ts, ported to JS

export function sanitizeAIOutput(text = '') {
  let cleaned = text
  cleaned = cleaned.replace(/^Subject:\s*.+$/gim, '')
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '')
  cleaned = cleaned.replace(/\b(cal\.com|calendly\.com)[^\s]*/gi, '')
  const signOffs = [
    /^(Best|Thanks|Regards|Sincerely|Cheers|Talk soon|Looking forward),?\s*$/gim,
    /^(—|–|-{2,})\s*$/gm,
    /^(Best regards|Kind regards|Warm regards|Thank you),?\s*$/gim,
  ]
  signOffs.forEach((p) => { cleaned = cleaned.replace(p, '') })
  cleaned = cleaned
    .split('\n')
    .filter((line) => !line.match(/^(Zac|Zach|Zachary|Mia|Sales Agent)\s*$/i))
    .join('\n')
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()
  return cleaned
}

export function renderEmailHtml(body, meetingUrl, signature, clientName, isReply = false) {
  const cleanBody = sanitizeAIOutput(body)
  const greeting = clientName ? `Hi ${clientName},<br/><br/>` : ''
  const htmlBody = cleanBody.replace(/\n/g, '<br/>')
  const uniqueId = Date.now()
  const hiddenUnique = `<!-- Message ${uniqueId} -->`
  const ctaText = isReply ? 'Schedule Your Meeting' : 'Book a Meeting'
  const linkText = isReply ? 'Click here to schedule' : 'Or copy this link'
  const ctaHtml = `
    ${hiddenUnique}
    <div style="margin: 30px 0;">
      <a href="${meetingUrl}" style="display:inline-block;background-color:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:500;">
        ${ctaText}
      </a>
    </div>
    <p style="font-size:14px;color:#666;">${linkText}: <a href="${meetingUrl}">${meetingUrl}</a></p>
  `
  let signatureHtml = ''
  if (signature) {
    if (typeof signature === 'string') {
      signatureHtml = `<br/><br/><!-- Sig ${uniqueId} -->${signature.replace(/\n/g, '<br/>')}`
    } else if (signature.html) {
      let htmlSig = signature.html
      if (signature.imageUrl) htmlSig = htmlSig.replace(/{imageUrl}/g, signature.imageUrl)
      signatureHtml = `<br/><br/><!-- Sig ${uniqueId} -->${htmlSig}`
    }
  }
  return `${greeting}${htmlBody}${ctaHtml}${signatureHtml}`
}

export function renderEmailText(body, meetingUrl, signature, clientName) {
  const cleanBody = sanitizeAIOutput(body)
  const greeting = clientName ? `Hi ${clientName},\n\n` : ''
  const ctaText = `\n\nBook a meeting here: ${meetingUrl}\n`
  const signatureText = signature ? `\n${signature}` : ''
  return `${greeting}${cleanBody}${ctaText}${signatureText}`
}
```

---

## src/lib/meeting.js

```js
export function meetingPrefill(url, name, email) {
  try {
    const u = new URL(url)
    u.searchParams.set('name', name)
    u.searchParams.set('email', email)
    return u.toString()
  } catch {
    return url
  }
}
```

---

## src/lib/sendgrid.js

```js
import sgMail from '@sendgrid/mail'

const apiKey = process.env.SENDGRID_API_KEY
if (!apiKey) throw new Error('SENDGRID_API_KEY missing')
sgMail.setApiKey(apiKey)

export async function sendEmail({ to, from, subject, text, html, headers }) {
  const msg = { to, from, replyTo: from, subject, text, html, headers: headers || {} }
  const [res] = await sgMail.send(msg)
  const providerMessageId = res.headers['x-message-id'] || res.headers['x-sg-id'] || res.headers['x-message-id']
  return { response: res, providerMessageId }
}
```

---

## src/lib/utils.js

```js
export function isOutOfOffice(text = '') {
  const t = String(text || '').toLowerCase()
  return /(out\s?of\s?office|auto-?reply|vacation|away\suntil)/i.test(t)
}

export function buildMessageId(domain = process.env.SENDGRID_MESSAGE_DOMAIN || 'localhost') {
  const id = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`
  return `<${id}@${domain}>`
}

export function extractPlain(text, html) {
  if (text && text.trim().length) return text
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function safeParseHeaders(str) {
  try {
    const out = {}
    for (const line of str.split(/\r?\n/)) {
      const idx = line.indexOf(':')
      if (idx > -1) out[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
    }
    return out
  } catch {
    return undefined
  }
}
```

---

## src/models/Agent.js

```js
import mongoose, { Schema } from 'mongoose'

const AgentSchema = new Schema({
  name: { type: String, default: 'Sales Agent' },
  fromEmail: { type: String, required: true },
  meetingProvider: { type: String, enum: ['calcom', 'calendly', 'other'], default: 'calcom' },
  meetingUrl: { type: String, required: true },
  companyContext: { type: String, default: '' },
  rules: { type: String, default: '' },
  signature: { type: String, default: '' },
  signatureImageUrl: { type: String, default: '' },
  signatureHtml: { type: String, default: '' },
  useHtmlSignature: { type: Boolean, default: false },
  model: { type: String, default: process.env.OPENAI_MODEL || 'gpt-4o-mini' },
}, { timestamps: true })

export default mongoose.models.Agent || mongoose.model('Agent', AgentSchema)
```

---

## src/models/Client.js

```js
import mongoose, { Schema } from 'mongoose'

const ClientSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, index: true, unique: true },
  status: { type: String, enum: ['NEW','CONTACTED','REPLIED','BOOKED','CANCELLED','RESCHEDULED','STOPPED','BOUNCED'], default: 'NEW', index: true },
  lastMessageAt: { type: Date },
  threadSubject: { type: String },
  lastOutboundMessageId: { type: String },
  meta: { type: Object, default: {} },
}, { timestamps: true })

export default mongoose.models.Client || mongoose.model('Client', ClientSchema)
```

---

## src/models/Message.js

```js
import mongoose, { Schema } from 'mongoose'

const MessageSchema = new Schema({
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', index: true, required: true },
  direction: { type: String, enum: ['outbound', 'inbound'], required: true },
  from: String,
  to: String,
  subject: String,
  text: String,
  html: String,
  messageId: String,
  inReplyTo: String,
  rawHeaders: Object,
  providerId: String,
}, { timestamps: true })

export default mongoose.models.Message || mongoose.model('Message', MessageSchema)
```

---

## src/routes/agent.js

```js
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
```

---

## src/routes/campaign.js

```js
import { Router } from 'express'
import Agent from '../models/Agent.js'
import Client from '../models/Client.js'
import Message from '../models/Message.js'
import { dbConnect } from '../lib/db.js'
import { composeInitial } from '../lib/ai.js'
import { meetingPrefill } from '../lib/meeting.js'
import { sendEmail } from '../lib/sendgrid.js'
import { buildMessageId } from '../lib/utils.js'
import { renderEmailHtml, renderEmailText } from '../lib/email.js'

const r = Router()

r.post('/send', async (_req, res) => {
  await dbConnect()
  const agent = await Agent.findOne()
  if (!agent) return res.status(400).send('agent not configured')

  const targets = await Client.find({ status: 'NEW' }).limit(500)
  let sent = 0
  for (const client of targets) {
    const { subject, bodyText } = await composeInitial({ agent, client })
    const prefilledUrl = meetingPrefill(agent.meetingUrl, client.name, client.email)

    const signature = agent.useHtmlSignature && agent.signatureHtml
      ? { html: agent.signatureHtml, imageUrl: agent.signatureImageUrl }
      : agent.signature

    const htmlEmail = renderEmailHtml(bodyText, prefilledUrl, signature, client.name, false)
    const textEmail = renderEmailText(bodyText, prefilledUrl, typeof signature === 'string' ? signature : agent.signature, client.name)

    const messageId = buildMessageId()

    try {
      const { providerMessageId } = await sendEmail({
        to: client.email,
        from: agent.fromEmail,
        subject,
        text: textEmail,
        html: htmlEmail,
        headers: { 'Message-ID': messageId },
      })

      await Message.create({
        clientId: client._id,
        direction: 'outbound',
        from: agent.fromEmail,
        to: client.email,
        subject,
        text: textEmail,
        html: htmlEmail,
        messageId,
        providerId: providerMessageId || null,
      })
      await Client.updateOne({ _id: client._id }, { $set: { status: 'CONTACTED', lastMessageAt: new Date(), lastOutboundMessageId: messageId, threadSubject: subject } })
      sent++
    } catch (e) {
      console.error('send failed', e)
    }
  }

  res.json({ sent, total: targets.length })
})

export default r
```

---

## src/routes/clients.js

```js
import { Router } from 'express'
import multer from 'multer'
import { parse } from 'csv-parse'
import { dbConnect } from '../lib/db.js'
import Client from '../models/Client.js'

const r = Router()
const upload = multer({ storage: multer.memoryStorage() })

r.get('/', async (_req, res) => {
  await dbConnect()
  const clients = await Client.find().sort({ updatedAt: -1 }).lean()
  res.json(clients)
})

r.post('/', async (req, res) => {
  await dbConnect()
  const created = await Client.create(req.body)
  res.json(created)
})

r.post('/import', upload.single('file'), async (req, res) => {
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
    const email = r.email || r.Email || r.eMail
    if (!name || !email) { skipped++; continue }
    try {
      await Client.updateOne({ email }, { $setOnInsert: { name, email } }, { upsert: true })
      inserted++
    } catch { skipped++ }
  }

  res.json({ inserted, skipped })
})

export default r
```

---

## src/routes/messages.js

```js
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
```

---

## src/routes/email.js

```js
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

const r = Router()
const upload = multer({ storage: multer.memoryStorage() })

// Manual send endpoint (parity with /api/email/send)
r.post('/send', async (req, res) => {
  await dbConnect()
  const { clientId, subject, text, html, inReplyTo } = req.body || {}
  const client = await Client.findById(clientId)
  const agent = await Agent.findOne()
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

  console.log('INBOUND EMAIL:', { from, to, subject, text: text?.substring(0, 500) })

  const fromEmail = (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase()
  const client = await Client.findOne({ email: fromEmail })
  if (!client) return res.send('ok')

  const plain = extractPlain(text, html)

  await Message.create({
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

  if (['BOOKED','CANCELLED','RESCHEDULED'].includes(client.status)) return res.send('ok')
  if (client.status !== 'STOPPED') await Client.updateOne({ _id: client._id }, { $set: { status: 'REPLIED', lastMessageAt: new Date() } })
  if (client.status === 'STOPPED') return res.send('ok')
  if (isOutOfOffice(plain)) return res.send('ok')

  const historyDocs = await Message.find({ clientId: client._id }).sort({ createdAt: 1 }).limit(30).lean()
  const history = historyDocs.map((m) => ({ role: m.direction === 'outbound' ? 'assistant' : 'user', content: m.text || '' }))

  const agent = await Agent.findOne()
  if (!agent) return res.send('ok')

  const reply = await composeReply({ agent, client, history })
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

  await Message.create({
    clientId: client._id,
    direction: 'outbound',
    from: agent.fromEmail,
    to: client.email,
    subject: client.threadSubject || subject || 'Re: quick intro',
    text: textEmail,
    html: htmlEmail,
    providerId: providerMessageId || null,
  })

  res.send('ok')
})

export default r
```

---

## src/routes/health.js

```js
import { Router } from 'express'
const r = Router()

r.get('/', (_req, res) => res.send('ok'))

export default r
```

---

## src/routes/webhooks.js

```js
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
```

---

## README.md (quick start)

```md
# Sales Agent Node Server (Express)

## Run locally

1. `cp .env.example .env` and fill values
2. `npm install`
3. `npm run dev`

## Endpoints

- `GET /api/health` → `ok`
- `GET /api/agent` / `PUT /api/agent`
- `GET /api/clients` / `POST /api/clients`
- `POST /api/clients/import` (form-data: `file` CSV with headers `name,email`)
- `GET /api/messages/:id` → message history for a client
- `POST /api/campaign/send` → send initial outreach to clients with status `NEW`
- `POST /api/email/send` → manual send (JSON: `{ clientId, subject, text, html?, inReplyTo? }`)
- `POST /api/email/inbound` → SendGrid Inbound Parse (multipart) webhook
- `POST /api/webhooks/cal` → Cal.com / Calendly webhook

## SendGrid Inbound Parse

Set your Inbound Parse to POST to: `https://YOUR_HOST/api/email/inbound` with *Spam Check disabled* and *POST URL* enabled.

## Notes

- Ready to sit behind any frontend (Next.js, React SPA, mobile, etc.).
```

