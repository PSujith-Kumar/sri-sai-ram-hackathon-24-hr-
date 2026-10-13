# CareBridge 3.0

CareBridge is a connected, multi-hospital healthcare-assistance prototype created for the Sairam VERDICT hackathon. The React application gives network administrators, hospital deans, department heads, specialist doctors, patients, and approved family caregivers separate role-based workspaces backed by one shared demonstration data model.

## Features

- Multi-hospital administration and hospital switching.
- Hospital hierarchy from network admin to dean, department heads and specialist doctors.
- Relationship-scoped patient access: patients see themselves, doctors see assigned patients, and family members see only approved relatives.
- **QueueCare:** Shared queue state across doctor, patient and family dashboards.
- **CareClue:** Fictional test hospitals with shortest-path and wheelchair-accessible routing.
- **HealthStory:** Patient-controlled medical-record timeline with family sharing controls.
- **CareCircle:** Patient check-ins and caregiver acknowledgements.
- **MedMinder:** Medication schedules and dose status based on existing instructions.
- Printable visit summaries and responsive mobile layouts.

## Demo accounts

All accounts use password `care123`.

| Role | Email |
|---|---|
| Network admin | `admin@carebridge.demo` |
| Hospital dean | `dean@sanjeevani.demo` |
| Specialist doctor | `meera@sanjeevani.demo` |
| Patient | `ananya@carebridge.demo` |
| Approved family caregiver | `ravi@carebridge.demo` |

## Run locally

Install dependencies and start Vite:

```powershell
npm install
npm run dev
```

On Windows, double-click `start.bat`. It checks for Node.js and npm, installs dependencies when necessary, starts Vite, and opens the application in the default browser.

Create a production build with `npm run build`.

## Data and safety

This repository is a hackathon demonstration using fictional hospitals and patients. Login and application changes are stored in browser local storage. Role and relationship checks demonstrate intended authorization behavior, but production deployment requires a secure backend, hashed credentials, server-side authorization, audit logs and encrypted medical storage.

Queue times are estimates. Medication schedules are entered by the user and do not change clinical instructions. MindMate entries remain private to the browser unless the user exports or shares them independently.

## Deployment

Private preview: <https://carebridge-sairam.chummy-tune-1523.chatgpt.site>

The deployable Vite output is generated in `dist/`.
