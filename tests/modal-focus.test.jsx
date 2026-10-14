// @vitest-environment jsdom
import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from '../src/ui'

afterEach(cleanup)

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 60))

/** The shape of the "Add a hospital" dialog: a form in state, and a NEW onClose function on every render. */
function FormDialog({ onEscape = () => {} }) {
  const [open, setOpen] = useState(true)
  const [form, setForm] = useState({ name: '', code: '', city: '' })
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  return <Modal open={open} onClose={() => { onEscape(); setOpen(false) }} title="Add a hospital" eyebrow="TEST">
    <input aria-label="name" value={form.name} onChange={set('name')}/>
    <input aria-label="code" value={form.code} onChange={set('code')}/>
    <input aria-label="city" value={form.city} onChange={set('city')}/>
  </Modal>
}

describe('Modal focus', () => {
  it('puts focus on the first field once, when it opens', async () => {
    render(<FormDialog/>)
    await nextFrame()
    expect(document.activeElement).toBe(screen.getByLabelText('name'))
  })

  it('keeps focus in the field being typed in, however many times the parent re-renders', async () => {
    render(<FormDialog/>)
    await nextFrame()
    const city = screen.getByLabelText('city')
    city.focus()
    for (const text of ['C', 'Co', 'Coi', 'Coim', 'Coimb']) {
      fireEvent.change(city, { target: { value: text } }) // each change re-renders the parent with a new onClose
      await nextFrame()
      expect(document.activeElement, `after typing "${text}"`).toBe(city)
    }
    expect(city.value).toBe('Coimb')
    expect(screen.getByLabelText('name').value).toBe('')
  })

  it('still closes on Escape, using the latest onClose', async () => {
    const onEscape = vi.fn()
    render(<FormDialog onEscape={onEscape}/>)
    await nextFrame()
    fireEvent.change(screen.getByLabelText('code'), { target: { value: 'GVH' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('locks page scrolling while open and releases it on close', async () => {
    render(<FormDialog/>)
    await nextFrame()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})

/** A two-step wizard like Add hospital: step 1's button disappears when step 2 shows. */
function Wizard() {
  const [step, setStep] = useState(1)
  return <Modal open onClose={() => {}} title="Wizard" eyebrow="TEST">
    {step === 1
      ? <div key="details"><input aria-label="details"/><button onClick={() => setStep(2)}>Next</button></div>
      : <div key="map"><input aria-label="map"/><button>Create</button></div>}
  </Modal>
}

describe('Modal focus across wizard steps', () => {
  it('moves focus to the new step instead of losing it to the page', async () => {
    render(<Wizard/>)
    await nextFrame()
    const next = screen.getByText('Next')
    next.focus()
    fireEvent.click(next)
    await nextFrame()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(screen.getByLabelText('map'))
  })
})
