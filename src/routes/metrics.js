import { Router } from 'express'
import { dbConnect } from '../lib/db.js'
import { requireAuth, requireTeam } from '../middleware/auth.js'
import Client from '../models/Client.js'
import Message from '../models/Message.js'
import Booking from '../models/Booking.js'

const r = Router()

function parseRange(q) {
  const from = q.from ? new Date(q.from) : new Date('2000-01-01')
  const to = q.to ? new Date(q.to) : new Date()
  return { from, to }
}

r.get('/overview', requireAuth, requireTeam, async (req, res) => {
  await dbConnect()
  const { from, to } = parseRange(req.query)
  const teamId = req.team.id

  const [clientsTotal, msgsOut, msgsIn, repliedClients, bookings] = await Promise.all([
    Client.countDocuments({ teamId, createdAt: { $gte: from, $lte: to } }),
    Message.countDocuments({ teamId, direction: 'outbound', createdAt: { $gte: from, $lte: to } }),
    Message.countDocuments({ teamId, direction: 'inbound', createdAt: { $gte: from, $lte: to } }),
    Client.countDocuments({ teamId, lastMessageAt: { $gte: from, $lte: to }, status: { $in: ['REPLIED','BOOKED','RESCHEDULED','CANCELLED'] } }),
    Booking.countDocuments({ teamId, occurredAt: { $gte: from, $lte: to }, status: 'BOOKED' }),
  ])

  const bookedClients = await Client.countDocuments({ teamId, status: 'BOOKED', updatedAt: { $gte: from, $lte: to } })
  const bookingRate = clientsTotal ? (bookings / clientsTotal) : 0

  res.json({
    range: { from, to },
    clientsTotal,
    messages: { out: msgsOut, in: msgsIn },
    repliedClients,
    bookings,
    bookedClients,
    bookingRate,
  })
})

r.get('/timeseries/messages', requireAuth, requireTeam, async (req, res) => {
  await dbConnect()
  const { from, to } = parseRange(req.query)
  const teamId = req.team.id
  const pipeline = [
    { $match: { teamId, createdAt: { $gte: from, $lte: to } } },
    { $project: { direction: 1, d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
    { $group: { _id: { d: '$d', direction: '$direction' }, count: { $sum: 1 } } },
    { $group: { _id: '$_id.d', buckets: { $push: { k: '$_id.direction', v: '$count' } } } },
    { $project: { _id: 0, date: '$_id', counts: { $arrayToObject: '$buckets' } } },
    { $sort: { date: 1 } },
  ]
  const rows = await Message.aggregate(pipeline)
  res.json(rows)
})

r.get('/client/:id/thread', requireAuth, requireTeam, async (req, res) => {
  await dbConnect()
  const teamId = req.team.id
  const clientId = req.params.id
  const messages = await Message.find({ teamId, clientId }).sort({ createdAt: 1 }).lean()
  const bookings = await Booking.find({ teamId, clientId }).sort({ occurredAt: 1 }).lean()
  res.json({ messages, bookings })
})

export default r