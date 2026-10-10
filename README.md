# MedStay — Complete Full-Stack Project

A local full-stack prototype for hospital-bed discovery, patient booking, and hospital/clinic/medical-shop owner registration.

## Stack
- Frontend: HTML/CSS/vanilla JavaScript
- Backend: Node.js + Express
- Storage: JSON file (`data/db.json`) for demo purposes

## Run
1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

## Demo accounts
Patient: `patient@medstay.demo` / `patient123`
Owner: `owner@medstay.demo` / `owner123`

## Main features
- Search and filter hospitals.
- View room types, prices and available beds.
- Patient accounts and booking history.
- Owner accounts and facility registration.
- Owner facility dashboard.
- Bed inventory editing.
- Owner incoming bookings.
- Backend booking transaction reduces available bed count.
- Hospital verification now uses seven hospital-specific documents only: Establishment License, Fire Safety Certificate, Bio-Medical Waste Management Authorization, Pollution Control Board NOC, Radiation Safety Clearance, Narcotics & Pharmacy Licenses, and Blood Bank License (when applicable). These checks are shown and required only for hospitals; clinics, medical shops, and other facility types do not use them.
- Admin can review and approve or reject facilities. Hospital submissions display the seven hospital verification documents; non-hospital facility types do not display those hospital-specific checks.
- Verification status is displayed for facilities.
- **MedStay Lifeline**: Discovery and coordination portal for regional blood availability, blood bank directory, and NOTTO-accredited organ transplant institution network. Includes independent blood group and component filtering, explicit freshness tracking (Recently Confirmed, Aging, Stale, Unknown), and authorized stock telemetry management with audit trail.
- **MedStay Critical Resource Radar**: Regional monitoring and shortage-awareness dashboard for authorized coordinators. Integrates live hospital bed inventory, blood reserves by component, oxygen plant status (LMO & cylinders), and critical equipment (ventilators, monitors). Implements rules-based shortage alerts with cross-resource mutual aid recommendations, coordinator event logs (acknowledgement, coordination notes, resolution), and configurable alert thresholds.

## API
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/hospitals`
- `GET /api/hospitals/:id`
- `POST /api/facilities` (owner)
- `GET /api/owner/facility` (owner)
- `PATCH /api/owner/facility/rooms` (owner)
- `GET /api/owner/bookings` (owner)
- `POST /api/bookings` (patient)
- `GET /api/patient/bookings` (patient)
- `GET /api/bookings/:reference` (authenticated)
- `GET /api/meta`
- `GET /api/lifeline/meta`
- `GET /api/lifeline/blood-banks`
- `GET /api/lifeline/blood-banks/:id`
- `GET /api/lifeline/blood-stock`
- `GET /api/lifeline/transplant-centres`
- `POST /api/lifeline/blood-stock` (authorized stock update)
- `GET /api/lifeline/audit`
- `GET /api/resource-radar/summary`
- `GET /api/resource-radar/resources`
- `GET /api/resource-radar/alerts`
- `PATCH /api/resource-radar/alerts/:id/acknowledge`
- `POST /api/resource-radar/alerts/:id/notes`
- `PATCH /api/resource-radar/alerts/:id/resolve`
- `GET /api/resource-radar/config`
- `PATCH /api/resource-radar/config`
- `POST /api/resource-radar/resources`

## Production note
This is a complete runnable prototype, not a production medical-record system. For deployment, replace JSON storage with PostgreSQL/MySQL, use secure password hashing (Argon2/bcrypt), signed/expiring sessions or JWT with rotation, HTTPS, validation/rate limiting, audit logs, encrypted sensitive data, real owner verification workflows, payment integration, backups, monitoring, and appropriate privacy/security controls.


## Janvani — Feedback & Complaint Feature (Integrated)

Janvani is integrated into the MedStay navigation and existing Express/JSON database.

### Included
- Patient-only submission form for feedback, complaints, suggestions, facility/booking issues, staff behaviour, cleanliness and billing.
- Server-side validation and a unique tracking ID for every submission.
- Patient submission history and status tracking.
- Admin review panel with status changes (`Submitted`, `Under review`, `Resolved`, `Rejected`) and a response visible to the patient.
- Data stored in `data/db.json` under `JanvaniFeedback`; existing MedStay data is retained.

### Run it
1. Unzip this project.
2. Open the `MedStay-Janvani-Integrated` folder in VS Code.
3. Open Terminal → New Terminal.
4. Run `npm install` if dependencies are not installed.
5. Run `npm start`.
6. Open `http://localhost:3000`.
7. Log in as the demo patient (`patient@medstay.demo` / `patient123`) and choose **Janvani** in the top navigation.
8. To review submissions, log out and log in as the demo admin (`admin@medstay.demo` / `admin123`), then choose **Janvani**.

### API added
- `POST /api/Janvani` — authenticated patient creates a submission.
- `GET /api/Janvani` — patient sees only their own submissions; admin sees all.
- `PATCH /api/Janvani/:id` — admin updates status and optional response.

### Important
This is a hackathon/demo implementation using JSON-file storage, not a production complaint-management service. Before real deployment, add rate limiting, stronger session/authentication controls, data-retention rules, privacy notices, and an escalation process for urgent complaints. Janvani is not an emergency channel; users should contact local emergency services or the facility directly for urgent care.
