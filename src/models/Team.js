import mongoose, { Schema } from 'mongoose'

const TeamSchema = new Schema({
  name: { type: String, required: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

export default mongoose.models.Team || mongoose.model('Team', TeamSchema)