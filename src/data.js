export const DEMO_PASSWORD = 'care123'
export const DEMO_DATA_VERSION = 5

// Demo dates follow the real calendar, so "today's" appointment is always today.
const dayOffset = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString()

export const seedData = {
  hospitals: [
    { id: 'h1', name: 'Sanjeevani Multispeciality Hospital', code: 'SMH', city: 'Chennai', type: 'Tertiary care', beds: 420, status: 'active', deanId: 'u-dean', color: '#138F84' },
    { id: 'h2', name: 'CareBridge Community Clinic', code: 'CCC', city: 'Kanchipuram', type: 'Community care', beds: 80, status: 'active', deanId: 'u-admin', color: '#2B70D5' },
  ],
  departments: [
    { id: 'd-card', hospitalId: 'h1', name: 'Cardiology', floor: '2', room: '204', headId: 'u-head', icon: 'heart', staff: 12 },
    { id: 'd-ortho', hospitalId: 'h1', name: 'Orthopaedics', floor: '1', room: '112', headId: 'u-arjun', icon: 'activity', staff: 9 },
    { id: 'd-general', hospitalId: 'h1', name: 'General Medicine', floor: 'G', room: 'G08', headId: 'u-meera', icon: 'stethoscope', staff: 18 },
    { id: 'd-lab', hospitalId: 'h1', name: 'Diagnostics', floor: '1', room: '118', headId: 'u-dean', icon: 'flask', staff: 14 },
    { id: 'd-emergency', hospitalId: 'h1', name: 'Emergency', floor: 'G', room: 'E01', headId: 'u-dean', icon: 'siren', staff: 28 },
    { id: 'd-family', hospitalId: 'h2', name: 'Family Medicine', floor: 'G', room: 'G04', headId: 'u-admin', icon: 'users', staff: 6 },
  ],
  users: [
    { id: 'u-admin', name: 'Kavya Raman', email: 'admin@carebridge.demo', role: 'admin', title: 'Network Administrator', hospitalIds: ['h1','h2'], initials: 'KR' },
    { id: 'u-dean', name: 'Dr. Nandini Iyer', email: 'dean@sanjeevani.demo', role: 'dean', title: 'Hospital Dean', hospitalIds: ['h1'], initials: 'NI' },
    { id: 'u-head', name: 'Dr. Vikram Sen', email: 'head.cardio@sanjeevani.demo', role: 'head', title: 'Head of Cardiology', hospitalIds: ['h1'], departmentId: 'd-card', specialization: 'Cardiology', initials: 'VS' },
    { id: 'u-meera', name: 'Dr. Meera Shah', email: 'meera@sanjeevani.demo', phone: '+919800000102', role: 'doctor', title: 'Consultant Cardiologist', hospitalIds: ['h1'], departmentId: 'd-card', specialization: 'Interventional Cardiology', initials: 'MS' },
    { id: 'u-arjun', name: 'Dr. Arjun Rao', email: 'arjun@sanjeevani.demo', role: 'doctor', title: 'Orthopaedic Specialist', hospitalIds: ['h1'], departmentId: 'd-ortho', specialization: 'Joint Care', initials: 'AR' },
    { id: 'u-ananya', name: 'Ananya Kumar', email: 'ananya@carebridge.demo', role: 'patient', title: 'Patient', hospitalIds: ['h1'], patientId: 'p1', initials: 'AK' },
    { id: 'u-ravi', name: 'Ravi Kumar', email: 'ravi@carebridge.demo', phone: '+919800000101', role: 'family', title: 'Approved family caregiver', hospitalIds: ['h1'], initials: 'RK' },
    { id: 'u-priya', name: 'Priya Nair', email: 'priya@carebridge.demo', role: 'patient', title: 'Patient', hospitalIds: ['h1'], patientId: 'p2', initials: 'PN' },
  ],
  patients: [
    { id: 'p1', userId: 'u-ananya', hospitalId: 'h1', mrn: 'SMH-20481', dob: '2004-03-17', bloodGroup: 'B+', doctorIds: ['u-meera'], familyLinks: [{ userId: 'u-ravi', relationship: 'Father', status: 'approved', permissions: ['queue','medications','care','records'] }], allergies: ['Penicillin'], conditions: ['Hypertension monitoring'] },
    { id: 'p2', userId: 'u-priya', hospitalId: 'h1', mrn: 'SMH-20496', dob: '1998-11-02', bloodGroup: 'O+', doctorIds: ['u-arjun'], familyLinks: [], allergies: [], conditions: ['Knee rehabilitation'] },
  ],
  queues: [
    { id: 'q1', hospitalId: 'h1', departmentId: 'd-card', doctorId: 'u-meera', serving: 20, lastIssued: 28, avgMinutes: 5, paused: false, updatedAt: minutesAgo(5) },
    { id: 'q2', hospitalId: 'h1', departmentId: 'd-ortho', doctorId: 'u-arjun', serving: 8, lastIssued: 14, avgMinutes: 7, paused: false, updatedAt: minutesAgo(8) },
  ],
  tokens: [
    { id: 't1', queueId: 'q1', patientId: 'p1', number: 25, status: 'waiting', createdAt: '2026-10-13T12:10:00.000Z' },
    { id: 't2', queueId: 'q2', patientId: 'p2', number: 12, status: 'waiting', createdAt: '2026-10-13T12:20:00.000Z' },
  ],
  records: [
    { id: 'r1', patientId: 'p1', title: 'Complete blood count', hospital: 'Sanjeevani Multispeciality Hospital', type: 'Lab report', date: '2026-10-08', description: 'Routine blood count completed during the cardiology follow-up. Haemoglobin, white-cell count and platelets were recorded within the expected reference range for this fictional demonstration.', summary: 'Routine blood count results were within the expected demonstration range.', sharedWithFamily: true, createdBy: 'u-ananya' },
    { id: 'r2', patientId: 'p1', title: 'Cardiology prescription', hospital: 'Sanjeevani Multispeciality Hospital', type: 'Prescription', date: '2026-09-28', description: 'Medication instructions recorded after the cardiology consultation. Continue only the medicines and timings shown in the existing prescription; CareBridge does not alter doses.', summary: 'Existing cardiology medication instructions and timings.', sharedWithFamily: true, createdBy: 'u-ananya' },
    { id: 'r3', patientId: 'p2', title: 'Knee X-ray', hospital: 'Sanjeevani Multispeciality Hospital', type: 'Scan', date: '2026-10-03', description: 'Knee X-ray captured for the rehabilitation review. The report remains private to the patient and assigned care team.', summary: 'Knee imaging saved for rehabilitation follow-up.', sharedWithFamily: false, createdBy: 'u-priya' },
  ],
  medications: [
    { id: 'm1', patientId: 'p1', name: 'Atorvastatin', instruction: '1 tablet', time: '20:00', note: 'After dinner', status: 'unconfirmed' },
    { id: 'm2', patientId: 'p1', name: 'Vitamin D3', instruction: '1 tablet', time: '09:00', note: 'After breakfast', status: 'taken' },
    { id: 'm3', patientId: 'p2', name: 'Calcium supplement', instruction: '1 tablet', time: '08:30', note: 'With food', status: 'taken' },
  ],
  careRequests: [
    { id: 'c1', patientId: 'p1', text: 'I’m okay', priority: 'normal', status: 'acknowledged', createdAt: '2026-10-13T10:30:00.000Z', acknowledgedBy: 'u-ravi' },
  ],
  appointments: [
    { id: 'a1', patientId: 'p1', doctorId: 'u-meera', hospitalId: 'h1', departmentId: 'd-card', date: dayOffset(0), time: '16:30', status: 'checked-in' },
    { id: 'a2', patientId: 'p2', doctorId: 'u-arjun', hospitalId: 'h1', departmentId: 'd-ortho', date: dayOffset(1), time: '10:00', status: 'scheduled' },
  ],
  notifications: [
    { id: 'n-seed-1', message: 'Complete blood count was shared with your family caregiver.', recipientIds: ['u-ananya'], page: 'records', type: 'record', createdAt: '2026-10-13T15:48:00.000Z', readBy: [] },
    { id: 'n-seed-2', message: 'Ananya shared a health report with you.', recipientIds: ['u-ravi'], page: 'records', type: 'record', createdAt: '2026-10-13T15:48:00.000Z', readBy: [] },
    { id: 'n-seed-3', message: 'Cardiology queue is live and currently serving CAR-020.', recipientIds: ['u-ananya', 'u-ravi'], page: 'queue', type: 'queue', createdAt: '2026-10-13T15:55:00.000Z', readBy: [] },
  ],
}

