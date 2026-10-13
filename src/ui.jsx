import React, { useEffect, useRef } from 'react'
import { FileText, X } from 'lucide-react'

export function Badge({ children, tone = 'neutral' }) { return <span className={`badge badge-${tone}`}>{children}</span> }
export function Empty({ title, text }) { return <div className="empty"><FileText aria-hidden="true"/><strong>{title}</strong><p>{text}</p></div> }
export function PageTitle({ eyebrow, title, text, actions }) { return <div className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{text && <p className="page-subtitle">{text}</p>}</div>{actions && <div className="title-actions">{actions}</div>}</div> }
export function Card({ className = '', children }) { return <section className={`card ${className}`}>{children}</section> }

/** Dialog with Escape-to-close and focus return. `wide` is for dialogs that hold a form plus a preview (the map editor). */
export function Modal({ open, onClose, title, eyebrow, children, wide = false }) {
  const closeButton = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const previousFocus = document.activeElement
    const onKeyDown = event => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    requestAnimationFrame(() => closeButton.current?.focus())
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus?.() }
  }, [open, onClose])
  if (!open) return null
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-head"><div><p className="eyebrow">{eyebrow}</p><h2 id="modal-title">{title}</h2></div><button ref={closeButton} className="icon-btn" onClick={onClose} aria-label="Close dialog"><X/></button></div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
}
