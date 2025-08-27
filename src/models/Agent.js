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