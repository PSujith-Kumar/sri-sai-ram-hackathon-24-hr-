import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, Bell, Building2, CalendarDays, Check, ChevronDown, CircleUserRound,
  ClipboardList, Clock3, Database, FileHeart, FileText, HeartHandshake, Hospital, KeyRound, LayoutDashboard,
  LockKeyhole, LogOut, Map, Menu, Network, Pill, Plus, Printer, Route, Search, ShieldCheck, Stethoscope,
  Settings2, Sparkles, Trash2, UserCog, UserRoundCheck, UsersRound, X, Zap,
} from 'lucide-react'
import { DEMO_DATA_VERSION, DEMO_PASSWORD, demoAccounts, floorPlans, roleLabels, seedData } from './data'
import { Badge, Card, Empty, Modal, PageTitle } from './ui'
import { Avatar, Stat, addressName, classNames, fmtDate, fmtTime, greeting } from './shared'
import QueuePage from './pages/QueuePage'
import OrganizationPage from './pages/OrganizationPage'
import AppointmentsPage from './pages/AppointmentsPage'
import PatientDashboard from './pages/PatientDashboard'
import { CareCirclePage, CareTeamPage } from './pages/CarePages'
import { familyMay } from './careCircle'
import { appointmentsFor, isOpen } from './appointmentOps'
import HospitalsPage from './admin/HospitalsPage'
import { AddUserModal, DeleteUserDialog } from './admin/UserModals'
import { AddPatientModal } from './doctor/AddPatientModal'
import { canAddPatients } from './doctorOps'
import MedicineSchedule from './MedicineSchedule'
import { accessibleHospitals, canCreateUsers, canDeleteUsers, removeUser } from './adminOps'
import CompanionPage from './companion/CompanionPage'
import RouteAnalysisCard from './RouteAnalysisCard'
import CompanionSettingsPage from './companion/CompanionSettings'
import { addNotification, createHealthRecord, filterHealthRecords, healthRecordDeletionPolicy, hydrateCareData, localDate, queueRecipientIds, rolloverMedications } from './careFlow'

const DATA_KEY = `carebridge-react-v${DEMO_DATA_VERSION}`
const SESSION_KEY = 'carebridge-session-v3'
const cloneSeed = () => JSON.parse(JSON.stringify({ ...seedData, floorPlans }))
const formatRemainingWindow = (milliseconds) => {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}

function useStoredData() {
  const [data, setData] = useState(() => {
    const seed = cloneSeed()
    try { return hydrateCareData(JSON.parse(localStorage.getItem(DATA_KEY)), seed) } catch { return hydrateCareData(seed, seed) }
  })
  useEffect(() => localStorage.setItem(DATA_KEY, JSON.stringify(data)), [data])
  useEffect(() => {
    const syncAcrossTabs = event => {
      if (event.key !== DATA_KEY || !event.newValue) return
      try { setData(hydrateCareData(JSON.parse(event.newValue), cloneSeed())) } catch { /* Ignore incomplete writes. */ }
    }
    window.addEventListener('storage', syncAcrossTabs)
    return () => window.removeEventListener('storage', syncAcrossTabs)
  }, [])
  return [data, setData]
}


function Login({ data, onLogin }) {
  const [email, setEmail] = useState('ananya@carebridge.demo')
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [showAccounts, setShowAccounts] = useState(false)
  const [error, setError] = useState('')
  const submit = (e) => {
    e.preventDefault()
    const user = data.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase())
    if (!user || password !== DEMO_PASSWORD) return setError('Email or password is incorrect. Use one of the demo accounts below.')
    setError(''); onLogin(user.id)
  }
  return <main className="login-page">
    <section className="login-story">
      <div className="login-brand"><span className="brand-symbol">C</span><span><b>CareBridge</b><small>One platform. Connected care.</small></span></div>
      <div className="story-content"><Badge tone="mint"><ShieldCheck/> Role-safe healthcare demo</Badge><h1>Care follows the patient. Access follows consent.</h1><p>Hospitals, doctors, patients and families share one coordinated care journey—without sharing what they should not see.</p>
        <div className="connection-map" aria-label="Connected care roles">
          <span className="connection-node node-hospital"><Hospital/><b>Hospital</b></span><i></i>
          <span className="connection-node node-doctor"><Stethoscope/><b>Doctor</b></span><i></i>
          <span className="connection-node node-patient"><CircleUserRound/><b>Patient</b></span><i></i>
          <span className="connection-node node-family"><HeartHandshake/><b>Family</b></span>
        </div>
      </div>
      <div className="fiction-note"><LockKeyhole/><span><b>Fictional demonstration data</b><small>No connection to a live hospital or medical record system.</small></span></div>
    </section>
    <section className="login-panel"><div className="login-box"><p className="eyebrow">SECURE WORKSPACE</p><h2>Welcome back</h2><p>Sign in to your role-specific CareBridge workspace.</p>
      <form onSubmit={submit} className="form-stack" noValidate>
        <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" onBlur={()=>error&&setError('')} required/></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit">Sign in securely <ArrowRight/></button>
      </form>
      <button className="demo-toggle" onClick={()=>setShowAccounts(v=>!v)} aria-expanded={showAccounts}>Choose a demo role <ChevronDown className={showAccounts?'rotate':''}/></button>
      {showAccounts && <div className="demo-accounts">{demoAccounts.map(a=><button key={a.email} onClick={()=>{setEmail(a.email);setPassword(DEMO_PASSWORD);setShowAccounts(false)}}><span className={`role-dot role-${a.role}`}></span><span><b>{a.label}</b><small>{a.hint}</small></span><ArrowRight/></button>)}</div>}
      <p className="demo-password">All demo accounts use password <code>{DEMO_PASSWORD}</code></p>
    </div></section>
  </main>
}

