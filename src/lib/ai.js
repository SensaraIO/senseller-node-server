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