import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, Bell, Building2, CalendarDays, Check, ChevronDown, CircleUserRound,
  ClipboardList, Clock3, Database, FileHeart, FileText, HeartHandshake, Hospital, KeyRound, LayoutDashboard,
  LockKeyhole, LogOut, Map, Menu, Network, Pill, Plus, Printer, Route, Search, ShieldCheck, Stethoscope,
  Settings2, Sparkles, Trash2, UserCog, UserRoundCheck, UsersRound, X, Zap,
} from 'lucide-react'
import { DEMO_PASSWORD, demoAccounts, floorPlans, roleLabels, seedData } from './data'
import { Badge, Card, Empty, PageTitle } from './ui'
import CompanionPage from './companion/CompanionPage'
import RouteAnalysisCard from './RouteAnalysisCard'
import CompanionSettingsPage from './companion/CompanionSettings'
import { addNotification, createHealthRecord, filterHealthRecords, healthRecordDeletionPolicy, hydrateCareData, queueRecipientIds } from './careFlow'

const DATA_KEY = 'carebridge-react-v3'
const SESSION_KEY = 'carebridge-session-v3'
const cloneSeed = () => JSON.parse(JSON.stringify(seedData))
const classNames = (...v) => v.filter(Boolean).join(' ')
const fmtDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtTime = (value) => new Date(`2026-01-01T${value}`).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
const initials = (name) => name.split(' ').map(x => x[0]).slice(-2).join('').toUpperCase()
const relativeTime = (value, now = Date.now()) => {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`
}
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

function Avatar({ user, size = 'md' }) {
  return <span className={classNames('avatar', size === 'sm' && 'avatar-sm', size === 'lg' && 'avatar-lg')} aria-label={user?.name || 'Profile'}>{user?.initials || initials(user?.name || 'Care Bridge')}</span>
}

function Stat({ icon: Icon, label, value, detail, tone = 'teal' }) { return <Card className="stat-card"><span className={`stat-icon stat-${tone}`}><Icon aria-hidden="true"/></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></Card> }

function Modal({ open, onClose, title, eyebrow, children }) {
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
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-head"><div><p className="eyebrow">{eyebrow}</p><h2 id="modal-title">{title}</h2></div><button ref={closeButton} className="icon-btn" onClick={onClose} aria-label="Close dialog"><X/></button></div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
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
      <div className="login-brand"><span className="brand-symbol">C<span>+</span></span><span><b>CareBridge</b><small>One platform. Connected care.</small></span></div>
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
  head: [['dashboard','Department overview',LayoutDashboard],['patients','My patients',CircleUserRound],['queue','Queue desk',Clock3],['organization','Care team',Network],['careclue','ClinicCompass',Map]],
  doctor: [['dashboard','Clinical dashboard',LayoutDashboard],['patients','My patients',CircleUserRound],['queue','Queue desk',Clock3],['appointments','Appointments',CalendarDays],['careclue','ClinicCompass',Map]],
  patient: [['dashboard','My home',LayoutDashboard],['companion','AI Companion',Sparkles],['settings','AI & privacy settings',Settings2],['team','My care team',UsersRound],['queue','QueueCare',Clock3],['careclue','ClinicCompass',Map],['records','HealthStory',FileHeart],['medications','MedMinder',Pill],['care','CareCircle',HeartHandshake]],
  family: [['dashboard','Family home',LayoutDashboard],['patient','Linked patient',CircleUserRound],['queue','QueueCare',Clock3],['medications','MedMinder',Pill],['care','CareCircle',HeartHandshake],['records','Shared records',FileHeart]],
}

function visiblePatients(user, data) {
  if (['admin','dean'].includes(user.role)) return data.patients.filter(p=>user.role==='admin'||user.hospitalIds.includes(p.hospitalId))
  if (['doctor','head'].includes(user.role)) return data.patients.filter(p=>p.doctorIds.includes(user.id))
  if (user.role === 'patient') return data.patients.filter(p=>p.userId===user.id)
  if (user.role === 'family') return data.patients.filter(p=>p.familyLinks.some(l=>l.userId===user.id&&l.status==='approved'))
  return []
}

function Sidebar({ user, page, setPage, onLogout, open, setOpen }) {
  return <aside className={classNames('sidebar',open&&'sidebar-open')}>
    <div className="side-brand"><span className="brand-symbol">C<span>+</span></span><span><b>CareBridge</b><small>Connected care</small></span><button className="side-close" onClick={()=>setOpen(false)} aria-label="Close navigation"><X/></button></div>
    <div className="role-card"><Avatar user={user}/><div><small>Signed in as</small><b>{roleLabels[user.role]}</b></div><ShieldCheck/></div>
    <nav aria-label="Main navigation">{navByRole[user.role].map(([id,label,Icon])=><button key={id} className={page===id?'active':''} onClick={()=>{setPage(id);setOpen(false)}}><Icon aria-hidden="true"/><span>{label}</span>{page===id&&<i/>}</button>)}</nav>
    <div className="side-foot"><button onClick={onLogout}><LogOut/><span>Sign out</span></button><p><span></span>Demo system online</p></div>
  </aside>
}

function AppShell({ data, setData, user, onLogout }) {
  const [page, setPage] = useState('dashboard')
  const [sideOpen, setSideOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [hospitalId, setHospitalId] = useState(user.hospitalIds[0] || data.hospitals[0]?.id)
  const [toast, setToast] = useState('')
  const hospital = data.hospitals.find(h=>h.id===hospitalId) || data.hospitals[0]
  const patients = useMemo(()=>visiblePatients(user,data),[user,data])
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
  const pageName = navByRole[user.role].find(x=>x[0]===page)?.[1] || 'CareBridge'
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <Sidebar user={user} page={page} setPage={setPage} onLogout={onLogout} open={sideOpen} setOpen={setSideOpen}/>
    <div className="main-column"><header className="topbar"><div className="top-left"><button className="mobile-menu" onClick={()=>setSideOpen(true)} aria-label="Open navigation"><Menu/></button><div><p>{roleLabels[user.role]}</p><b>{pageName}</b></div></div><div className="top-actions">
      {user.hospitalIds.length>1&&<label className="hospital-switch"><Hospital/><select value={hospitalId} onChange={e=>setHospitalId(e.target.value)}>{data.hospitals.filter(h=>user.hospitalIds.includes(h.id)).map(h=><option key={h.id} value={h.id}>{h.code} · {h.name}</option>)}</select></label>}
      {user.hospitalIds.length===1&&<span className="hospital-name"><Hospital/>{hospital?.name}</span>}
      <button className="icon-btn bell" onClick={()=>setNotificationsOpen(true)} aria-label={`Notifications, ${unreadCount} unread`} aria-haspopup="dialog"><Bell/>{unreadCount>0&&<span className="notification-count" aria-hidden="true">{Math.min(unreadCount,9)}</span>}</button><div className="profile-chip"><Avatar user={user}/><span><b>{user.name}</b><small>{user.title}</small></span></div>
    </div></header>
    <main className="content" id="main-content">
      {page==='dashboard'&&<Dashboard {...{data,setData,user,hospital,patients,setPage,notify}}/>}
      {page==='hospitals'&&<HospitalsPage {...{data,setData,user,notify}}/>}
      {page==='organization'&&<OrganizationPage {...{data,setData,user,hospital,notify}}/>}
      {page==='people'&&<PeoplePage {...{data,setData,user,hospital,patients,notify}}/>}
      {page==='patients'&&<PatientsPage {...{data,user,patients,setPage}}/>}
      {page==='patient'&&<PatientsPage {...{data,user,patients,setPage}}/>}
      {page==='team'&&<CareTeamPage {...{data,user,patients}}/>}
      {page==='queue'&&<QueuePage {...{data,setData,user,patients,hospital,notify}}/>}
      {page==='appointments'&&<AppointmentsPage {...{data,user,patients}}/>}
      {page==='careclue'&&<ClinicCompassPage {...{data,hospitalId,setHospitalId,user}}/>}
      {page==='records'&&<RecordsPage {...{data,setData,user,patients,notify}}/>}
      {page==='medications'&&<MedicationsPage {...{data,setData,user,patients,notify}}/>}
      {page==='companion'&&<CompanionPage {...{data,setData,user,patients,notify}}/>}
      {page==='settings'&&<CompanionSettingsPage {...{data,setData,user,patients,notify}}/>}
      {page==='care'&&<CareCirclePage {...{data,setData,user,patients,notify}}/>}
    </main></div>
    <NotificationsPanel open={notificationsOpen} onClose={()=>setNotificationsOpen(false)} {...{data,setData,user,setPage,notifications}}/>
    {sideOpen&&<div className="side-scrim" onClick={()=>setSideOpen(false)}/>} {toast&&<div className="toast" role="status"><Check/>{toast}</div>}
  </div>
}

function NotificationsPanel({ open, onClose, data, setData, user, setPage, notifications }) {
  const markRead = ids => setData({ ...data, notifications: (data.notifications || []).map(item => ids.includes(item.id) ? { ...item, readBy: [...new Set([...(item.readBy || []), user.id])] } : item) })
  const unread = notifications.filter(item => !item.readBy?.includes(user.id))
  const openItem = item => {
    markRead([item.id])
    if (navByRole[user.role].some(([id]) => id === item.page)) setPage(item.page)
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
    <div className="stat-grid"><Stat icon={Building2} label="Hospitals" value={data.hospitals.length} detail="Across the CareBridge network"/><Stat icon={Network} label="Departments" value={data.departments.length} detail={`${hospitalDepts.length} in selected hospital`} tone="blue"/><Stat icon={Stethoscope} label="Clinical staff" value={hospitalUsers.filter(u=>['doctor','head','dean'].includes(u.role)).length} detail="Active role assignments" tone="coral"/><Stat icon={CircleUserRound} label="Patients" value={data.patients.length} detail={`${hp.length} at ${hospital.code}`} tone="gold"/></div>
    <div className="dashboard-grid"><Card className="network-card"><div className="card-head"><div><p className="eyebrow">HOSPITAL NETWORK</p><h2>Facilities at a glance</h2></div><button className="text-btn" onClick={()=>setPage('hospitals')}>Manage all <ArrowRight/></button></div><div className="hospital-list">{data.hospitals.map(h=><article key={h.id}><span className="hospital-monogram" style={{background:h.color}}>{h.code}</span><div><b>{h.name}</b><small>{h.city} · {h.type}</small></div><div className="hospital-metrics"><span><b>{data.departments.filter(d=>d.hospitalId===h.id).length}</b> departments</span><span><b>{h.beds}</b> beds</span></div><Badge tone="green">Active</Badge></article>)}</div></Card>
      <Card className="hierarchy-preview"><div className="card-head"><div><p className="eyebrow">GOVERNANCE</p><h2>Hospital hierarchy</h2></div><button className="text-btn" onClick={()=>setPage('organization')}>Open chart <ArrowRight/></button></div><div className="mini-tree"><div className="tree-person dean"><Avatar user={data.users.find(u=>u.id===hospital.deanId)}/><span><small>Hospital dean</small><b>{data.users.find(u=>u.id===hospital.deanId)?.name}</b></span></div><i></i><div className="mini-heads">{hospitalDepts.slice(0,3).map(d=><span key={d.id}><b>{d.name}</b><small>{data.users.find(u=>u.id===d.headId)?.name}</small></span>)}</div></div></Card></div>
    <Card className="access-banner"><span><ShieldCheck/></span><div><p className="eyebrow">CONSENT-FIRST ACCESS</p><h2>Every relationship is explicit and auditable.</h2><p>Patients control family access. Doctors see assigned patients. Hospital leaders see only their own facility.</p></div><button className="btn btn-dark" onClick={()=>setPage('people')}>Review access links</button></Card></>
}

function LeadershipDashboard({ data, user, hospital, patients, setPage }) {
  const depts=data.departments.filter(d=>d.hospitalId===hospital.id), queues=data.queues.filter(q=>q.hospitalId===hospital.id)
  return <><PageTitle eyebrow={user.role==='dean'?'HOSPITAL LEADERSHIP':'DEPARTMENT LEADERSHIP'} title={`Good evening, ${user.name.split(' ')[1] || user.name}.`} text={`${hospital.name} is operating normally. Here is the current care snapshot.`}/><div className="stat-grid"><Stat icon={UsersRound} label="Active patients" value={patients.length} detail="Authorized view"/><Stat icon={Stethoscope} label="Clinical teams" value={depts.length} detail="Departments operating" tone="blue"/><Stat icon={Clock3} label="Live queues" value={queues.filter(q=>!q.paused).length} detail="All synchronized" tone="gold"/><Stat icon={Activity} label="Average wait" value={`${Math.round(queues.reduce((n,q)=>n+q.avgMinutes,0)/Math.max(1,queues.length)*3)} min`} detail="Current estimate" tone="coral"/></div><div className="dashboard-grid"><DepartmentTable {...{data,hospital}}/><QueueSnapshot {...{data,queues,setPage}}/></div></>
}

function DepartmentTable({data,hospital}){const deps=data.departments.filter(d=>d.hospitalId===hospital.id);return <Card><div className="card-head"><div><p className="eyebrow">DEPARTMENTS</p><h2>Service overview</h2></div></div><div className="data-list">{deps.map(d=><div key={d.id} className="data-row"><span className="round-icon"><Stethoscope/></span><div><b>{d.name}</b><small>Floor {d.floor} · Room {d.room}</small></div><span>{d.staff} staff</span><Badge tone="green">Open</Badge></div>)}</div></Card>}
function QueueSnapshot({data,queues,setPage}){return <Card><div className="card-head"><div><p className="eyebrow">QUEUECARE</p><h2>Live queues</h2></div><button className="text-btn" onClick={()=>setPage('queue')}>Open desk <ArrowRight/></button></div><div className="queue-snapshot">{queues.map(q=>{const dep=data.departments.find(d=>d.id===q.departmentId);return <div key={q.id}><span><b>{dep?.name}</b><small>Serving token {String(q.serving).padStart(3,'0')}</small></span><strong>{Math.max(0,q.lastIssued-q.serving)} waiting</strong></div>})}</div></Card>}

function DoctorDashboard({data,user,patients,setPage}){const appts=data.appointments.filter(a=>a.doctorId===user.id);return <><PageTitle eyebrow="CLINICAL WORKSPACE" title={`Good evening, Dr. ${user.name.split(' ').slice(-1)[0]}.`} text="Your assigned patients, appointments and live queue are connected in one view."/><div className="stat-grid"><Stat icon={CircleUserRound} label="Assigned patients" value={patients.length} detail="Relationship-scoped access"/><Stat icon={CalendarDays} label="Appointments" value={appts.length} detail="Today and upcoming" tone="blue"/><Stat icon={Clock3} label="Current token" value={`CAR-${String(data.queues.find(q=>q.doctorId===user.id)?.serving||0).padStart(3,'0')}`} detail="Queue synchronized" tone="gold"/><Stat icon={FileHeart} label="Recent records" value={data.records.filter(r=>patients.some(p=>p.id===r.patientId)).length} detail="Assigned patients only" tone="coral"/></div><AiAlertsCard {...{data,patients}}/><div className="dashboard-grid"><PatientRoster {...{data,patients,setPage}}/><Card><div className="card-head"><div><p className="eyebrow">TODAY</p><h2>Consultations</h2></div></div><div className="appointment-list">{appts.map(a=>{const p=patients.find(p=>p.id===a.patientId),u=data.users.find(u=>u.id===p?.userId);return <div key={a.id}><span className="date-block"><b>{a.time}</b><small>{a.status}</small></span><Avatar user={u}/><span><b>{u?.name}</b><small>{p?.mrn}</small></span><Badge tone={a.status==='checked-in'?'green':'neutral'}>{a.status}</Badge></div>})}</div></Card></div></>}
function AiAlertsCard({data,patients}){const alerts=(data.hospitalAlerts||[]).filter(a=>patients.some(p=>p.id===a.patientId)).slice(0,5);if(!alerts.length)return null;return <Card className="ai-alerts"><div className="card-head"><div><p className="eyebrow">AI COMPANION · MEDICAL DEPARTMENT</p><h2>Patient alerts</h2></div><Badge tone="coral">{alerts.length} recent</Badge></div><div className="data-list">{alerts.map(a=>{const p=patients.find(p=>p.id===a.patientId),u=data.users.find(u=>u.id===p?.userId);return <div key={a.id} className="data-row"><span className="round-icon"><Bell/></span><div><b>{u?.name} · {p?.mrn}</b><small>{a.reasons.join(', ')} · via {a.via} · {new Date(a.at).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'})}</small></div><Badge tone={a.level>=3?'coral':'gold'}>{a.level>=3?'critical':'urgent'}</Badge></div>})}</div></Card>}
function PatientRoster({data,patients,setPage}){return <Card><div className="card-head"><div><p className="eyebrow">MY PATIENTS</p><h2>Care roster</h2></div><button className="text-btn" onClick={()=>setPage('patients')}>View all <ArrowRight/></button></div><div className="patient-roster">{patients.map(p=>{const u=data.users.find(u=>u.id===p.userId);return <div key={p.id}><Avatar user={u}/><span><b>{u?.name}</b><small>{p.mrn} · {p.conditions.join(', ')}</small></span><Badge tone="blue">Assigned</Badge></div>})}</div></Card>}

function PatientDashboard({data,setData,user,patients,setPage,notify}){const p=patients[0];if(!p)return <Empty title="No linked patient" text="An administrator or patient must approve a family link before health information appears."/>;const pu=data.users.find(u=>u.id===p.userId),isFamily=user.role==='family';const token=data.tokens.find(t=>t.patientId===p.id&&t.status==='waiting'),queue=data.queues.find(q=>q.id===token?.queueId),doctor=data.users.find(u=>p.doctorIds.includes(u.id)),ahead=Math.max(0,(token?.number||0)-(queue?.serving||0)-1),wait=ahead*(queue?.avgMinutes||5);return <><PageTitle eyebrow={isFamily?'APPROVED FAMILY VIEW':'MY CARE JOURNEY'} title={isFamily?`${pu.name} is connected to your care circle.`:`Good evening, ${pu.name.split(' ')[0]}.`} text={isFamily?'You can only see the information Ananya approved for you.':'Everything for today’s visit is connected and ready.'} actions={<button className="btn btn-secondary" onClick={()=>window.print()}><Printer/> Visit summary</button>}/>
  <div className="patient-hero"><div><Badge tone="mint"><Zap/> Live visit</Badge><p>Cardiology · Dr. Meera Shah</p><h2>Your token <strong>CAR-{String(token?.number||25).padStart(3,'0')}</strong></h2><div className="patient-hero-stats"><span>Now serving <b>CAR-{String(queue?.serving||20).padStart(3,'0')}</b></span><span>People ahead <b>{ahead}</b></span><span>Estimated wait <b>{wait?`${Math.max(1,wait-2)}–${wait+8} min`:'You’re next'}</b></span></div><button className="btn btn-light" onClick={()=>setPage('queue')}>Open QueueCare <ArrowRight/></button></div><div className="hero-route"><Route/><span><small>Next destination</small><b>Cardiology · Floor 2</b><p>Entrance → Reception → Lift → Cardiology</p></span><button onClick={()=>setPage('careclue')}>Open map</button></div></div>
  <div className="care-grid"><Card><div className="card-head"><div><p className="eyebrow">CARE TEAM</p><h2>People connected to this patient</h2></div></div><div className="care-team-row"><Avatar user={doctor}/><span><b>{doctor?.name}</b><small>{doctor?.specialization}</small></span><Badge tone="blue">Assigned doctor</Badge></div>{p.familyLinks.filter(l=>l.status==='approved').map(l=>{const f=data.users.find(u=>u.id===l.userId);return <div className="care-team-row" key={l.userId}><Avatar user={f}/><span><b>{f?.name}</b><small>{l.relationship}</small></span><Badge tone="green">Approved family</Badge></div>})}</Card>
  <Card><div className="card-head"><div><p className="eyebrow">MEDMINDER</p><h2>Today’s medication</h2></div><button className="text-btn" onClick={()=>setPage('medications')}>View all <ArrowRight/></button></div>{data.medications.filter(m=>m.patientId===p.id).map(m=><div className="med-mini" key={m.id}><span className={m.status==='taken'?'done':''}><Pill/></span><div><b>{m.name}</b><small>{m.instruction} · {fmtTime(m.time)}</small></div><Badge tone={m.status==='taken'?'green':'gold'}>{m.status}</Badge></div>)}</Card></div>
  <Card className="quick-checkin"><span><HeartHandshake/></span><div><p className="eyebrow">CARECIRCLE</p><h2>{isFamily?'Recent care updates':'How are you doing right now?'}</h2><p>{isFamily?'Acknowledging a request lets Ananya know you have seen it.':'A one-tap update goes only to your approved family caregiver.'}</p></div>{!isFamily&&<div className="checkin-buttons"><button onClick={()=>sendCareRequest('I’m okay','normal',p.id,data,setData,notify)}><Check/> I’m okay</button><button className="urgent" onClick={()=>sendCareRequest('I need help','high',p.id,data,setData,notify)}><Bell/> I need help</button></div>}{isFamily&&<button className="btn btn-primary" onClick={()=>setPage('care')}>Open CareCircle</button>}</Card></>}
function sendCareRequest(text,priority,patientId,data,setData,notify){setData({...data,careRequests:[{id:`c${Date.now()}`,patientId,text,priority,status:'waiting',createdAt:new Date().toISOString()},...data.careRequests]});notify('CareCircle update sent')}

function HospitalsPage({data,setData,notify}){const[open,setOpen]=useState(false);const add=e=>{e.preventDefault();const f=new FormData(e.currentTarget),id=`h${Date.now()}`;setData({...data,hospitals:[...data.hospitals,{id,name:f.get('name'),code:f.get('code').toUpperCase(),city:f.get('city'),type:f.get('type'),beds:Number(f.get('beds')),status:'active',deanId:'u-admin',color:'#138F84'}]});setOpen(false);notify('Hospital added to the network')};return <><PageTitle eyebrow="NETWORK ADMINISTRATION" title="Hospitals" text="Create and maintain every facility in the CareBridge network." actions={<button className="btn btn-primary" onClick={()=>setOpen(true)}><Plus/> Add hospital</button>}/><div className="hospital-grid">{data.hospitals.map(h=><Card key={h.id} className="hospital-card"><div className="hospital-card-top"><span className="hospital-monogram large" style={{background:h.color}}>{h.code}</span><Badge tone="green">Active</Badge></div><h2>{h.name}</h2><p>{h.city} · {h.type}</p><div className="hospital-stat-row"><span><b>{h.beds}</b><small>Beds</small></span><span><b>{data.departments.filter(d=>d.hospitalId===h.id).length}</b><small>Departments</small></span><span><b>{data.users.filter(u=>u.hospitalIds.includes(h.id)).length}</b><small>People</small></span></div><div className="hospital-card-foot"><span><Map/> ClinicCompass map configured</span><button className="text-btn">Manage <ArrowRight/></button></div></Card>)}</div><Modal open={open} onClose={()=>setOpen(false)} eyebrow="NEW FACILITY" title="Add a hospital"><form className="form-stack" onSubmit={add}><label>Hospital name<input name="name" required placeholder="Fictional hospital name"/></label><div className="form-grid"><label>Short code<input name="code" required maxLength="5" placeholder="ABC"/></label><label>City<input name="city" required placeholder="City"/></label></div><div className="form-grid"><label>Facility type<select name="type"><option>Tertiary care</option><option>Community care</option><option>Speciality hospital</option></select></label><label>Beds<input name="beds" type="number" min="1" required defaultValue="100"/></label></div><button className="btn btn-primary" type="submit">Create hospital</button></form></Modal></>}

function OrganizationPage({data,setData,user,hospital,notify}){const[open,setOpen]=useState(false);const deps=data.departments.filter(d=>d.hospitalId===hospital.id),dean=data.users.find(u=>u.id===hospital.deanId);const add=e=>{e.preventDefault();const f=new FormData(e.currentTarget);setData({...data,departments:[...data.departments,{id:`d${Date.now()}`,hospitalId:hospital.id,name:f.get('name'),floor:f.get('floor'),room:f.get('room'),headId:f.get('headId'),staff:Number(f.get('staff')),icon:'stethoscope'}]});setOpen(false);notify('Department added to the hierarchy')};return <><PageTitle eyebrow="GOVERNANCE & REPORTING" title={`${hospital.code} organization`} text="A transparent hierarchy from dean to department heads and specialist teams." actions={['admin','dean'].includes(user.role)&&<button className="btn btn-primary" onClick={()=>setOpen(true)}><Plus/> Add department</button>}/><Card className="org-chart"><div className="org-level dean-level"><div className="person-node primary"><Avatar user={dean} size="lg"/><span><small>Hospital dean</small><b>{dean?.name}</b><p>{dean?.title}</p></span></div></div><div className="org-line"></div><div className="org-level department-level">{deps.map(d=>{const head=data.users.find(u=>u.id===d.headId);const doctors=data.users.filter(u=>u.departmentId===d.id&&u.role==='doctor');return <div className="dept-node" key={d.id}><div className="dept-head"><span className="round-icon"><Stethoscope/></span><span><small>{d.name}</small><b>{head?.name||'Head unassigned'}</b><p>Department head · Floor {d.floor}</p></span></div><div className="specialist-list">{doctors.length?doctors.map(doc=><div key={doc.id}><Avatar user={doc} size="sm"/><span><b>{doc.name}</b><small>{doc.specialization}</small></span></div>):<small>No additional specialist assigned</small>}</div><footer>{d.staff} staff · Room {d.room}</footer></div>})}</div></Card><Modal open={open} onClose={()=>setOpen(false)} eyebrow="ORGANIZATION" title="Add a department"><form className="form-stack" onSubmit={add}><label>Department name<input name="name" required/></label><div className="form-grid"><label>Floor<input name="floor" required/></label><label>Room<input name="room" required/></label></div><label>Department head<select name="headId">{data.users.filter(u=>u.hospitalIds.includes(hospital.id)&&['doctor','head','dean'].includes(u.role)).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Team size<input name="staff" type="number" min="1" defaultValue="5" required/></label><button className="btn btn-primary" type="submit">Add department</button></form></Modal></>}

function PeoplePage({data,setData,user,hospital,patients,notify}){const[search,setSearch]=useState(''),[open,setOpen]=useState(false);const people=data.users.filter(u=>u.hospitalIds.includes(hospital.id)&&`${u.name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase()));const add=e=>{e.preventDefault();const f=new FormData(e.currentTarget),role=f.get('role'),id=`u${Date.now()}`;setData({...data,users:[...data.users,{id,name:f.get('name'),email:f.get('email'),role,title:roleLabels[role],hospitalIds:[hospital.id],initials:initials(f.get('name'))}]});setOpen(false);notify('User added with role-based access')};const toggleFamily=(patientId,userId)=>{setData({...data,patients:data.patients.map(p=>p.id!==patientId?p:{...p,familyLinks:p.familyLinks.map(l=>l.userId!==userId?l:{...l,status:l.status==='approved'?'revoked':'approved'})})});notify('Family access updated')};return <><PageTitle eyebrow="IDENTITY & CONSENT" title="People and access" text="Roles decide what users can do. Relationships decide whose information they can see." actions={<button className="btn btn-primary" onClick={()=>setOpen(true)}><Plus/> Add user</button>}/><div className="access-callout"><ShieldCheck/><div><b>Least-privilege access is active</b><p>A doctor sees assigned patients; a family member sees approved relatives; leaders see their own hospital.</p></div></div><Card><div className="table-toolbar"><label className="search-box"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search people or roles" aria-label="Search people"/></label><Badge>{people.length} people</Badge></div><div className="people-table"><div className="table-head"><span>Person</span><span>Role</span><span>Department</span><span>Access</span></div>{people.map(u=><div className="people-row" key={u.id}><span className="person-cell"><Avatar user={u}/><span><b>{u.name}</b><small>{u.email}</small></span></span><span><Badge tone={u.role==='patient'?'mint':u.role==='family'?'gold':u.role==='admin'?'coral':'blue'}>{roleLabels[u.role]}</Badge></span><span>{data.departments.find(d=>d.id===u.departmentId)?.name||'—'}</span><span><LockKeyhole/>{u.role==='patient'?'Own record':u.role==='family'?'Approved links':u.role==='admin'?'Network-wide':'Assigned scope'}</span></div>)}</div></Card><PageTitle eyebrow="RELATIONSHIP ACCESS" title="Patient connections" text="Review exactly who is connected to each patient."/><div className="connection-cards">{data.patients.filter(p=>p.hospitalId===hospital.id).map(p=>{const pu=data.users.find(u=>u.id===p.userId);return <Card key={p.id}><div className="connection-owner"><Avatar user={pu} size="lg"/><span><small>Patient · {p.mrn}</small><h2>{pu?.name}</h2></span></div><div className="connection-list"><p>Assigned clinicians</p>{p.doctorIds.map(id=>{const d=data.users.find(u=>u.id===id);return <div key={id}><Avatar user={d} size="sm"/><span><b>{d?.name}</b><small>{d?.specialization}</small></span><Badge tone="blue">Assigned</Badge></div>})}<p>Family caregivers</p>{p.familyLinks.length?p.familyLinks.map(l=>{const f=data.users.find(u=>u.id===l.userId);return <div key={l.userId}><Avatar user={f} size="sm"/><span><b>{f?.name}</b><small>{l.relationship} · {l.permissions.join(', ')}</small></span><button className={classNames('status-toggle',l.status==='approved'?'approved':'revoked')} onClick={()=>toggleFamily(p.id,l.userId)}>{l.status}</button></div>}):<small>No family member linked</small>}</div></Card>})}</div><Modal open={open} onClose={()=>setOpen(false)} eyebrow="IDENTITY" title="Add a user"><form className="form-stack" onSubmit={add}><label>Full name<input name="name" required/></label><label>Email address<input name="email" type="email" autoComplete="off" required/></label><label>Role<select name="role"><option value="patient">Patient</option><option value="family">Family caregiver</option><option value="doctor">Specialist doctor</option><option value="head">Department head</option><option value="dean">Hospital dean</option><option value="admin">Network administrator</option></select></label><p className="form-help">New users receive role permissions. Patient relationships must be approved separately.</p><button className="btn btn-primary" type="submit">Create user</button></form></Modal></>}