// A deliberately rich, fully fictional dataset used by every role during demos and QA.
// It is kept in one connected graph so reports, medicines, appointments and access
// relationships can be tested without relying on real patient information.
seedData.hospitals.push(
  { id: 'h3', name: 'Lotus Women & Children Hospital', code: 'LWC', city: 'Chennai', type: 'Women and children', beds: 160, status: 'active', deanId: 'u-dean-lotus', color: '#9B5DE5' },
  { id: 'h4', name: 'Marina Heart Institute', code: 'MHI', city: 'Puducherry', type: 'Cardiac speciality', beds: 220, status: 'active', deanId: 'u-dean-marina', color: '#E76F51' },
)

seedData.departments.push(
  { id: 'd-community', hospitalId: 'h2', name: 'Community Medicine', floor: 'G', room: 'G08', headId: 'u-leela', icon: 'stethoscope', staff: 8 },
  { id: 'd-pedia-clinic', hospitalId: 'h2', name: 'Paediatrics', floor: '1', room: '105', headId: 'u-imran', icon: 'baby', staff: 7 },
  { id: 'd-women', hospitalId: 'h3', name: 'Obstetrics & Gynaecology', floor: '2', room: '210', headId: 'u-farah', icon: 'heart', staff: 22 },
  { id: 'd-pedia', hospitalId: 'h3', name: 'Child Health', floor: '1', room: '108', headId: 'u-karthik', icon: 'baby', staff: 18 },
  { id: 'd-heart', hospitalId: 'h4', name: 'Advanced Cardiology', floor: '3', room: '302', headId: 'u-adesh', icon: 'heart-pulse', staff: 26 },
  { id: 'd-heart-emergency', hospitalId: 'h4', name: 'Cardiac Emergency', floor: 'G', room: 'E02', headId: 'u-nisha', icon: 'siren', staff: 20 },
)

