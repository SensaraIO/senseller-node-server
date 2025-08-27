import { Router } from 'express'
import Agent from '../models/Agent.js'
import Client from '../models/Client.js'
import Message from '../models/Message.js'
import { dbConnect } from '../lib/db.js'
import { requireAuth, requireTeam } from '../middleware/auth.js'
import { composeInitial } from '../lib/ai.js'
import { meetingPrefill } from '../lib/meeting.js'
import { sendEmail } from '../lib/sendgrid.js'
import { buildMessageId } from '../lib/utils.js'
import { renderEmailHtml, renderEmailText } from '../lib/email.js'

const r = Router()

r.post('/send', requireAuth, requireTeam, async (req, res) => {
  await dbConnect()
  const agent = await Agent.findOne({ teamId: req.team.id })
  if (!agent) return res.status(400).send('agent not configured')

  const targets = await Client.find({ teamId: req.team.id, status: 'NEW' }).limit(500)
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
        teamId: req.team.id,
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