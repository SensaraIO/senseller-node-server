import mongoose, { Schema } from 'mongoose'

const UserSchema = new Schema({
  name: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true })

export default mongoose.models.User || mongoose.model('User', UserSchema)