import mongoose, { Schema } from 'mongoose'

const MembershipSchema = new Schema({
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', index: true, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  role: { type: String, enum: ['OWNER','ADMIN','MEMBER'], default: 'MEMBER' },
}, { timestamps: true })

MembershipSchema.index({ teamId: 1, userId: 1 }, { unique: true })

export default mongoose.models.Membership || mongoose.model('Membership', MembershipSchema)