function PatientsPage({data,user,patients,setPage}){return <><PageTitle eyebrow="AUTHORIZED RECORDS" title={user.role==='family'?'Linked patient':'My patients'} text={user.role==='family'?'Only patient-approved information appears here.':'Only patients assigned to your account are listed.'}/>{patients.length?<div className="patient-card-grid">{patients.map(p=>{const u=data.users.find(x=>x.id===p.userId),doc=data.users.find(x=>p.doctorIds.includes(x.id));return <Card key={p.id} className="patient-card"><div className="patient-card-head"><Avatar user={u} size="lg"/><div><Badge tone="green">Access verified</Badge><h2>{u?.name}</h2><p>{p.mrn} · Blood group {p.bloodGroup}</p></div></div><div className="clinical-note"><Activity/><span><small>Current care focus</small><b>{p.conditions.join(', ')||'General care'}</b></span></div><div className="patient-meta"><span><Stethoscope/><small>Assigned doctor</small><b>{doc?.name}</b></span><span><FileHeart/><small>Records</small><b>{data.records.filter(r=>r.patientId===p.id).length}</b></span></div><button className="btn btn-secondary" onClick={()=>setPage(user.role==='family'?'records':'appointments')}>Open care details <ArrowRight/></button></Card>})}</div>:<Empty title="No authorized patients" text="Your account is not currently linked to a patient."/>}</>}

