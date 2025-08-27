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