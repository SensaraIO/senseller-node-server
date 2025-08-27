import mongoose, { Schema } from 'mongoose'

const BookingSchema = new Schema({
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', index: true, required: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', index: true, required: true },
  status: { type: String, enum: ['BOOKED','CANCELLED','RESCHEDULED'], required: true },
  occurredAt: { type: Date, default: Date.now },
  source: { type: String, default: 'cal' },
  raw: { type: Object },
}, { timestamps: true })

export default mongoose.models.Booking || mongoose.model('Booking', BookingSchema)