function CareTeamPage({data,patients}){const p=patients[0],pu=data.users.find(u=>u.id===p?.userId);if(!p)return null;return <><PageTitle eyebrow="MY CARE TEAM" title="The people connected to your care." text="Assignments and family access are visible so you always know who can see what."/><div className="team-layout"><Card className="team-primary"><p className="eyebrow">PATIENT</p><Avatar user={pu} size="lg"/><h2>{pu.name}</h2><p>{p.mrn} · {p.bloodGroup}</p><Badge tone="green"><ShieldCheck/> Account owner</Badge></Card>{p.doctorIds.map(id=>{const d=data.users.find(u=>u.id===id);return <Card className="team-person" key={id}><span className="round-icon"><Stethoscope/></span><Avatar user={d} size="lg"/><p className="eyebrow">ASSIGNED DOCTOR</p><h2>{d.name}</h2><p>{d.specialization}</p><Badge tone="blue">Clinical access</Badge></Card>})}{p.familyLinks.map(l=>{const f=data.users.find(u=>u.id===l.userId);return <Card className="team-person" key={l.userId}><span className="round-icon"><HeartHandshake/></span><Avatar user={f} size="lg"/><p className="eyebrow">APPROVED FAMILY</p><h2>{f.name}</h2><p>{l.relationship}</p><Badge tone="green">{l.permissions.length} permissions</Badge></Card>})}</div><Card className="permission-summary"><LockKeyhole/><div><h2>Your journal always stays private.</h2><p>Family access covers only the items you approve. MindMate journal entries are never included in caregiver access.</p></div></Card></>}