const navByRole = {
  admin: [['dashboard','Overview',LayoutDashboard],['hospitals','Hospitals',Building2],['organization','Organization',Network],['people','People & access',UsersRound],['queue','Queue operations',Clock3],['careclue','ClinicCompass maps',Map]],
  dean: [['dashboard','Hospital overview',LayoutDashboard],['organization','Organization',Network],['people','Staff & patients',UsersRound],['queue','Queue operations',Clock3],['careclue','ClinicCompass maps',Map]],
  head: [['dashboard','Department overview',LayoutDashboard],['patients','My patients',CircleUserRound],['queue','Queue desk',Clock3],['appointments','Appointments',CalendarDays],['organization','Care team',Network],['records','Patient reports',FileHeart],['medications','Medicines',Pill],['careclue','ClinicCompass',Map]],
  doctor: [['dashboard','Clinical dashboard',LayoutDashboard],['patients','My patients',CircleUserRound],['queue','Queue desk',Clock3],['appointments','Appointments',CalendarDays],['records','Patient reports',FileHeart],['medications','Medicines',Pill],['careclue','ClinicCompass',Map]],
  patient: [['dashboard','My home',LayoutDashboard],['companion','AI Companion',Sparkles],['settings','AI & privacy settings',Settings2],['team','My care team',UsersRound],['queue','QueueCare',Clock3],['appointments','Appointments',CalendarDays],['careclue','ClinicCompass',Map],['records','HealthStory',FileHeart],['medications','MedMinder',Pill],['care','CareCircle',HeartHandshake]],
  family: [['dashboard','Family home',LayoutDashboard],['patient','Linked patient',CircleUserRound],['queue','QueueCare',Clock3],['appointments','Appointments',CalendarDays],['medications','MedMinder',Pill],['care','CareCircle',HeartHandshake],['records','Shared records',FileHeart]],
}

// pages a family member may open depend on what the patient shared with them
const FAMILY_PAGE_PERMISSION = { queue: 'queue', appointments: 'queue', medications: 'medications', care: 'care', records: 'records' }
const navFor = (user, patients) => navByRole[user.role].filter(([id]) => user.role !== 'family' || !FAMILY_PAGE_PERMISSION[id] || familyMay(user, patients[0], FAMILY_PAGE_PERMISSION[id]))

function visiblePatients(user, data) {
  if (['admin','dean'].includes(user.role)) return data.patients.filter(p=>user.role==='admin'||user.hospitalIds.includes(p.hospitalId))
  if (['doctor','head'].includes(user.role)) return data.patients.filter(p=>p.doctorIds.includes(user.id))
  if (user.role === 'patient') return data.patients.filter(p=>p.userId===user.id)
  if (user.role === 'family') return data.patients.filter(p=>p.familyLinks.some(l=>l.userId===user.id&&l.status==='approved'))
  return []
}

function useMobileNavigation() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 850px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 850px)')
    const update = () => setMobile(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return mobile
}

function Sidebar({ user, nav, page, setPage, onLogout, open, setOpen, mobile, closeRef }) {
  const hidden = mobile && !open
  return <aside id="main-navigation" className={classNames('sidebar',open&&'sidebar-open')} aria-hidden={hidden || undefined} inert={hidden}>
    <div className="side-brand"><span className="brand-symbol">C</span><span><b>CareBridge</b><small>Connected care</small></span><button ref={closeRef} className="side-close" onClick={()=>setOpen(false)} aria-label="Close navigation"><X/></button></div>
    <div className="role-card"><Avatar user={user}/><div><small>Signed in as</small><b>{roleLabels[user.role]}</b></div><ShieldCheck/></div>
    <nav aria-label="Main navigation">{nav.map(([id,label,Icon])=><button key={id} className={page===id?'active':''} onClick={()=>{setPage(id);setOpen(false)}}><Icon aria-hidden="true"/><span>{label}</span>{page===id&&<i/>}</button>)}</nav>
    <div className="side-foot"><button onClick={onLogout}><LogOut/><span>Sign out</span></button><p><span></span>Demo system online</p></div>
  </aside>
}

