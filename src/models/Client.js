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