function QueuePage({data,setData,user,patients,hospital,notify}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer=setInterval(()=>setNow(Date.now()),1000); return()=>clearInterval(timer) }, [])
  const canManage=['admin','dean','head','doctor'].includes(user.role)
  const patient=patients[0]
  const token=data.tokens.find(item=>item.patientId===patient?.id&&item.status==='waiting')
  const patientQueue=data.queues.find(queue=>queue.id===token?.queueId)
  const relevantQueues=canManage
    ? data.queues.filter(queue=>queue.hospitalId===hospital.id&&(user.role==='doctor'?queue.doctorId===user.id:true))
    : patientQueue ? [patientQueue] : []
  const changeQueue=(queueId, changes, message) => {
    const updatedAt=new Date().toISOString()
    setData(current=>({...current,queues:current.queues.map(queue=>queue.id===queueId?{...queue,...changes(queue),updatedAt}:queue)}))
    notify(message, { recipientIds:queueRecipientIds(data,queueId,user.id), page:'queue', type:'queue' })
  }
  const advance=queue=>{
    const department=data.departments.find(item=>item.id===queue.departmentId)
    const next=queue.serving+1
    changeQueue(queue.id,()=>({serving:next}),`${department?.name || 'Queue'} is now serving CAR-${String(next).padStart(3,'0')}.`)
  }
  const ahead=token&&patientQueue?Math.max(0,token.number-patientQueue.serving-1):0
  const wait=patientQueue?ahead*patientQueue.avgMinutes:0
  return <><PageTitle eyebrow="QUEUECARE · SHARED LIVE DATA" title={canManage?'Queue operations':'Your live queue'} text={canManage?'Changes here immediately update patient and approved family views.':'Your doctor, hospital desk and approved family see the same queue status.'} actions={<span className="live-sync-chip"><i/> Live sync</span>}/>
    <div className="live-sync-banner" role="status"><Zap/><span><b>Connected across roles</b><small>Queue changes sync automatically between hospital, patient and approved family tabs.</small></span><span>{relativeTime((patientQueue||relevantQueues[0])?.updatedAt||new Date().toISOString(),now)}</span></div>
    {!canManage&&token&&patientQueue&&<Card className="token-detail" aria-live="polite"><div><small>Your token</small><strong>CAR-{String(token.number).padStart(3,'0')}</strong><p>{data.departments.find(d=>d.id===patientQueue.departmentId)?.name} · {data.users.find(u=>u.id===patientQueue.doctorId)?.name}</p><div className="queue-progress" aria-label={`${ahead} people ahead`}><i style={{width:`${Math.max(12,Math.min(100,100-ahead*14))}%`}}/></div><small>{ahead===0?'Please be ready—you are next.':`${ahead} ${ahead===1?'person':'people'} ahead of you`}</small></div><div className="token-live"><span><small>Now serving</small><b>CAR-{String(patientQueue.serving).padStart(3,'0')}</b></span><span><small>People ahead</small><b>{ahead}</b></span><span><small>Estimated wait</small><b>{ahead===0?'You’re next':`${Math.max(1,wait-2)}–${wait+8} min`}</b></span></div></Card>}
    {!canManage&&!token&&<Empty title="No active queue token" text="Your live position will appear here after hospital check-in."/>}
    <div className="queue-grid">{relevantQueues.map(queue=>{const department=data.departments.find(item=>item.id===queue.departmentId),doctor=data.users.find(item=>item.id===queue.doctorId),waiting=Math.max(0,queue.lastIssued-queue.serving);return <Card className="queue-card" key={queue.id}><div className="queue-card-head"><span className="round-icon"><Clock3/></span><div><p className="eyebrow">{department?.name}</p><h2>{doctor?.name}</h2><small className="queue-updated">Updated {relativeTime(queue.updatedAt,now)}</small></div><Badge tone={queue.paused?'coral':'green'}>{queue.paused?'Paused':'Live'}</Badge></div><div className="serving-number"><small>Now serving</small><strong>{String(queue.serving).padStart(3,'0')}</strong><p>Next: {String(queue.serving+1).padStart(3,'0')}</p></div><div className="queue-card-stats"><span><b>{waiting}</b><small>Waiting</small></span><span><b>{queue.avgMinutes}m</b><small>Avg. consult</small></span><span><b>{waiting*queue.avgMinutes}m</b><small>Last token wait</small></span></div>{canManage&&<div className="queue-actions"><button className="btn btn-primary" onClick={()=>advance(queue)} disabled={queue.paused}>Call next patient</button><button className="btn btn-secondary" onClick={()=>changeQueue(queue.id,current=>({paused:!current.paused}),`${department?.name || 'Queue'} ${queue.paused?'resumed':'paused'}.`)}>{queue.paused?'Resume':'Pause'}</button></div>}</Card>})}</div>
  </>
}

