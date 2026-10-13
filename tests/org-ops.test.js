import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data'
import { addDepartment, departmentBlockers, removeDepartment, validateDepartment } from '../src/orgOps'

const u = (id) => seedData.users.find(x => x.id === id)
const dean = u('u-dean'), admin = u('u-admin'), meera = u('u-meera')
const form = { name: 'Neurology', floor: '3', room: '305', staff: '6', headId: 'u-meera' }

describe('departments', () => {
  it('admin and the hospital dean add a valid department', () => {
    const r = addDepartment(seedData, form, 'h1', dean, { id: 'dn' })
    expect(r.ok).toBe(true)
    expect(r.data.departments.at(-1)).toMatchObject({ id: 'dn', name: 'Neurology', staff: 6, headId: 'u-meera' })
    expect(addDepartment(seedData, form, 'h1', admin).ok).toBe(true)
    expect(seedData.departments.some(d => d.name === 'Neurology')).toBe(false)
  })
  it('rejects blank, duplicate, bad numbers and a head from elsewhere', () => {
    expect(validateDepartment(seedData, { ...form, name: '   ' }, 'h1').errors.name).toBeTruthy()
    expect(validateDepartment(seedData, { ...form, name: 'cardiology' }, 'h1').errors.name).toMatch(/already/)
    expect(validateDepartment(seedData, { ...form, floor: ' ' }, 'h1').errors.floor).toBeTruthy()
    expect(validateDepartment(seedData, { ...form, room: '' }, 'h1').errors.room).toBeTruthy()
    expect(validateDepartment(seedData, { ...form, staff: '0' }, 'h1').errors.staff).toBeTruthy()
    expect(validateDepartment(seedData, { ...form, staff: '2.5' }, 'h1').errors.staff).toBeTruthy()
    expect(validateDepartment(seedData, { ...form, headId: 'u-ananya' }, 'h1').errors.headId).toBeTruthy()
    expect(validateDepartment(seedData, { ...form, headId: 'u-meera' }, 'h2').errors.headId).toBeTruthy()
  })
  it('only admin or the dean of that hospital may change it', () => {
    expect(addDepartment(seedData, form, 'h1', meera).ok).toBe(false)
    expect(addDepartment(seedData, form, 'h2', dean).ok).toBe(false)
  })
  it('a department with people or queues cannot be removed; an empty one can', () => {
    expect(departmentBlockers(seedData, 'd-card').length).toBeGreaterThan(0)
    expect(removeDepartment(seedData, 'd-card', dean).message).toMatch(/cannot be removed/)
    const added = addDepartment(seedData, form, 'h1', dean, { id: 'dn' }).data
    expect(removeDepartment(added, 'dn', meera).ok).toBe(false)
    const r = removeDepartment(added, 'dn', dean)
    expect(r.ok).toBe(true)
    expect(r.data.departments.some(d => d.id === 'dn')).toBe(false)
  })
})
