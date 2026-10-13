# CareBridge

CareBridge is an integrated healthcare-assistance prototype created for the Sairam VERDICT 24-hour hackathon. It connects hospital queue tracking, indoor navigation, personal health-record organization, caregiver coordination, medication schedules, well-being reflection, and low-data access in one responsive web application.

## Features

- **QueueCare:** Digital tokens, live queue progress, rolling wait estimates, and staff controls.
- **CareClue:** Shortest-path hospital navigation with wheelchair-accessible routing.
- **HealthStory:** Searchable medical-record timeline with optional local document attachments.
- **CareCircle:** Patient check-ins, assistance requests, caregiver acknowledgements, permissions, and patient-controlled camera access.
- **MedMinder:** Medication schedule and dose-status history based on user-entered prescriptions.
- **MindMate:** Private mood check-ins, a seven-day chart, and personal journaling.
- **Low-data access:** A USSD-style simulator that reads the same queue state as QueueCare.
- Patient, caregiver, and hospital-staff demonstration roles.

## Run locally

The prototype is buildless and has no package dependencies.

```powershell
py -3 -m http.server 4173 --directory dist
```

Open `http://127.0.0.1:4173` in a modern browser.

## Data and safety

This repository is a hackathon demonstration using fictional hospital data. Application changes are stored in browser local storage. It is not a production medical system, diagnostic tool, prescribing service, verified hospital map, or live telecom USSD integration.

Queue times are estimates. Medication schedules are entered by the user and do not change clinical instructions. MindMate entries remain private to the browser unless the user exports or shares them independently.

## Deployment

Private preview: <https://carebridge-sairam.chummy-tune-1523.chatgpt.site>

The deployable static files are in `dist/`.