seedData.users.push(
  { id: 'u-dean-clinic', name: 'Dr. Thomas George', email: 'dean@community.demo', role: 'dean', title: 'Clinic Dean', hospitalIds: ['h2'], initials: 'TG' },
  { id: 'u-dean-lotus', name: 'Dr. Shalini Bose', email: 'dean@lotus.demo', role: 'dean', title: 'Hospital Dean', hospitalIds: ['h3'], initials: 'SB' },
  { id: 'u-dean-marina', name: 'Dr. Joseph Antony', email: 'dean@marina.demo', role: 'dean', title: 'Hospital Dean', hospitalIds: ['h4'], initials: 'JA' },
  { id: 'u-leela', name: 'Dr. Leela Menon', email: 'leela@community.demo', role: 'head', title: 'Head of Community Medicine', hospitalIds: ['h2'], departmentId: 'd-community', specialization: 'Family Medicine', initials: 'LM' },
  { id: 'u-imran', name: 'Dr. Imran Khan', email: 'imran@community.demo', role: 'doctor', title: 'Consultant Paediatrician', hospitalIds: ['h2'], departmentId: 'd-pedia-clinic', specialization: 'Paediatrics', initials: 'IK' },
  { id: 'u-farah', name: 'Dr. Farah Ali', email: 'farah@lotus.demo', role: 'head', title: 'Head of Women’s Health', hospitalIds: ['h3'], departmentId: 'd-women', specialization: 'Obstetrics & Gynaecology', initials: 'FA' },
  { id: 'u-karthik', name: 'Dr. Karthik Iyer', email: 'karthik@lotus.demo', role: 'doctor', title: 'Child Health Specialist', hospitalIds: ['h3'], departmentId: 'd-pedia', specialization: 'Child Health', initials: 'KI' },
  { id: 'u-roseline', name: 'Dr. Roseline Paul', email: 'roseline@lotus.demo', role: 'doctor', title: 'Consultant Obstetrician', hospitalIds: ['h3'], departmentId: 'd-women', specialization: 'Maternal Health', initials: 'RP' },
  { id: 'u-adesh', name: 'Dr. Adesh Varma', email: 'adesh@marina.demo', role: 'head', title: 'Head of Advanced Cardiology', hospitalIds: ['h4'], departmentId: 'd-heart', specialization: 'Cardiac Electrophysiology', initials: 'AV' },
  { id: 'u-nisha', name: 'Dr. Nisha Roy', email: 'nisha@marina.demo', role: 'doctor', title: 'Emergency Cardiologist', hospitalIds: ['h4'], departmentId: 'd-heart-emergency', specialization: 'Emergency Cardiology', initials: 'NR' },
  { id: 'u-mahi', name: 'Mahima Das', email: 'mahima@carebridge.demo', role: 'patient', title: 'Patient', hospitalIds: ['h2'], patientId: 'p3', initials: 'MD' },
  { id: 'u-rahul', name: 'Rahul Verma', email: 'rahul@carebridge.demo', role: 'patient', title: 'Patient', hospitalIds: ['h2'], patientId: 'p4', initials: 'RV' },
  { id: 'u-divya', name: 'Divya Krishnan', email: 'divya@carebridge.demo', role: 'patient', title: 'Patient', hospitalIds: ['h3'], patientId: 'p5', initials: 'DK' },
  { id: 'u-sara', name: 'Sara Ahmed', email: 'sara@carebridge.demo', role: 'patient', title: 'Patient', hospitalIds: ['h3'], patientId: 'p6', initials: 'SA' },
  { id: 'u-vijay', name: 'Vijay Subramaniam', email: 'vijay@carebridge.demo', role: 'patient', title: 'Patient', hospitalIds: ['h4'], patientId: 'p7', initials: 'VS' },
  { id: 'u-lakshmi', name: 'Lakshmi Narayan', email: 'lakshmi@carebridge.demo', role: 'patient', title: 'Patient', hospitalIds: ['h4'], patientId: 'p8', initials: 'LN' },
  { id: 'u-kiran', name: 'Kiran Raj', email: 'kiran@carebridge.demo', role: 'patient', title: 'Patient', hospitalIds: ['h1'], patientId: 'p9', initials: 'KR' },
  { id: 'u-naveen', name: 'Naveen S', email: 'naveen@carebridge.demo', role: 'patient', title: 'Patient', hospitalIds: ['h1'], patientId: 'p10', initials: 'NS' },
  { id: 'u-suresh', name: 'Suresh Das', email: 'suresh@carebridge.demo', role: 'family', title: 'Approved family caregiver', hospitalIds: ['h2'], initials: 'SD' },
  { id: 'u-sneha', name: 'Sneha Verma', email: 'sneha@carebridge.demo', role: 'family', title: 'Approved family caregiver', hospitalIds: ['h2'], initials: 'SV' },
  { id: 'u-anjali', name: 'Anjali Krishnan', email: 'anjali@carebridge.demo', role: 'family', title: 'Approved family caregiver', hospitalIds: ['h3'], initials: 'AK' },
  { id: 'u-omar', name: 'Omar Ahmed', email: 'omar@carebridge.demo', role: 'family', title: 'Approved family caregiver', hospitalIds: ['h3'], initials: 'OA' },
  { id: 'u-rekha', name: 'Rekha Subramaniam', email: 'rekha@carebridge.demo', role: 'family', title: 'Approved family caregiver', hospitalIds: ['h4'], initials: 'RS' },
  { id: 'u-mohan', name: 'Mohan Narayan', email: 'mohan@carebridge.demo', role: 'family', title: 'Approved family caregiver', hospitalIds: ['h4'], initials: 'MN' },
)

