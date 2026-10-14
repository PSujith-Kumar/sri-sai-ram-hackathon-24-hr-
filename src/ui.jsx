import React, { useEffect, useId, useRef } from 'react'
import { FileText, X } from 'lucide-react'

export function Badge({ children, tone = 'neutral' }) { return <span className={`badge badge-${tone}`}>{children}</span> }
export function Empty({ title, text }) { return <div className="empty"><FileText aria-hidden="true"/><strong>{title}</strong><p>{text}</p></div> }
export function PageTitle({ eyebrow, title, text, actions }) { return <div className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{text && <p className="page-subtitle">{text}</p>}</div>{actions && <div className="title-actions">{actions}</div>}</div> }
export function Card({ className = '', children }) { return <section className={`card ${className}`}>{children}</section> }

/** Dialog with Escape-to-close and focus return. `wide` is for dialogs that hold a form plus a preview (the map editor). */
export function Modal({ open, onClose, title, eyebrow, children, wide = false }) {
  const closeButton = useRef(null)
  const dialog = useRef(null)
  const titleId = useId()
  // Parents usually pass a new onClose function on every render. If the effect below depended on it, every keystroke in
  // a form inside the dialog would re-run it and move focus back to the first field. Keep the latest one in a ref.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  useEffect(() => {
    if (!open) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    const onKeyDown = event => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      const focusable = [...(dialog.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') || [])]
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    requestAnimationFrame(() => {
      const initial = dialog.current?.querySelector('input:not([type="hidden"]), select, textarea') || closeButton.current
      initial?.focus()
    })
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); previousFocus?.focus?.() }
  }, [open])
  // If the focused element disappears (a wizard moving to its next step), bring focus back inside the dialog instead of
  // letting it fall to the page behind. It never moves focus that is already inside, so typing is not interrupted.
  useEffect(() => {
    const box = dialog.current
    if (!open || !box || box.contains(document.activeElement)) return
    ;(box.querySelector('input:not([type="hidden"]), select, textarea') || closeButton.current)?.focus()
  })
  if (!open) return null
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div ref={dialog} className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="modal-head"><div><p className="eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div><button ref={closeButton} className="icon-btn" onClick={onClose} aria-label="Close dialog"><X/></button></div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
}
