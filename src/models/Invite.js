import mongoose, { Schema } from 'mongoose'

const InviteSchema = new Schema({
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', index: true, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  token: { type: String, required: true, unique: true },
  role: { type: String, enum: ['ADMIN','MEMBER'], default: 'MEMBER' },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date },
}, { timestamps: true })

export default mongoose.models.Invite || mongoose.model('Invite', InviteSchema)