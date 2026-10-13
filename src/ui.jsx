import React from 'react'
import { FileText } from 'lucide-react'

export function Badge({ children, tone = 'neutral' }) { return <span className={`badge badge-${tone}`}>{children}</span> }
export function Empty({ title, text }) { return <div className="empty"><FileText aria-hidden="true"/><strong>{title}</strong><p>{text}</p></div> }
export function PageTitle({ eyebrow, title, text, actions }) { return <div className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{text && <p className="page-subtitle">{text}</p>}</div>{actions && <div className="title-actions">{actions}</div>}</div> }
export function Card({ className = '', children }) { return <section className={`card ${className}`}>{children}</section> }
