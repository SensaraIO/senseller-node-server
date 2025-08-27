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