seedData.patients.push(
  { id: 'p3', userId: 'u-mahi', hospitalId: 'h2', mrn: 'CCC-10412', dob: '1987-05-09', bloodGroup: 'A+', doctorIds: ['u-leela'], familyLinks: [{ userId: 'u-suresh', relationship: 'Father', status: 'approved', permissions: ['queue','medications','care','records'] }], allergies: ['Sulfa drugs'], conditions: ['Type 2 diabetes monitoring'] },
  { id: 'p4', userId: 'u-rahul', hospitalId: 'h2', mrn: 'CCC-10425', dob: '2012-08-21', bloodGroup: 'O-', doctorIds: ['u-imran'], familyLinks: [{ userId: 'u-sneha', relationship: 'Mother', status: 'approved', permissions: ['queue','medications','care','records'] }], allergies: ['Peanuts'], conditions: ['Seasonal asthma'] },
  { id: 'p5', userId: 'u-divya', hospitalId: 'h3', mrn: 'LWC-30214', dob: '1992-01-14', bloodGroup: 'AB+', doctorIds: ['u-farah','u-roseline'], familyLinks: [{ userId: 'u-anjali', relationship: 'Sister', status: 'approved', permissions: ['queue','care','records'] }], allergies: [], conditions: ['Antenatal follow-up'] },
  { id: 'p6', userId: 'u-sara', hospitalId: 'h3', mrn: 'LWC-30228', dob: '2017-06-04', bloodGroup: 'B-', doctorIds: ['u-karthik'], familyLinks: [{ userId: 'u-omar', relationship: 'Father', status: 'approved', permissions: ['queue','medications','care','records'] }], allergies: ['Dust'], conditions: ['Paediatric wellness follow-up'] },
  { id: 'p7', userId: 'u-vijay', hospitalId: 'h4', mrn: 'MHI-50102', dob: '1968-12-19', bloodGroup: 'A-', doctorIds: ['u-adesh'], familyLinks: [{ userId: 'u-rekha', relationship: 'Spouse', status: 'approved', permissions: ['queue','medications','care','records'] }], allergies: [], conditions: ['Cardiac rhythm monitoring'] },
  { id: 'p8', userId: 'u-lakshmi', hospitalId: 'h4', mrn: 'MHI-50119', dob: '1959-09-03', bloodGroup: 'O+', doctorIds: ['u-nisha'], familyLinks: [{ userId: 'u-mohan', relationship: 'Son', status: 'approved', permissions: ['queue','medications','care'] }], allergies: ['Aspirin'], conditions: ['Post-discharge cardiac observation'] },
  { id: 'p9', userId: 'u-kiran', hospitalId: 'h1', mrn: 'SMH-20518', dob: '1982-02-11', bloodGroup: 'B+', doctorIds: ['u-meera'], familyLinks: [], allergies: [], conditions: ['Cholesterol review'] },
  { id: 'p10', userId: 'u-naveen', hospitalId: 'h1', mrn: 'SMH-20526', dob: '1990-07-27', bloodGroup: 'AB-', doctorIds: ['u-arjun'], familyLinks: [], allergies: ['Latex'], conditions: ['Shoulder rehabilitation'] },
)