function AppointmentsPage({data,user,patients}){const list=data.appointments.filter(a=>a.doctorId===user.id&&patients.some(p=>p.id===a.patientId));return <><PageTitle eyebrow="CLINICAL SCHEDULE" title="Appointments" text="Upcoming consultations for your assigned patients."/><Card><div className="appointments-table"><div className="table-head"><span>Time</span><span>Patient</span><span>Department</span><span>Status</span></div>{list.map(a=>{const p=patients.find(p=>p.id===a.patientId),u=data.users.find(u=>u.id===p.userId),d=data.departments.find(d=>d.id===a.departmentId);return <div className="appointment-row" key={a.id}><span><b>{fmtDate(a.date)}</b><small>{fmtTime(a.time)}</small></span><span className="person-cell"><Avatar user={u}/><span><b>{u.name}</b><small>{p.mrn}</small></span></span><span>{d.name}</span><Badge tone={a.status==='checked-in'?'green':'neutral'}>{a.status}</Badge></div>})}</div></Card></>}

function shortestPath(plan,start,end,accessible){const dist={},prev={},unseen=new Set(Object.keys(plan.nodes));Object.keys(plan.nodes).forEach(n=>dist[n]=Infinity);dist[start]=0;while(unseen.size){const u=[...unseen].sort((a,b)=>dist[a]-dist[b])[0];unseen.delete(u);if(u===end)break;for(const[a,b,w,ok]of plan.edges){if(accessible&&!ok)continue;const v=a===u?b:b===u?a:null;if(!v||!unseen.has(v))continue;const alt=dist[u]+w;if(alt<dist[v]){dist[v]=alt;prev[v]=u}}}const path=[];for(let n=end;n;n=prev[n]){path.unshift(n);if(n===start)break}return path[0]===start?path:[]}
function ClinicCompassPage({data,hospitalId,setHospitalId,user}){const[hid,setHid]=useState(hospitalId),[start,setStart]=useState('Entrance'),[end,setEnd]=useState('Cardiology'),[accessible,setAccessible]=useState(true),[path,setPath]=useState([]);const plan=floorPlans[hid]||floorPlans.h1;useEffect(()=>{const names=Object.keys(plan.nodes);setStart(names[0]);setEnd(names[names.length-1]);setPath([])},[hid]);const route=()=>setPath(shortestPath(plan,start,end,accessible));return <><PageTitle eyebrow="CLINICCOMPASS · TEST HOSPITAL MAP" title="Find the right care, without getting lost." text="This fictional, testable floor plan demonstrates accessible indoor navigation. Real deployment requires a verified hospital map."/><div className="map-layout"><Card className="route-panel"><p className="eyebrow">PLAN A ROUTE</p><h2>{plan.name}</h2><div className="form-stack"><label>Hospital<select value={hid} onChange={e=>setHid(e.target.value)}>{data.hospitals.filter(h=>floorPlans[h.id]&&(user.role==='admin'||user.hospitalIds.includes(h.id))).map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>Starting point<select value={start} onChange={e=>setStart(e.target.value)}>{Object.keys(plan.nodes).map(n=><option key={n}>{n}</option>)}</select></label><label>Destination<select value={end} onChange={e=>setEnd(e.target.value)}>{Object.keys(plan.nodes).map(n=><option key={n}>{n}</option>)}</select></label><label className="switch-label"><input type="checkbox" checked={accessible} onChange={e=>setAccessible(e.target.checked)}/><span className="switch"></span><span><b>Wheelchair-friendly</b><small>Avoid stairs and inaccessible edges</small></span></label><button className="btn btn-primary" onClick={route}><Route/> Find route</button></div>{path.length>0&&<div className="directions"><Badge tone="green">{(path.length-1)*2} min · {path.length-1} steps</Badge><ol>{path.map((n,i)=><li key={n}><b>{i+1}</b><span>{i?'Continue to':'Start at'} <strong>{n}</strong></span></li>)}</ol></div>}<RouteAnalysisCard plan={plan} start={start} end={end} accessible={accessible} path={path}/></Card><Card className="floor-map"><div className="map-toolbar"><span><i className="route-key"></i>Suggested route</span><span><i className="lift-key"></i>Accessible path</span><span><i className="stairs-key"></i>Stairs</span></div><svg viewBox="0 0 700 390" role="img" aria-label={`${plan.name} fictional floor plan`}><rect x="20" y="20" width="660" height="350" rx="20" className="map-shell"/>{plan.edges.map(([a,b,,ok])=>{const n1=plan.nodes[a],n2=plan.nodes[b],active=path.some((n,i)=>(n===a&&path[i+1]===b)||(n===b&&path[i+1]===a));return <line key={`${a}-${b}`} x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} className={active?'map-route':ok?'map-edge':'map-stairs'}/>})}{Object.entries(plan.nodes).map(([name,n])=><g key={name}><circle cx={n.x} cy={n.y} r="11" className={path.includes(name)?'map-node active':'map-node'}/><text x={n.x} y={n.y-19} textAnchor="middle">{name}</text><text x={n.x} y={n.y+31} textAnchor="middle" className="floor-label">Floor {n.floor}</text></g>)}</svg><p className="map-disclaimer"><ShieldCheck/> Fictional plan for testing only. Confirm directions with hospital staff in real facilities.</p></Card></div></>}

