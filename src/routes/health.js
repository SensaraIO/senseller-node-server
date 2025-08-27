import { Router } from 'express'
const r = Router()

r.get('/', (_req, res) => res.send('ok'))

export default r