seedData.queues.push(
  { id: 'q3', hospitalId: 'h2', departmentId: 'd-community', doctorId: 'u-leela', serving: 14, lastIssued: 21, avgMinutes: 6, paused: false, updatedAt: '2026-10-14T08:20:00.000Z' },
  { id: 'q4', hospitalId: 'h2', departmentId: 'd-pedia-clinic', doctorId: 'u-imran', serving: 6, lastIssued: 11, avgMinutes: 8, paused: false, updatedAt: '2026-10-14T08:18:00.000Z' },
  { id: 'q5', hospitalId: 'h3', departmentId: 'd-women', doctorId: 'u-farah', serving: 9, lastIssued: 15, avgMinutes: 9, paused: false, updatedAt: '2026-10-14T08:15:00.000Z' },
  { id: 'q6', hospitalId: 'h3', departmentId: 'd-pedia', doctorId: 'u-karthik', serving: 4, lastIssued: 10, avgMinutes: 7, paused: false, updatedAt: '2026-10-14T08:12:00.000Z' },
  { id: 'q7', hospitalId: 'h4', departmentId: 'd-heart', doctorId: 'u-adesh', serving: 18, lastIssued: 23, avgMinutes: 10, paused: false, updatedAt: '2026-10-14T08:10:00.000Z' },
)

seedData.tokens.push(
  { id: 't3', queueId: 'q3', patientId: 'p3', number: 19, status: 'waiting', createdAt: '2026-10-14T07:40:00.000Z' },
  { id: 't4', queueId: 'q4', patientId: 'p4', number: 9, status: 'waiting', createdAt: '2026-10-14T07:42:00.000Z' },
  { id: 't5', queueId: 'q5', patientId: 'p5', number: 12, status: 'waiting', createdAt: '2026-10-14T07:45:00.000Z' },
  { id: 't6', queueId: 'q7', patientId: 'p7', number: 21, status: 'waiting', createdAt: '2026-10-14T07:48:00.000Z' },
)

seedData.records.push(
  { id: 'r4', patientId: 'p3', title: 'HbA1c monitoring report', hospital: 'CareBridge Community Clinic', type: 'Lab report', date: '2026-10-10', description: 'Fictional three-month glucose monitoring report prepared for a routine community medicine review.', summary: 'Glucose trend report available for the next consultation.', sharedWithFamily: true, createdBy: 'u-leela' },
  { id: 'r5', patientId: 'p3', title: 'Diet and activity plan', hospital: 'CareBridge Community Clinic', type: 'Care plan', date: '2026-09-22', description: 'A demonstration care plan containing the clinician-recorded meal, walking and follow-up schedule.', summary: 'Lifestyle plan recorded by the community care team.', sharedWithFamily: true, createdBy: 'u-mahi' },
  { id: 'r6', patientId: 'p4', title: 'Respiratory review', hospital: 'CareBridge Community Clinic', type: 'Consultation', date: '2026-10-11', description: 'Paediatric respiratory review with fictional peak-flow observations and the existing inhaler plan.', summary: 'Seasonal asthma review completed.', sharedWithFamily: true, createdBy: 'u-imran' },
  { id: 'r7', patientId: 'p4', title: 'Allergy action note', hospital: 'CareBridge Community Clinic', type: 'Care plan', date: '2026-09-30', description: 'Demonstration allergy precautions shared with the approved parent caregiver.', summary: 'Peanut allergy precautions documented.', sharedWithFamily: true, createdBy: 'u-sneha' },
  { id: 'r8', patientId: 'p5', title: 'Antenatal screening summary', hospital: 'Lotus Women & Children Hospital', type: 'Lab report', date: '2026-10-09', description: 'Fictional antenatal screening values saved for the assigned maternal health team.', summary: 'Routine antenatal screening completed.', sharedWithFamily: true, createdBy: 'u-farah' },
  { id: 'r9', patientId: 'p5', title: 'Ultrasound visit note', hospital: 'Lotus Women & Children Hospital', type: 'Scan', date: '2026-09-25', description: 'Demonstration imaging visit note with no diagnostic interpretation in CareBridge.', summary: 'Imaging visit recorded for clinical follow-up.', sharedWithFamily: false, createdBy: 'u-divya' },
  { id: 'r10', patientId: 'p6', title: 'Child wellness assessment', hospital: 'Lotus Women & Children Hospital', type: 'Consultation', date: '2026-10-12', description: 'Routine fictional wellness assessment including growth measurements and the next review date.', summary: 'Wellness visit completed and follow-up scheduled.', sharedWithFamily: true, createdBy: 'u-karthik' },
  { id: 'r11', patientId: 'p6', title: 'Vaccination record copy', hospital: 'Lotus Women & Children Hospital', type: 'Health record', date: '2026-08-14', description: 'A fictional copy of previously recorded vaccination dates for demonstration only.', summary: 'Vaccination history available to the approved caregiver.', sharedWithFamily: true, createdBy: 'u-omar' },
  { id: 'r12', patientId: 'p7', title: 'ECG follow-up report', hospital: 'Marina Heart Institute', type: 'Diagnostic report', date: '2026-10-13', description: 'Demonstration ECG follow-up report stored for the assigned cardiac team and approved spouse.', summary: 'Rhythm follow-up report is ready for review.', sharedWithFamily: true, createdBy: 'u-adesh' },
  { id: 'r13', patientId: 'p7', title: 'Cardiology discharge summary', hospital: 'Marina Heart Institute', type: 'Discharge summary', date: '2026-09-19', description: 'Fictional discharge instructions, recorded medicines and follow-up information.', summary: 'Discharge plan and follow-up date recorded.', sharedWithFamily: true, createdBy: 'u-vijay' },
  { id: 'r14', patientId: 'p8', title: 'Post-discharge observation', hospital: 'Marina Heart Institute', type: 'Clinical note', date: '2026-10-12', description: 'Demonstration observation note for the assigned emergency cardiology team.', summary: 'Recovery observations recorded for care-team review.', sharedWithFamily: false, createdBy: 'u-nisha' },
  { id: 'r15', patientId: 'p9', title: 'Lipid profile', hospital: 'Sanjeevani Multispeciality Hospital', type: 'Lab report', date: '2026-10-07', description: 'Fictional lipid profile values captured for an upcoming cardiology consultation.', summary: 'Lipid profile available for clinician review.', sharedWithFamily: false, createdBy: 'u-kiran' },
  { id: 'r16', patientId: 'p10', title: 'Shoulder rehabilitation plan', hospital: 'Sanjeevani Multispeciality Hospital', type: 'Care plan', date: '2026-10-06', description: 'Demonstration rehabilitation milestones and follow-up plan recorded by orthopaedics.', summary: 'Rehabilitation milestones recorded.', sharedWithFamily: false, createdBy: 'u-arjun' },
)