function RecordsPage({data,setData,user,patients,notify}) {
  const [open,setOpen]=useState(false)
  const [selected,setSelected]=useState(null)
  const [deleteTarget,setDeleteTarget]=useState(null)
  const [search,setSearch]=useState('')
  const patientIds=patients.map(patient=>patient.id)
  const isFamily=user.role==='family'
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
  return <><PageTitle eyebrow="HEALTHSTORY" title={isFamily?'Shared health reports':'Your health timeline'} text={isFamily?'Open reports the patient explicitly shared with you.':'Add complete reports with a clear description and optional family sharing.'} actions={!isFamily&&<button className="btn btn-primary" onClick={()=>setOpen(true)}><Plus/> Add report</button>}/>
    <Card><div className="table-toolbar"><label className="search-box"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title, hospital or description" aria-label="Search health reports"/></label><Badge>{records.length} reports</Badge></div><div className="record-list">{records.length?records.map(record=><article key={record.id}><span className="record-icon"><FileHeart/></span><div className="record-copy"><Badge tone="blue">{record.type}</Badge><h2>{record.title}</h2><p className="record-hospital">{record.hospital}</p><p className="record-summary">{record.summary}</p></div><span className="record-date"><b>{fmtDate(record.date)}</b>{record.sharedWithFamily&&<small><HeartHandshake/> Shared with family</small>}</span><button className="btn btn-secondary record-open" onClick={()=>setSelected(record)} aria-label={`View report ${record.title}`}><FileText/> View report</button></article>):<Empty title="No matching reports" text={isFamily?'Only reports shared by the patient appear here.':'Add a report or try another search.'}/>}</div></Card>
    <Modal open={open} onClose={()=>setOpen(false)} eyebrow="HEALTHSTORY" title="Add a health report"><form className="form-stack" onSubmit={add}><label>Report title<input name="title" required placeholder="Example: Cardiology follow-up"/></label><label>Hospital<input name="hospital" defaultValue="Sanjeevani Multispeciality Hospital" required/></label><div className="form-grid"><label>Report type<select name="type"><option>Lab report</option><option>Prescription</option><option>Scan</option><option>Discharge summary</option><option>Consultation note</option></select></label><label>Date<input name="date" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label></div><label>Report description<textarea name="description" rows="5" minLength="20" required placeholder="Describe the findings, instructions and follow-up in clear language."/><small className="field-help">Required · family members will see this only when sharing is enabled.</small></label><label>Short summary <small>(optional)</small><textarea name="summary" rows="2" maxLength="180" placeholder="Leave blank to generate a summary from the description."/></label><label className="checkbox-label"><input name="share" type="checkbox"/> Share this report and description with approved family</label><button className="btn btn-primary" type="submit">Save report</button></form></Modal>
    <Modal open={Boolean(selected)} onClose={()=>setSelected(null)} eyebrow="HEALTH REPORT" title={selected?.title || 'Report details'}>{selected&&<div className="report-view"><div className="report-meta"><Badge tone="blue">{selected.type}</Badge><span><CalendarDays/> {fmtDate(selected.date)}</span>{selected.sharedWithFamily&&<span><HeartHandshake/> Family access enabled</span>}</div><section><p className="eyebrow">SUMMARY</p><h3>{selected.summary}</h3></section><section><p className="eyebrow">FULL DESCRIPTION</p><p>{selected.description}</p></section><footer><span><Hospital/>{selected.hospital}</span><span><ShieldCheck/>{isFamily?'Shared by the patient':'Patient-controlled record'}</span></footer><div className={classNames('deletion-policy',selectedPolicy.allowed&&'active')}><ShieldCheck/><span><b>{selectedPolicy.allowed?`Delete available for ${formatRemainingWindow(selectedPolicy.remainingMs)}`:selectedPolicy.reason==='creator-only'?`Only ${selectedCreator?.name || 'the report creator'} can delete this report`:'The 24-hour deletion window has closed'}</b><small>Reports can only be deleted by their creator during the first 24 hours.</small></span></div><div className="report-actions"><button className="btn btn-secondary" onClick={()=>window.print()}><Printer/> Print report</button>{selectedPolicy.allowed&&<button className="btn btn-danger" onClick={()=>{setDeleteTarget(selected);setSelected(null)}}><Trash2/> Delete report</button>}</div></div>}</Modal>
    <Modal open={Boolean(deleteTarget)} onClose={()=>setDeleteTarget(null)} eyebrow="CONFIRM DELETION" title="Delete this report?">{deleteTarget&&<div className="delete-confirmation"><span><Trash2/></span><p><b>{deleteTarget.title}</b> will be permanently removed from the patient timeline. This action cannot be undone.</p><div><button className="btn btn-secondary" onClick={()=>setDeleteTarget(null)}>Keep report</button><button className="btn btn-danger" onClick={confirmDelete}><Trash2/> Delete permanently</button></div></div>}</Modal>
  </>
}

