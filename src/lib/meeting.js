export function meetingPrefill(url, name, email) {
  try {
    const u = new URL(url)
    u.searchParams.set('name', name)
    u.searchParams.set('email', email)
    return u.toString()
  } catch {
    return url
  }
}