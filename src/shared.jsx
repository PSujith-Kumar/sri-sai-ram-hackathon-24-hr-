// Small helpers shared by App.jsx and the page components in src/pages. Presentation only; no data schema.

import React from 'react'

export const classNames = (...v) => v.filter(Boolean).join(' ')
export const fmtDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
export const fmtTime = (value) => new Date(`2026-01-01T${value}`).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
export const initials = (name) => name.split(' ').map(x => x[0]).slice(-2).join('').toUpperCase()

export const relativeTime = (value, now = Date.now()) => {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

/** "Good morning / afternoon / evening" from the person's own clock. */
export const greeting = (now = new Date()) => {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** How to address someone: "Dr. Iyer" for doctors, the first name for everyone else. */
export const addressName = (user) => {
  const parts = String(user?.name || '').trim().split(/\s+/)
  if (parts[0] === 'Dr.' && parts.length > 1) return `Dr. ${parts[parts.length - 1]}`
  return parts[0] || 'there'
}

export function Avatar({ user, size = 'md' }) {
  return <span className={classNames('avatar', size === 'sm' && 'avatar-sm', size === 'lg' && 'avatar-lg')} aria-label={user?.name || 'Profile'}>{user?.initials || initials(user?.name || 'Care Bridge')}</span>
}

export function Stat({ icon: Icon, label, value, detail, tone = 'teal' }) {
  return <section className="card stat-card"><span className={`stat-icon stat-${tone}`}><Icon aria-hidden="true"/></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></section>
}