function MedicationsPage({data,setData,user,patients,notify}){const p=patients[0],isFamily=user.role==='family',meds=data.medications.filter(m=>m.patientId===p?.id);const update=(id,status)=>{setData({...data,medications:data.medications.map(m=>m.id===id?{...m,status}:m)});notify(`Dose marked ${status}`)};return <><PageTitle eyebrow="MEDMINDER" title={isFamily?'Medication visibility':'Today’s prescribed schedule'} text={isFamily?'Read-only status shared by the patient.':'Track the existing schedule from your prescription. CareBridge never changes doses.'}/><div className="medication-grid">{meds.map(m=><Card className="med-card" key={m.id}><div className="med-time"><Clock3/><b>{fmtTime(m.time)}</b></div><span className="pill-art"><Pill/></span><h2>{m.name}</h2><p>{m.instruction} · {m.note}</p><Badge tone={m.status==='taken'?'green':m.status==='skipped'?'coral':'gold'}>{m.status}</Badge>{!isFamily&&<div className="med-actions"><button className={m.status==='taken'?'active':''} onClick={()=>update(m.id,'taken')}><Check/> Taken</button><button className={m.status==='skipped'?'skip active':''} onClick={()=>update(m.id,'skipped')}><X/> Skipped</button></div>}</Card>)}</div><div className="safety-note"><ShieldCheck/><div><b>Medication safety</b><p>Schedules are entered from existing instructions. CareBridge does not diagnose, prescribe, calculate doses, or treat an unconfirmed dose as missed.</p></div></div></>}

