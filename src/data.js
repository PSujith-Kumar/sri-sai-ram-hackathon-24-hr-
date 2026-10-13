export const DEMO_PASSWORD = 'care123'

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
    { id: 'u-meera', name: 'Dr. Meera Shah', email: 'meera@sanjeevani.demo', role: 'doctor', title: 'Consultant Cardiologist', hospitalIds: ['h1'], departmentId: 'd-card', specialization: 'Interventional Cardiology', initials: 'MS' },
    { id: 'u-arjun', name: 'Dr. Arjun Rao', email: 'arjun@sanjeevani.demo', role: 'doctor', title: 'Orthopaedic Specialist', hospitalIds: ['h1'], departmentId: 'd-ortho', specialization: 'Joint Care', initials: 'AR' },
    { id: 'u-ananya', name: 'Ananya Kumar', email: 'ananya@carebridge.demo', role: 'patient', title: 'Patient', hospitalIds: ['h1'], patientId: 'p1', initials: 'AK' },
    { id: 'u-ravi', name: 'Ravi Kumar', email: 'ravi@carebridge.demo', role: 'family', title: 'Approved family caregiver', hospitalIds: ['h1'], initials: 'RK' },
    { id: 'u-priya', name: 'Priya Nair', email: 'priya@carebridge.demo', role: 'patient', title: 'Patient', hospitalIds: ['h1'], patientId: 'p2', initials: 'PN' },
  ],
  patients: [
    { id: 'p1', userId: 'u-ananya', hospitalId: 'h1', mrn: 'SMH-20481', dob: '2004-03-17', bloodGroup: 'B+', doctorIds: ['u-meera'], familyLinks: [{ userId: 'u-ravi', relationship: 'Father', status: 'approved', permissions: ['queue','medications','care','records'] }], allergies: ['Penicillin'], conditions: ['Hypertension monitoring'] },
    { id: 'p2', userId: 'u-priya', hospitalId: 'h1', mrn: 'SMH-20496', dob: '1998-11-02', bloodGroup: 'O+', doctorIds: ['u-arjun'], familyLinks: [], allergies: [], conditions: ['Knee rehabilitation'] },
  ],
  queues: [
    { id: 'q1', hospitalId: 'h1', departmentId: 'd-card', doctorId: 'u-meera', serving: 20, lastIssued: 28, avgMinutes: 5, paused: false, updatedAt: '2026-10-13T15:55:00.000Z' },
    { id: 'q2', hospitalId: 'h1', departmentId: 'd-ortho', doctorId: 'u-arjun', serving: 8, lastIssued: 14, avgMinutes: 7, paused: false, updatedAt: '2026-10-13T15:52:00.000Z' },
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
    { id: 'a1', patientId: 'p1', doctorId: 'u-meera', hospitalId: 'h1', departmentId: 'd-card', date: '2026-10-13', time: '16:30', status: 'checked-in' },
    { id: 'a2', patientId: 'p2', doctorId: 'u-arjun', hospitalId: 'h1', departmentId: 'd-ortho', date: '2026-10-14', time: '10:00', status: 'scheduled' },
  ],
  notifications: [
    { id: 'n-seed-1', message: 'Complete blood count was shared with your family caregiver.', recipientIds: ['u-ananya'], page: 'records', type: 'record', createdAt: '2026-10-13T15:48:00.000Z', readBy: [] },
    { id: 'n-seed-2', message: 'Ananya shared a health report with you.', recipientIds: ['u-ravi'], page: 'records', type: 'record', createdAt: '2026-10-13T15:48:00.000Z', readBy: [] },
    { id: 'n-seed-3', message: 'Cardiology queue is live and currently serving CAR-020.', recipientIds: ['u-ananya', 'u-ravi'], page: 'queue', type: 'queue', createdAt: '2026-10-13T15:55:00.000Z', readBy: [] },
  ],
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
}

export const roleLabels = { admin: 'Network admin', dean: 'Hospital dean', head: 'Department head', doctor: 'Specialist doctor', patient: 'Patient', family: 'Family caregiver' }

export const demoAccounts = [
  { role: 'admin', email: 'admin@carebridge.demo', label: 'Admin', hint: 'Hospitals & governance' },
  { role: 'dean', email: 'dean@sanjeevani.demo', label: 'Dean', hint: 'Hospital leadership' },
  { role: 'doctor', email: 'meera@sanjeevani.demo', label: 'Doctor', hint: 'Assigned patients' },
  { role: 'patient', email: 'ananya@carebridge.demo', label: 'Patient', hint: 'My care journey' },
  { role: 'family', email: 'ravi@carebridge.demo', label: 'Family', hint: 'Approved access only' },
]