seedData.medications.push(
  { id: 'm4', patientId: 'p3', name: 'Metformin', instruction: '1 tablet', time: '08:00', note: 'With breakfast, as prescribed', status: 'taken' },
  { id: 'm5', patientId: 'p3', name: 'Metformin', instruction: '1 tablet', time: '20:00', note: 'With dinner, as prescribed', status: 'unconfirmed' },
  { id: 'm6', patientId: 'p4', name: 'Prescribed inhaler', instruction: '2 puffs', time: '07:30', note: 'Follow the existing prescription', status: 'taken' },
  { id: 'm7', patientId: 'p4', name: 'Antihistamine', instruction: '1 tablet', time: '20:30', note: 'As recorded by the clinician', status: 'unconfirmed' },
  { id: 'm8', patientId: 'p5', name: 'Folic acid', instruction: '1 tablet', time: '09:00', note: 'After breakfast', status: 'taken' },
  { id: 'm9', patientId: 'p5', name: 'Iron supplement', instruction: '1 tablet', time: '19:00', note: 'As prescribed', status: 'unconfirmed' },
  { id: 'm10', patientId: 'p6', name: 'Vitamin syrup', instruction: '5 ml', time: '08:30', note: 'Use the supplied measure', status: 'taken' },
  { id: 'm11', patientId: 'p7', name: 'Atorvastatin', instruction: '1 tablet', time: '21:00', note: 'After dinner', status: 'unconfirmed' },
  { id: 'm12', patientId: 'p7', name: 'Bisoprolol', instruction: '1 tablet', time: '08:00', note: 'As prescribed', status: 'taken' },
  { id: 'm13', patientId: 'p8', name: 'Clopidogrel', instruction: '1 tablet', time: '09:00', note: 'As prescribed on discharge', status: 'taken' },
  { id: 'm14', patientId: 'p8', name: 'Pantoprazole', instruction: '1 tablet', time: '07:00', note: 'Before breakfast', status: 'taken' },
  { id: 'm15', patientId: 'p9', name: 'Rosuvastatin', instruction: '1 tablet', time: '20:00', note: 'As prescribed', status: 'unconfirmed' },
  { id: 'm16', patientId: 'p9', name: 'Vitamin B12', instruction: '1 tablet', time: '09:00', note: 'After breakfast', status: 'taken' },
  { id: 'm17', patientId: 'p10', name: 'Calcium supplement', instruction: '1 tablet', time: '08:30', note: 'With food', status: 'taken' },
  { id: 'm18', patientId: 'p10', name: 'Topical pain-relief gel', instruction: 'Apply thin layer', time: '18:30', note: 'Use only as instructed', status: 'unconfirmed' },
)