function CareCirclePage({data,setData,user,patients,notify}){const p=patients[0];if(!p)return null;const isFamily=user.role==='family',requests=data.careRequests.filter(r=>r.patientId===p.id);const acknowledge=id=>{setData({...data,careRequests:data.careRequests.map(r=>r.id===id?{...r,status:'acknowledged',acknowledgedBy:user.id}:r)});notify('Request acknowledged')};return <><PageTitle eyebrow="CARECIRCLE" title={isFamily?'Care updates from Ananya':'Your trusted family connection'} text={isFamily?'Acknowledge updates so Ananya knows you have seen them.':'Send a check-in only to the family member you approved.'}/>{!isFamily&&<Card className="care-actions"><div><p className="eyebrow">QUICK CHECK-IN</p><h2>How are you right now?</h2><p>These updates go to Ravi, your approved family caregiver.</p></div><div><button onClick={()=>sendCareRequest('I’m okay','normal',p.id,data,setData,notify)}><Check/><span><b>I’m okay</b><small>Send a reassuring update</small></span></button><button onClick={()=>sendCareRequest('Please call me','medium',p.id,data,setData,notify)}><HeartHandshake/><span><b>Please call me</b><small>Ask Ravi to get in touch</small></span></button><button className="urgent" onClick={()=>sendCareRequest('I need help','high',p.id,data,setData,notify)}><Bell/><span><b>I need help</b><small>Send a high-priority request</small></span></button></div></Card>}<Card><div className="card-head"><div><p className="eyebrow">SHARED ACTIVITY</p><h2>Care timeline</h2></div><Badge tone="green"><LockKeyhole/> Relationship protected</Badge></div><div className="care-timeline">{requests.length?requests.map(r=><article key={r.id}><span className={classNames('timeline-dot',r.priority==='high'&&'urgent')}></span><div><h3>{r.text}</h3><p>{new Date(r.createdAt).toLocaleString('en-IN')} · {r.priority} priority</p></div><Badge tone={r.status==='acknowledged'?'green':'gold'}>{r.status}</Badge>{isFamily&&r.status!=='acknowledged'&&<button className="btn btn-secondary" onClick={()=>acknowledge(r.id)}>Acknowledge</button>}</article>):<Empty title="No updates yet" text="Patient check-ins will appear here."/>}</div></Card></>}

function App(){const[data,setData]=useStoredData();const[session,setSession]=useState(()=>localStorage.getItem(SESSION_KEY));const user=data.users.find(u=>u.id===session);const login=id=>{localStorage.setItem(SESSION_KEY,id);setSession(id)};const logout=()=>{localStorage.removeItem(SESSION_KEY);setSession(null)};return user?<AppShell {...{data,setData,user,onLogout:logout}}/>:<Login data={data} onLogin={login}/>} 

export default App
