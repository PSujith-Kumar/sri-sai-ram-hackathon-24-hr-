# CareBridge 3.0

CareBridge is a connected, multi-hospital healthcare-assistance prototype created for the Sairam VERDICT hackathon. The React application gives network administrators, hospital deans, department heads, specialist doctors, patients, and approved family caregivers separate role-based workspaces backed by one shared demonstration data model.

## Features

- Multi-hospital administration and hospital switching.
- Hospital hierarchy from network admin to dean, department heads and specialist doctors.
- Relationship-scoped patient access: patients see themselves, doctors see assigned patients, and family members see only approved relatives.
- **QueueCare:** Shared queue state across doctor, patient and family dashboards.
- **ClinicCompass:** Fictional test hospitals with shortest-path and wheelchair-accessible routing.
- **HealthStory:** Patient-controlled medical-record timeline with family sharing controls.
- **CareCircle:** Patient check-ins and caregiver acknowledgements.
- **MedMinder:** Medication schedules and dose status based on existing instructions.
- Printable visit summaries and responsive mobile layouts.
- **AI Companion:** Patient-specific voice/chat support, non-diagnostic wellbeing signals, report-aware responses and medication/queue assistance.
- **Adaptive safety settings:** 30-day browser memory, repeat avoidance, patient feedback replay, favourite-contact escalation and explicit thermal/CCTV consent.
- **Emergency card:** User-confirmed call actions for India emergency `112` and Tele-MANAS `14416`, with a prepared medical briefing for approved contacts.

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

## Phones (thermal + camera)

Two phones can watch over USB tethering: a thermal phone that is always on (heat shapes only) and a camera phone that switches on only when the AI hears a change in the patient's voice or sees something unusual, then Gemma 3 looks at the picture. See [PHONE_SETUP.md](PHONE_SETUP.md). Try it without phones: `npm run phones:simulate`.

## Data and safety

This repository is a hackathon demonstration using fictional hospitals and patients. Login and application changes are stored in browser local storage. Role and relationship checks demonstrate intended authorization behavior, but production deployment requires a secure backend, hashed credentials, server-side authorization, audit logs and encrypted medical storage.

Queue times are estimates. Medication schedules are entered by the user and do not change clinical instructions. MindMate entries remain private to the browser unless the user exports or shares them independently.

AI conversation and mood indicators are supportive, non-diagnostic signals. Chat memory expires after 30 days and can be disabled or cleared from the patient settings page. Thermal monitoring starts only after an unanswered check-in when the patient has opted in; CCTV requires an abnormal thermal event. Browsers cannot silently complete phone/USSD calls, so every real call or text remains user-confirmed. The `*123*…#` path is a fictional hospital relay for testing, not a national emergency number.

## Deployment

Live preview: <https://carebridge-sairam-live.glossyharp64.chatgpt.site/>

The deployable Vite output is generated in `dist/`.
