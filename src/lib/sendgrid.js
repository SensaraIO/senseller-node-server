import sgMail from '@sendgrid/mail'

const apiKey = process.env.SENDGRID_API_KEY
if (!apiKey) throw new Error('SENDGRID_API_KEY missing')
sgMail.setApiKey(apiKey)

export async function sendEmail({ to, from, subject, text, html, headers }) {
  const msg = {
    to,
    from,
    // Force replies to hit the Inbound Parse domain
    replyTo: process.env.REPLY_TO_EMAIL || from,
    subject,
    text,
    html,
    headers: headers || {}
  }
  const [res] = await sgMail.send(msg)
  const providerMessageId = res.headers['x-message-id'] || res.headers['x-sg-id'] || res.headers['x-message-id']
  return { response: res, providerMessageId }
}