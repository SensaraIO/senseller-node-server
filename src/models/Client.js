import mongoose, { Schema } from 'mongoose'

const ClientSchema = new Schema({
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', index: true, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, index: true, lowercase: true, trim: true },
  status: { type: String, enum: ['NEW','CONTACTED','REPLIED','BOOKED','CANCELLED','RESCHEDULED','STOPPED','BOUNCED'], default: 'NEW', index: true },
  lastMessageAt: { type: Date },
  threadSubject: { type: String },
  lastOutboundMessageId: { type: String },
  meta: { type: Object, default: {} },
}, { timestamps: true })

ClientSchema.index({ teamId: 1, email: 1 }, { unique: true })

export default mongoose.models.Client || mongoose.model('Client', ClientSchema)