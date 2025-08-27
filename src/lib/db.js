import mongoose from 'mongoose'

const uri = process.env.MONGODB_URI
let conn = null

export async function dbConnect() {
  if (conn) return conn
  if (!uri) throw new Error('MONGODB_URI not set')
  conn = await mongoose.connect(uri)
  return conn
}