function AppShell({ data, setData, user, onLogout }) {
  const [page, setPage] = useState('dashboard')
  const [sideOpen, setSideOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const mobileNavigation = useMobileNavigation()
  const menuButton = useRef(null)
  const closeMenuButton = useRef(null)
  const myHospitals = accessibleHospitals(user, data)
  const [hospitalId, setHospitalId] = useState(myHospitals[0]?.id || data.hospitals[0]?.id)
  const [toast, setToast] = useState('')
  const hospital = data.hospitals.find(h=>h.id===hospitalId) || data.hospitals[0]
  const patients = useMemo(()=>visiblePatients(user,data),[user,data])
  const nav = useMemo(()=>navFor(user,patients),[user,patients])
  const notifications = useMemo(() => (data.notifications || []).filter(item => item.recipientIds.includes(user.id)), [data.notifications, user.id])
  const unreadCount = notifications.filter(item => !item.readBy?.includes(user.id)).length
  const notify = (message, options = {}) => {
    setToast(message)
    setTimeout(()=>setToast(''),2600)
    if (options.persist === false) return
    setData(current => addNotification(current, {
      message,
      recipientIds: options.recipientIds || [user.id],
      page: options.page || page,
      type: options.type || 'info',
    }))
  }
  useEffect(()=>setPage('dashboard'),[user.id])
  useEffect(()=>{ if(!nav.some(([id])=>id===page)) setPage('dashboard') },[nav,page])
  useEffect(() => {
    if (!sideOpen || !mobileNavigation) return undefined
    const previousOverflow = document.body.style.overflow
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSideOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const sidebar = closeMenuButton.current?.closest('aside')
      const focusable = [...(sidebar?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    requestAnimationFrame(() => closeMenuButton.current?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      menuButton.current?.focus()
    }
  }, [sideOpen, mobileNavigation])
  useEffect(() => { if (!mobileNavigation) setSideOpen(false) }, [mobileNavigation])
  useEffect(() => {
    const rollover = () => setData(d => { const meds = rolloverMedications(d.medications, localDate()); return meds === d.medications ? d : { ...d, medications: meds } })
    const timer = setInterval(rollover, 60000)
    return () => clearInterval(timer)
  }, [setData])
  const pageName = nav.find(x=>x[0]===page)?.[1] || 'CareBridge'
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <Sidebar user={user} nav={nav} page={page} setPage={setPage} onLogout={onLogout} open={sideOpen} setOpen={setSideOpen} mobile={mobileNavigation} closeRef={closeMenuButton}/>
    <div className="main-column"><header className="topbar"><div className="top-left"><button ref={menuButton} className="mobile-menu" onClick={()=>setSideOpen(true)} aria-label="Open navigation" aria-expanded={sideOpen} aria-controls="main-navigation"><Menu/></button><div><p>{roleLabels[user.role]}</p><b>{pageName}</b></div></div><div className="top-actions">
      {myHospitals.length>1&&<label className="hospital-switch"><Hospital/><select value={hospitalId} onChange={e=>setHospitalId(e.target.value)}>{myHospitals.map(h=><option key={h.id} value={h.id}>{h.code} · {h.name}</option>)}</select></label>}
      {myHospitals.length===1&&<span className="hospital-name"><Hospital/>{hospital?.name}</span>}
      <button className="icon-btn bell" onClick={()=>setNotificationsOpen(true)} aria-label={`Notifications, ${unreadCount} unread`} aria-haspopup="dialog" aria-expanded={notificationsOpen}><Bell/>{unreadCount>0&&<span className="notification-count" aria-hidden="true">{Math.min(unreadCount,9)}</span>}</button><div className="profile-chip"><Avatar user={user}/><span><b>{user.name}</b><small>{user.title}</small></span></div>
    </div></header>
    <main className="content" id="main-content">
      {page==='dashboard'&&<Dashboard {...{data,setData,user,hospital,patients,setPage,notify}}/>}
      {page==='hospitals'&&<HospitalsPage {...{data,setData,user,notify}}/>}
      {page==='organization'&&<OrganizationPage {...{data,setData,user,hospital,notify}}/>}
      {page==='people'&&<PeoplePage {...{data,setData,user,hospital,patients,notify}}/>}
      {page==='patients'&&<PatientsPage {...{data,setData,user,patients,setPage,notify}}/>}
      {page==='patient'&&<PatientsPage {...{data,setData,user,patients,setPage,notify}}/>}
      {page==='team'&&<CareTeamPage {...{data,setData,user,patients,notify}}/>}
      {page==='queue'&&<QueuePage {...{data,setData,user,patients,hospital,notify}}/>}
      {page==='appointments'&&<AppointmentsPage {...{data,setData,user,patients,notify}}/>}
      {page==='careclue'&&<ClinicCompassPage {...{data,hospitalId,setHospitalId,user}}/>}
      {page==='records'&&<RecordsPage {...{data,setData,user,patients,notify}}/>}
      {page==='medications'&&<MedicineSchedule {...{data,setData,user,patients,notify}}/>}
      {page==='companion'&&<CompanionPage {...{data,setData,user,patients,notify,setPage}}/>}
      {page==='settings'&&<CompanionSettingsPage {...{data,setData,user,patients,notify}}/>}
      {page==='care'&&<CareCirclePage {...{data,setData,user,patients,notify}}/>}
    </main></div>
    <NotificationsPanel open={notificationsOpen} onClose={()=>setNotificationsOpen(false)} {...{data,setData,user,setPage,notifications,nav}}/>
    {sideOpen&&mobileNavigation&&<div className="side-scrim" aria-hidden="true" onClick={()=>setSideOpen(false)}/>} {toast&&<div className="toast" role="status"><Check/>{toast}</div>}
  </div>
}

function NotificationsPanel({ open, onClose, setData, user, setPage, notifications, nav }) {
  const markRead = ids => setData(current => ({ ...current, notifications: (current.notifications || []).map(item => ids.includes(item.id) ? { ...item, readBy: [...new Set([...(item.readBy || []), user.id])] } : item) }))
  const unread = notifications.filter(item => !item.readBy?.includes(user.id))
  const openItem = item => {
    markRead([item.id])
    if (nav.some(([id]) => id === item.page)) setPage(item.page)
    onClose()
  }
  return <Modal open={open} onClose={onClose} eyebrow="CONNECTED UPDATES" title="Notifications">
    <div className="notification-toolbar"><p>{unread.length ? `${unread.length} unread update${unread.length===1?'':'s'}` : 'You are all caught up.'}</p>{unread.length>0&&<button className="text-btn" onClick={()=>markRead(unread.map(item=>item.id))}>Mark all read</button>}</div>
    <div className="notification-list" aria-live="polite">{notifications.length ? notifications.map(item=>{const Icon=item.type==='queue'?Clock3:item.type==='record'?FileHeart:Bell;const isUnread=!item.readBy?.includes(user.id);return <button key={item.id} className={classNames(isUnread&&'unread')} onClick={()=>openItem(item)}><span className="notification-icon"><Icon/></span><span><b>{item.message}</b><small>{new Date(item.createdAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</small></span>{isUnread&&<i aria-label="Unread"/>}<ArrowRight/></button>}):<Empty title="No notifications yet" text="Queue, report and care updates will appear here."/>}</div>
  </Modal>
}

function Dashboard({ data, setData, user, hospital, patients, setPage, notify }) {
  if (user.role==='admin') return <AdminDashboard {...{data,hospital,setPage}}/>
  if (['dean','head'].includes(user.role)) return <LeadershipDashboard {...{data,user,hospital,patients,setPage}}/>
  if (user.role==='doctor') return <DoctorDashboard {...{data,user,patients,setPage}}/>
  return <PatientDashboard {...{data,setData,user,patients,setPage,notify}}/>
}

function AdminDashboard({ data, hospital, setPage }) {
  const hospitalDepts=data.departments.filter(d=>d.hospitalId===hospital.id), hospitalUsers=data.users.filter(u=>u.hospitalIds.includes(hospital.id)), hp=data.patients.filter(p=>p.hospitalId===hospital.id)
  return <><PageTitle eyebrow="NETWORK CONTROL CENTER" title="A clear view across every hospital." text="Manage governance, people, departments and care operations from one connected system." actions={<button className="btn btn-secondary" onClick={()=>window.print()}><Printer/> Print summary</button>}/>
    <div className="demo-data-strip" role="status"><Database/><span><b>Demo dataset ready</b><small>{data.hospitals.length} hospitals · {data.users.length} people · {data.patients.length} patients · {data.records.length} reports · {data.medications.length} medicines</small></span><Badge tone="mint">Fictional test data</Badge></div>
    <div className="stat-grid"><Stat icon={Building2} label="Hospitals" value={data.hospitals.length} detail="Across the CareBridge network"/><Stat icon={Network} label="Departments" value={data.departments.length} detail={`${hospitalDepts.length} in selected hospital`} tone="blue"/><Stat icon={Stethoscope} label="Clinical staff" value={hospitalUsers.filter(u=>['doctor','head','dean'].includes(u.role)).length} detail="Active role assignments" tone="coral"/><Stat icon={CircleUserRound} label="Patients" value={data.patients.length} detail={`${hp.length} at ${hospital.code}`} tone="gold"/></div>
    <div className="dashboard-grid"><Card className="network-card"><div className="card-head"><div><p className="eyebrow">HOSPITAL NETWORK</p><h2>Facilities at a glance</h2></div><button className="text-btn" onClick={()=>setPage('hospitals')}>Manage all <ArrowRight/></button></div><div className="hospital-list">{data.hospitals.map(h=><article key={h.id}><span className="hospital-monogram" style={{background:h.color}}>{h.code}</span><div><b>{h.name}</b><small>{h.city} · {h.type}</small></div><div className="hospital-metrics"><span><b>{data.departments.filter(d=>d.hospitalId===h.id).length}</b> departments</span><span><b>{h.beds}</b> beds</span></div><Badge tone="green">Active</Badge></article>)}</div></Card>
      <Card className="hierarchy-preview"><div className="card-head"><div><p className="eyebrow">GOVERNANCE</p><h2>Hospital hierarchy</h2></div><button className="text-btn" onClick={()=>setPage('organization')}>Open chart <ArrowRight/></button></div><div className="mini-tree"><div className="tree-person dean"><Avatar user={data.users.find(u=>u.id===hospital.deanId)}/><span><small>Hospital dean</small><b>{data.users.find(u=>u.id===hospital.deanId)?.name}</b></span></div><i></i><div className="mini-heads">{hospitalDepts.slice(0,3).map(d=><span key={d.id}><b>{d.name}</b><small>{data.users.find(u=>u.id===d.headId)?.name}</small></span>)}</div></div></Card></div>
    <Card className="access-banner"><span><ShieldCheck/></span><div><p className="eyebrow">CONSENT-FIRST ACCESS</p><h2>Every relationship is explicit and auditable.</h2><p>Patients control family access. Doctors see assigned patients. Hospital leaders see only their own facility.</p></div><button className="btn btn-dark" onClick={()=>setPage('people')}>Review access links</button></Card></>
}

function LeadershipDashboard({ data, user, hospital, patients, setPage }) {
  const depts=data.departments.filter(d=>d.hospitalId===hospital.id), queues=data.queues.filter(q=>q.hospitalId===hospital.id)
  return <><PageTitle eyebrow={user.role==='dean'?'HOSPITAL LEADERSHIP':'DEPARTMENT LEADERSHIP'} title={`${greeting()}, ${addressName(user)}.`} text={`${hospital.name} is operating normally. Here is the current care snapshot.`}/><div className="stat-grid"><Stat icon={UsersRound} label="Active patients" value={patients.length} detail="Authorized view"/><Stat icon={Stethoscope} label="Clinical teams" value={depts.length} detail="Departments operating" tone="blue"/><Stat icon={Clock3} label="Live queues" value={queues.filter(q=>!q.paused).length} detail="All synchronized" tone="gold"/><Stat icon={Activity} label="Average wait" value={`${Math.round(queues.reduce((n,q)=>n+Math.max(0,q.lastIssued-q.serving)*q.avgMinutes,0)/Math.max(1,queues.length))} min`} detail="For the newest token" tone="coral"/></div><div className="dashboard-grid"><DepartmentTable {...{data,hospital}}/><QueueSnapshot {...{data,queues,setPage}}/></div></>
}

function DepartmentTable({data,hospital}){const deps=data.departments.filter(d=>d.hospitalId===hospital.id);return <Card><div className="card-head"><div><p className="eyebrow">DEPARTMENTS</p><h2>Service overview</h2></div></div><div className="data-list">{deps.map(d=><div key={d.id} className="data-row"><span className="round-icon"><Stethoscope/></span><div><b>{d.name}</b><small>Floor {d.floor} · Room {d.room}</small></div><span>{d.staff} staff</span><Badge tone="green">Open</Badge></div>)}</div></Card>}
function QueueSnapshot({data,queues,setPage}){return <Card><div className="card-head"><div><p className="eyebrow">QUEUECARE</p><h2>Live queues</h2></div><button className="text-btn" onClick={()=>setPage('queue')}>Open desk <ArrowRight/></button></div><div className="queue-snapshot">{queues.map(q=>{const dep=data.departments.find(d=>d.id===q.departmentId);return <div key={q.id}><span><b>{dep?.name}</b><small>Serving token {String(q.serving).padStart(3,'0')}</small></span><strong>{Math.max(0,q.lastIssued-q.serving)} waiting</strong></div>})}</div></Card>}

function DoctorDashboard({data,user,patients,setPage}){const appts=appointmentsFor(data,user,patients).filter(a=>isOpen(a)&&a.date>=localDate());return <><PageTitle eyebrow="CLINICAL WORKSPACE" title={`${greeting()}, ${addressName(user)}.`} text="Your assigned patients, appointments and live queue are connected in one view."/><div className="stat-grid"><Stat icon={CircleUserRound} label="Assigned patients" value={patients.length} detail="Relationship-scoped access"/><Stat icon={CalendarDays} label="Appointments" value={appts.length} detail="Today and upcoming" tone="blue"/><Stat icon={Clock3} label="Current token" value={`CAR-${String(data.queues.find(q=>q.doctorId===user.id)?.serving||0).padStart(3,'0')}`} detail="Queue synchronized" tone="gold"/><Stat icon={FileHeart} label="Recent records" value={data.records.filter(r=>patients.some(p=>p.id===r.patientId)).length} detail="Assigned patients only" tone="coral"/></div><AiAlertsCard {...{data,patients}}/><div className="dashboard-grid"><PatientRoster {...{data,patients,setPage}}/><Card><div className="card-head"><div><p className="eyebrow">UPCOMING</p><h2>Consultations</h2></div><button className="text-btn" onClick={()=>setPage('appointments')}>Manage <ArrowRight/></button></div><div className="appointment-list">{!appts.length&&<Empty title="Nothing scheduled" text="Book an appointment from the Appointments page."/>}{appts.slice(0,5).map(a=>{const p=patients.find(p=>p.id===a.patientId),u=data.users.find(u=>u.id===p?.userId);return <div key={a.id}><span className="date-block"><b>{fmtTime(a.time)}</b><small>{fmtDate(a.date).replace(/ \d{4}$/,'')}</small></span><Avatar user={u}/><span><b>{u?.name}</b><small>{p?.mrn}</small></span><Badge tone={a.status==='checked-in'?'green':'neutral'}>{a.status}</Badge></div>})}</div></Card></div></>}
function AiAlertsCard({data,patients}){const alerts=(data.hospitalAlerts||[]).filter(a=>patients.some(p=>p.id===a.patientId)).slice(0,5);if(!alerts.length)return null;return <Card className="ai-alerts"><div className="card-head"><div><p className="eyebrow">AI COMPANION · MEDICAL DEPARTMENT</p><h2>Patient alerts</h2></div><Badge tone="coral">{alerts.length} recent</Badge></div><div className="data-list">{alerts.map(a=>{const p=patients.find(p=>p.id===a.patientId),u=data.users.find(u=>u.id===p?.userId);return <div key={a.id} className="data-row"><span className="round-icon"><Bell/></span><div><b>{u?.name} · {p?.mrn}</b><small>{(a.reasons||[]).join(', ')||'Care-team review requested'} · via {a.via} · {new Date(a.at).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'})}</small></div><Badge tone={a.level>=3?'coral':'gold'}>{a.level>=3?'critical':'urgent'}</Badge></div>})}</div></Card>}
function PatientRoster({data,patients,setPage}){return <Card><div className="card-head"><div><p className="eyebrow">MY PATIENTS</p><h2>Care roster</h2></div><button className="text-btn" onClick={()=>setPage('patients')}>View all <ArrowRight/></button></div><div className="patient-roster">{patients.map(p=>{const u=data.users.find(u=>u.id===p.userId);return <div key={p.id}><Avatar user={u}/><span><b>{u?.name}</b><small>{p.mrn} · {(p.conditions||[]).join(', ')||'General care'}</small></span><Badge tone="blue">Assigned</Badge></div>})}</div></Card>}

function PeoplePage({data,setData,user,hospital,patients,notify}){const[search,setSearch]=useState(''),[open,setOpen]=useState(false);const people=data.users.filter(u=>(u.role==='admin'||u.hospitalIds.includes(hospital.id))&&`${u.name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase()));const[deleting,setDeleting]=useState(null);const onCreated=r=>{setData(r.data);setOpen(false);notify(`${r.user.name} added as ${r.user.title}`)};const onDelete=target=>{const r=removeUser(data,target.id,user.id);if(!r.ok){notify(r.message);setDeleting(null);return}setData(r.data);setDeleting(null);notify(`${target.name} was deleted`)};const toggleFamily=(patientId,userId)=>{setData({...data,patients:data.patients.map(p=>p.id!==patientId?p:{...p,familyLinks:p.familyLinks.map(l=>l.userId!==userId?l:{...l,status:l.status==='approved'?'revoked':'approved'})})});notify('Family access updated')};return <><PageTitle eyebrow="IDENTITY & CONSENT" title="People and access" text="Roles decide what users can do. Relationships decide whose information they can see." actions={canCreateUsers(user)&&<button className="btn btn-primary" onClick={()=>setOpen(true)}><Plus/> Add user</button>}/><div className="access-callout"><ShieldCheck/><div><b>Least-privilege access is active</b><p>A doctor sees assigned patients; a family member sees approved relatives; leaders see their own hospital.</p></div></div><Card><div className="table-toolbar"><label className="search-box"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search people or roles" aria-label="Search people"/></label><Badge>{people.length} people</Badge></div><div className={`people-table${canDeleteUsers(user)?' has-actions':''}`}><div className="table-head"><span>Person</span><span>Role</span><span>Department</span><span>Access</span>{canDeleteUsers(user)&&<span></span>}</div>{people.map(u=><div className="people-row" key={u.id}><span className="person-cell"><Avatar user={u}/><span><b>{u.name}</b><small>{u.email}</small></span></span><span><Badge tone={u.role==='patient'?'mint':u.role==='family'?'gold':u.role==='admin'?'coral':'blue'}>{roleLabels[u.role]}</Badge></span><span>{data.departments.find(d=>d.id===u.departmentId)?.name||'—'}</span><span className="access-cell"><LockKeyhole/>{u.role==='patient'?'Own record':u.role==='family'?'Approved links':u.role==='admin'?'Network-wide':'Assigned scope'}</span>{canDeleteUsers(user)&&<span className="row-actions"><button className="icon-btn" aria-label={`Delete ${u.name}`} disabled={u.id===user.id} title={u.id===user.id?'You cannot delete your own account':'Delete this user'} onClick={()=>setDeleting(u)}><Trash2/></button></span>}</div>)}</div></Card><PageTitle eyebrow="RELATIONSHIP ACCESS" title="Patient connections" text="Review exactly who is connected to each patient."/><div className="connection-cards">{data.patients.filter(p=>p.hospitalId===hospital.id).map(p=>{const pu=data.users.find(u=>u.id===p.userId);return <Card key={p.id}><div className="connection-owner"><Avatar user={pu} size="lg"/><span><small>Patient · {p.mrn}</small><h2>{pu?.name}</h2></span></div><div className="connection-list"><p>Assigned clinicians</p>{p.doctorIds.map(id=>{const d=data.users.find(u=>u.id===id);return <div key={id}><Avatar user={d} size="sm"/><span><b>{d?.name}</b><small>{d?.specialization}</small></span><Badge tone="blue">Assigned</Badge></div>})}<p>Family caregivers</p>{p.familyLinks.length?p.familyLinks.map(l=>{const f=data.users.find(u=>u.id===l.userId);return <div key={l.userId}><Avatar user={f} size="sm"/><span><b>{f?.name}</b><small>{l.relationship} · {l.permissions.join(', ')}</small></span><button className={classNames('status-toggle',l.status==='approved'?'approved':'revoked')} onClick={()=>toggleFamily(p.id,l.userId)}>{l.status}</button></div>}):<small>No family member linked</small>}</div></Card>})}</div><AddUserModal key={hospital.id} open={open} onClose={()=>setOpen(false)} data={data} actor={user} hospital={hospital} onCreated={onCreated}/><DeleteUserDialog target={deleting} data={data} actor={user} onClose={()=>setDeleting(null)} onConfirm={onDelete}/></>}

function PatientsPage({data,setData,user,patients,setPage,notify}){
  const [adding,setAdding]=useState(false), mayAdd=canAddPatients(user)
  return <><PageTitle eyebrow="AUTHORIZED RECORDS" title={user.role==='family'?'Linked patient':'My patients'} text={user.role==='family'?'Only patient-approved information appears here.':'Only patients assigned to your account are listed.'} actions={mayAdd&&<button className="btn btn-primary" onClick={()=>setAdding(true)}><Plus/> Add patient</button>}/>
  {mayAdd&&<><AddPatientModal open={adding} onClose={()=>setAdding(false)} data={data} actor={user} onAdded={(result,message)=>{setData(result.data);setAdding(false);notify(message,{persist:false})}}/></>}
  {patients.length?<div className="patient-card-grid">{patients.map(p=>{const u=data.users.find(x=>x.id===p.userId),doc=data.users.find(x=>(p.doctorIds||[]).includes(x.id));return <Card key={p.id} className="patient-card"><div className="patient-card-head"><Avatar user={u} size="lg"/><div><Badge tone="green">Access verified</Badge><h2>{u?.name}</h2><p>{p.mrn} · Blood group {p.bloodGroup}</p></div></div><div className="clinical-note"><Activity/><span><small>Current care focus</small><b>{(p.conditions||[]).join(', ')||'General care'}</b></span></div><div className="patient-meta"><span><Stethoscope/><small>Assigned doctor</small><b>{doc?.name}</b></span><span><FileHeart/><small>Records</small><b>{data.records.filter(r=>r.patientId===p.id).length}</b></span></div><button className="btn btn-secondary" onClick={()=>setPage(user.role==='family'?'records':'appointments')}>Open care details <ArrowRight/></button></Card>})}</div>:<Empty title="No authorized patients" text={mayAdd?'Use Add patient to register someone or take on a patient who has no doctor.':'Your account is not currently linked to a patient.'}/>}</>
}

function shortestPath(plan,start,end,accessible){const dist={},prev={},unseen=new Set(Object.keys(plan.nodes));Object.keys(plan.nodes).forEach(n=>dist[n]=Infinity);dist[start]=0;while(unseen.size){const u=[...unseen].sort((a,b)=>dist[a]-dist[b])[0];unseen.delete(u);if(u===end)break;for(const[a,b,w,ok]of plan.edges){if(accessible&&!ok)continue;const v=a===u?b:b===u?a:null;if(!v||!unseen.has(v))continue;const alt=dist[u]+w;if(alt<dist[v]){dist[v]=alt;prev[v]=u}}}const path=[];for(let n=end;n;n=prev[n]){path.unshift(n);if(n===start)break}return path[0]===start?path:[]}
function ClinicCompassPage({data,hospitalId,setHospitalId,user}){const plans=data.floorPlans||floorPlans;const[hid,setHid]=useState(hospitalId),[start,setStart]=useState('Entrance'),[end,setEnd]=useState('Cardiology'),[accessible,setAccessible]=useState(true),[path,setPath]=useState([]);const plan=plans[hid]||Object.values(plans)[0];useEffect(()=>{const names=Object.keys(plan.nodes);setStart(names[0]);setEnd(names[names.length-1]);setPath([]);setSearched(false)},[hid]);const[searched,setSearched]=useState(false);const route=()=>{setPath(shortestPath(plan,start,end,accessible));setSearched(true)};return <><PageTitle eyebrow="CLINICCOMPASS · TEST HOSPITAL MAP" title="Find the right care, without getting lost." text="This fictional, testable floor plan demonstrates accessible indoor navigation. Real deployment requires a verified hospital map."/><div className="map-layout"><Card className="route-panel"><p className="eyebrow">PLAN A ROUTE</p><h2>{plan.name}</h2><div className="form-stack"><label>Hospital<select value={hid} onChange={e=>setHid(e.target.value)}>{data.hospitals.filter(h=>plans[h.id]&&(user.role==='admin'||user.hospitalIds.includes(h.id))).map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>Starting point<select value={start} onChange={e=>setStart(e.target.value)}>{Object.keys(plan.nodes).map(n=><option key={n}>{n}</option>)}</select></label><label>Destination<select value={end} onChange={e=>setEnd(e.target.value)}>{Object.keys(plan.nodes).map(n=><option key={n}>{n}</option>)}</select></label><label className="switch-label"><input type="checkbox" checked={accessible} onChange={e=>setAccessible(e.target.checked)}/><span className="switch"></span><span><b>Wheelchair-friendly</b><small>Avoid stairs and inaccessible edges</small></span></label><button className="btn btn-primary" onClick={route}><Route/> Find route</button></div>{searched&&start===end&&<p className="form-help" role="status">You are already at {start}. Choose a different destination.</p>}{searched&&start!==end&&path.length===0&&<p className="form-error" role="alert">No {accessible?'wheelchair-friendly ':''}route found between {start} and {end}.{accessible?' Try turning off the wheelchair option.':''}</p>}{path.length>1&&<div className="directions"><Badge tone="green">{(path.length-1)*2} min · {path.length-1} steps</Badge><ol>{path.map((n,i)=><li key={n}><b>{i+1}</b><span>{i?'Continue to':'Start at'} <strong>{n}</strong></span></li>)}</ol></div>}<RouteAnalysisCard plan={plan} start={start} end={end} accessible={accessible} path={path}/></Card><Card className="floor-map"><div className="map-toolbar"><span><i className="route-key"></i>Suggested route</span><span><i className="lift-key"></i>Accessible path</span><span><i className="stairs-key"></i>Stairs</span></div><svg viewBox="0 0 700 390" role="img" aria-label={`${plan.name} fictional floor plan`}><rect x="20" y="20" width="660" height="350" rx="20" className="map-shell"/>{plan.edges.map(([a,b,,ok])=>{const n1=plan.nodes[a],n2=plan.nodes[b],active=path.some((n,i)=>(n===a&&path[i+1]===b)||(n===b&&path[i+1]===a));return <line key={`${a}-${b}`} x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} className={active?'map-route':ok?'map-edge':'map-stairs'}/>})}{Object.entries(plan.nodes).map(([name,n])=><g key={name}><circle cx={n.x} cy={n.y} r="11" className={path.includes(name)?'map-node active':'map-node'}/><text x={n.x} y={n.y-19} textAnchor="middle">{name}</text><text x={n.x} y={n.y+31} textAnchor="middle" className="floor-label">Floor {n.floor}</text></g>)}</svg><p className="map-disclaimer"><ShieldCheck/> Fictional plan for testing only. Confirm directions with hospital staff in real facilities.</p></Card></div></>}

function RecordsPage({data,setData,user,patients,notify}) {
  const [open,setOpen]=useState(false)
  const [selected,setSelected]=useState(null)
  const [deleteTarget,setDeleteTarget]=useState(null)
  const [search,setSearch]=useState('')
  const patientIds=patients.map(patient=>patient.id)
  const isFamily=user.role==='family', isPatient=user.role==='patient', isClinician=['doctor','head'].includes(user.role)
  const records=filterHealthRecords(data.records,{patientIds,familyOnly:isFamily,query:search})
  const patient=patients[0]
  const selectedPolicy=selected?healthRecordDeletionPolicy(selected,user.id):null
  const selectedCreator=selected?data.users.find(item=>item.id===selected.createdBy):null
  const add=event=>{
    event.preventDefault()
    if(!patient)return
    const form=new FormData(event.currentTarget)
    const record=createHealthRecord({
      patientId:patient.id,
      createdBy:user.id,
      values:{title:form.get('title'),hospital:form.get('hospital'),type:form.get('type'),date:form.get('date'),description:form.get('description'),summary:form.get('summary'),sharedWithFamily:form.get('share')==='on'},
    })
    setData(current=>({...current,records:[record,...current.records]}))
    setOpen(false)
    const familyRecipients=record.sharedWithFamily?patient.familyLinks.filter(link=>link.status==='approved'&&link.permissions.includes('records')).map(link=>link.userId):[]
    notify(record.sharedWithFamily?'Report saved and shared with approved family':'Private report saved',{recipientIds:[user.id,...familyRecipients],page:'records',type:'record'})
  }
  const confirmDelete=()=>{
    const policy=healthRecordDeletionPolicy(deleteTarget,user.id)
    if(!policy.allowed){setDeleteTarget(null);notify(policy.reason==='creator-only'?'Only the report creator can delete it.':'The 24-hour deletion window has closed.',{persist:false});return}
    setData(current=>({...current,records:current.records.filter(record=>record.id!==deleteTarget.id)}))
    setDeleteTarget(null)
    notify('Report deleted successfully',{persist:false})
  }
  return <><PageTitle eyebrow="HEALTHSTORY" title={isFamily?'Shared health reports':isClinician?'Patient reports':'Your health timeline'} text={isFamily?'Open reports the patient explicitly shared with you.':isClinician?'Reports of the patients assigned to you. Only the patient adds or removes their own reports.':'Add complete reports with a clear description and optional family sharing.'} actions={isPatient&&<button className="btn btn-primary" onClick={()=>setOpen(true)}><Plus/> Add report</button>}/>
    <Card><div className="table-toolbar"><label className="search-box"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title, hospital or description" aria-label="Search health reports"/></label><Badge>{records.length} reports</Badge></div><div className="record-list">{records.length?records.map(record=><article key={record.id}><span className="record-icon"><FileHeart/></span><div className="record-copy"><Badge tone="blue">{record.type}</Badge><h2>{record.title}</h2><p className="record-hospital">{(isClinician||isFamily)&&<b>{data.users.find(u=>u.id===patients.find(p=>p.id===record.patientId)?.userId)?.name} · </b>}{record.hospital}</p><p className="record-summary">{record.summary}</p></div><span className="record-date"><b>{fmtDate(record.date)}</b>{record.sharedWithFamily&&<small><HeartHandshake/> Shared with family</small>}</span><button className="btn btn-secondary record-open" onClick={()=>setSelected(record)} aria-label={`View report ${record.title}`}><FileText/> View report</button></article>):<Empty title="No matching reports" text={isFamily?'Only reports shared by the patient appear here.':isClinician?'Your patients have not added reports yet, or none match your search.':'Add a report or try another search.'}/>}</div></Card>
    <Modal open={open} onClose={()=>setOpen(false)} eyebrow="HEALTHSTORY" title="Add a health report"><form className="form-stack" onSubmit={add}><label>Report title<input name="title" required placeholder="Example: Cardiology follow-up"/></label><label>Hospital<input name="hospital" defaultValue="Sanjeevani Multispeciality Hospital" required/></label><div className="form-grid"><label>Report type<select name="type"><option>Lab report</option><option>Prescription</option><option>Scan</option><option>Discharge summary</option><option>Consultation note</option></select></label><label>Date<input name="date" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label></div><label>Report description<textarea name="description" rows="5" minLength="20" required placeholder="Describe the findings, instructions and follow-up in clear language."/><small className="field-help">Required · family members will see this only when sharing is enabled.</small></label><label>Short summary <small>(optional)</small><textarea name="summary" rows="2" maxLength="180" placeholder="Leave blank to generate a summary from the description."/></label><label className="checkbox-label"><input name="share" type="checkbox"/> Share this report and description with approved family</label><button className="btn btn-primary" type="submit">Save report</button></form></Modal>
    <Modal open={Boolean(selected)} onClose={()=>setSelected(null)} eyebrow="HEALTH REPORT" title={selected?.title || 'Report details'}>{selected&&<div className="report-view"><div className="report-meta"><Badge tone="blue">{selected.type}</Badge><span><CalendarDays/> {fmtDate(selected.date)}</span>{selected.sharedWithFamily&&<span><HeartHandshake/> Family access enabled</span>}</div><section><p className="eyebrow">SUMMARY</p><h3>{selected.summary}</h3></section><section><p className="eyebrow">FULL DESCRIPTION</p><p>{selected.description}</p></section><footer><span><Hospital/>{selected.hospital}</span><span><ShieldCheck/>{isFamily?'Shared by the patient':'Patient-controlled record'}</span></footer><div className={classNames('deletion-policy',selectedPolicy.allowed&&'active')}><ShieldCheck/><span><b>{selectedPolicy.allowed?`Delete available for ${formatRemainingWindow(selectedPolicy.remainingMs)}`:selectedPolicy.reason==='creator-only'?`Only ${selectedCreator?.name || 'the report creator'} can delete this report`:'The 24-hour deletion window has closed'}</b><small>Reports can only be deleted by their creator during the first 24 hours.</small></span></div><div className="report-actions"><button className="btn btn-secondary" onClick={()=>window.print()}><Printer/> Print report</button>{selectedPolicy.allowed&&<button className="btn btn-danger" onClick={()=>{setDeleteTarget(selected);setSelected(null)}}><Trash2/> Delete report</button>}</div></div>}</Modal>
    <Modal open={Boolean(deleteTarget)} onClose={()=>setDeleteTarget(null)} eyebrow="CONFIRM DELETION" title="Delete this report?">{deleteTarget&&<div className="delete-confirmation"><span><Trash2/></span><p><b>{deleteTarget.title}</b> will be permanently removed from the patient timeline. This action cannot be undone.</p><div><button className="btn btn-secondary" onClick={()=>setDeleteTarget(null)}>Keep report</button><button className="btn btn-danger" onClick={confirmDelete}><Trash2/> Delete permanently</button></div></div>}</Modal>
  </>
}


function App(){const[data,setData]=useStoredData();const[session,setSession]=useState(()=>localStorage.getItem(SESSION_KEY));const user=data.users.find(u=>u.id===session);const login=id=>{localStorage.setItem(SESSION_KEY,id);setSession(id)};const logout=()=>{localStorage.removeItem(SESSION_KEY);setSession(null)};return user?<AppShell {...{data,setData,user,onLogout:logout}}/>:<Login data={data} onLogin={login}/>} 

export default App