seedData.careRequests.push(
  { id: 'c2', patientId: 'p3', text: 'Please call me after the appointment', priority: 'medium', status: 'pending', createdAt: '2026-10-14T08:00:00.000Z' },
  { id: 'c3', patientId: 'p4', text: 'I’m okay', priority: 'normal', status: 'acknowledged', createdAt: '2026-10-14T07:35:00.000Z', acknowledgedBy: 'u-sneha' },
  { id: 'c4', patientId: 'p5', text: 'Reached the hospital safely', priority: 'normal', status: 'acknowledged', createdAt: '2026-10-14T07:25:00.000Z', acknowledgedBy: 'u-anjali' },
  { id: 'c5', patientId: 'p7', text: 'Please call me', priority: 'medium', status: 'pending', createdAt: '2026-10-14T08:08:00.000Z' },
  { id: 'c6', patientId: 'p8', text: 'I’m okay', priority: 'normal', status: 'acknowledged', createdAt: '2026-10-13T18:05:00.000Z', acknowledgedBy: 'u-mohan' },
)

seedData.appointments.push(
  { id: 'a3', patientId: 'p3', doctorId: 'u-leela', hospitalId: 'h2', departmentId: 'd-community', date: '2026-10-14', time: '10:15', status: 'checked-in' },
  { id: 'a4', patientId: 'p4', doctorId: 'u-imran', hospitalId: 'h2', departmentId: 'd-pedia-clinic', date: '2026-10-14', time: '11:30', status: 'scheduled' },
  { id: 'a5', patientId: 'p5', doctorId: 'u-farah', hospitalId: 'h3', departmentId: 'd-women', date: '2026-10-14', time: '09:45', status: 'checked-in' },
  { id: 'a6', patientId: 'p6', doctorId: 'u-karthik', hospitalId: 'h3', departmentId: 'd-pedia', date: '2026-10-14', time: '12:00', status: 'scheduled' },
  { id: 'a7', patientId: 'p7', doctorId: 'u-adesh', hospitalId: 'h4', departmentId: 'd-heart', date: '2026-10-14', time: '10:40', status: 'checked-in' },
  { id: 'a8', patientId: 'p8', doctorId: 'u-nisha', hospitalId: 'h4', departmentId: 'd-heart-emergency', date: '2026-10-15', time: '09:20', status: 'scheduled' },
  { id: 'a9', patientId: 'p9', doctorId: 'u-meera', hospitalId: 'h1', departmentId: 'd-card', date: '2026-10-15', time: '14:15', status: 'scheduled' },
  { id: 'a10', patientId: 'p10', doctorId: 'u-arjun', hospitalId: 'h1', departmentId: 'd-ortho', date: '2026-10-16', time: '11:10', status: 'scheduled' },
)

seedData.notifications.push(
  { id: 'n-seed-4', message: 'Your community medicine token CCC-019 is active.', recipientIds: ['u-mahi','u-suresh'], page: 'queue', type: 'queue', createdAt: '2026-10-14T08:20:00.000Z', readBy: [] },
  { id: 'n-seed-5', message: 'Antenatal screening summary is ready to view.', recipientIds: ['u-divya','u-anjali'], page: 'records', type: 'record', createdAt: '2026-10-14T08:05:00.000Z', readBy: [] },
  { id: 'n-seed-6', message: 'Cardiology appointment checked in for Vijay.', recipientIds: ['u-vijay','u-rekha'], page: 'appointments', type: 'appointment', createdAt: '2026-10-14T08:02:00.000Z', readBy: [] },
  { id: 'n-seed-7', message: 'Rahul’s respiratory review is available.', recipientIds: ['u-rahul','u-sneha'], page: 'records', type: 'record', createdAt: '2026-10-14T07:58:00.000Z', readBy: [] },
)

seedData.hospitalAlerts = [
  { id: 'ha-demo-1', patientId: 'p1', hospitalId: 'h1', level: 2, reasons: ['repeated anxious language', 'requested a family check-in'], via: 'demo-companion', at: '2026-10-14T07:50:00.000Z', status: 'acknowledged' },
  { id: 'ha-demo-2', patientId: 'p3', hospitalId: 'h2', level: 3, reasons: ['panic phrase detected', 'patient did not answer follow-up'], via: 'demo-companion', at: '2026-10-14T08:04:00.000Z', status: 'new' },
  { id: 'ha-demo-3', patientId: 'p7', hospitalId: 'h4', level: 2, reasons: ['unusual distress signal'], via: 'demo-companion', at: '2026-10-14T08:11:00.000Z', status: 'new' },
]

seedData.companion = {
  p1: {
    profile: { companionName: 'Asha', memoryEnabled: true, memoryDays: 30, adaptiveTone: true, avoidRepetition: true, useRecordContext: true, sensorEscalationConsent: false, caregiverEscalationConsent: true, favouriteContactId: 'u-ravi', responseStyle: 'gentle' },
    moods: [{ mood: 'neutral', confidence: .86, level: 0, at: '2026-10-13T18:00:00.000Z' }, { mood: 'anxious', confidence: .78, level: 1, at: '2026-10-14T07:48:00.000Z' }],
    events: [{ id: 'evt-demo-1', kind: 'check-in', text: 'Morning wellbeing check completed', at: '2026-10-14T07:46:00.000Z' }],
    relayQueue: [],
    memory: [
      { id: 'mem-demo-1', role: 'patient', text: 'I feel worried before the appointment.', at: '2026-10-14T07:47:00.000Z' },
      { id: 'mem-demo-2', role: 'ai', text: 'That sounds difficult. I can stay with you and help you contact Ravi if you want.', at: '2026-10-14T07:47:10.000Z', feedback: 'helpful' },
    ],
    learning: { helpful: 4, poor: 1, anger: 0, repetitive: 1, corrected: 2 },
  },
}

export const floorPlans = {
  h1: {
    name: 'Sanjeevani — Main Building',
    nodes: {
      Entrance: { x: 65, y: 315, floor: 'G' }, Reception: { x: 180, y: 315, floor: 'G' }, Lift: { x: 300, y: 315, floor: 'G', type: 'lift' },
      Stairs: { x: 300, y: 225, floor: '1', type: 'stairs' }, Pharmacy: { x: 500, y: 315, floor: 'G' }, Diagnostics: { x: 500, y: 215, floor: '1' },
      Cardiology: { x: 500, y: 95, floor: '2' }, Emergency: { x: 115, y: 95, floor: 'G' }, Restrooms: { x: 300, y: 95, floor: '2' }, Orthopaedics: { x: 610, y: 215, floor: '1' },
    },
    edges: [['Entrance','Reception',1,true],['Reception','Lift',1,true],['Reception','Stairs',1,false],['Lift','Pharmacy',2,true],['Lift','Diagnostics',2,true],['Lift','Restrooms',2,true],['Stairs','Diagnostics',1,false],['Stairs','Cardiology',2,false],['Diagnostics','Cardiology',1,true],['Diagnostics','Orthopaedics',1,true],['Restrooms','Cardiology',2,true],['Reception','Emergency',2,true],['Emergency','Restrooms',2,true]],
  },
  h2: {
    name: 'CareBridge Clinic — Ground Floor',
    nodes: { Entrance:{x:80,y:280,floor:'G'}, Reception:{x:210,y:280,floor:'G'}, 'Family Medicine':{x:430,y:130,floor:'G'}, Pharmacy:{x:430,y:280,floor:'G'}, Restrooms:{x:210,y:130,floor:'G'} },
    edges: [['Entrance','Reception',1,true],['Reception','Family Medicine',2,true],['Reception','Pharmacy',1,true],['Reception','Restrooms',1,true]],
  },
  h3: {
    name: 'Lotus Women & Children — Main Wing',
    nodes: { Entrance:{x:70,y:315,floor:'G'}, Reception:{x:190,y:315,floor:'G'}, Lift:{x:310,y:315,floor:'G',type:'lift'}, Pharmacy:{x:510,y:315,floor:'G'}, 'Child Health':{x:510,y:205,floor:'1'}, 'Women’s Health':{x:510,y:95,floor:'2'}, 'Feeding Room':{x:310,y:95,floor:'1'}, Restrooms:{x:170,y:95,floor:'1'} },
    edges: [['Entrance','Reception',1,true],['Reception','Lift',1,true],['Lift','Pharmacy',1,true],['Lift','Child Health',1,true],['Child Health','Women’s Health',2,true],['Lift','Feeding Room',1,true],['Feeding Room','Restrooms',1,true]],
  },
  h4: {
    name: 'Marina Heart Institute — Cardiac Block',
    nodes: { Entrance:{x:65,y:315,floor:'G'}, Reception:{x:180,y:315,floor:'G'}, Emergency:{x:180,y:110,floor:'G'}, Lift:{x:320,y:315,floor:'G',type:'lift'}, Diagnostics:{x:500,y:220,floor:'2'}, Cardiology:{x:500,y:95,floor:'3'}, Pharmacy:{x:580,y:315,floor:'G'}, Stairs:{x:320,y:110,floor:'2',type:'stairs'} },
    edges: [['Entrance','Reception',1,true],['Reception','Emergency',1,true],['Reception','Lift',1,true],['Lift','Pharmacy',1,true],['Lift','Diagnostics',2,true],['Diagnostics','Cardiology',1,true],['Reception','Stairs',1,false],['Stairs','Cardiology',2,false]],
  },
}

export const roleLabels = { admin: 'Network admin', dean: 'Hospital dean', head: 'Department head', doctor: 'Specialist doctor', patient: 'Patient', family: 'Family caregiver' }

export const demoAccounts = [
  { role: 'admin', email: 'admin@carebridge.demo', label: 'Admin', hint: 'Hospitals & governance' },
  { role: 'dean', email: 'dean@sanjeevani.demo', label: 'Dean', hint: 'Hospital leadership' },
  { role: 'doctor', email: 'meera@sanjeevani.demo', label: 'Doctor', hint: 'Assigned patients' },
  { role: 'patient', email: 'ananya@carebridge.demo', label: 'Patient', hint: 'My care journey' },
  { role: 'family', email: 'ravi@carebridge.demo', label: 'Family', hint: 'Approved access only' },
]
