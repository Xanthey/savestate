# SaveState v2
### Contact Intelligence System · Belmont Laboratories

> *Built for the grind, tuned for the arcade.*

SaveState is a self-hosted, session-aware customer support CRM designed for speed and adaptability. It runs on a PHP + MySQL backend with a glassmorphic frontend, and is fully configurable for any support workflow via a single `company.conf` file — no code changes required.

---

## Features

| Feature | Description |
|---|---|
| 🎮 **Arcade Mode** | RPG leveling, XP, combos, 8-bit typing sounds, buff/debuff system |
| 🧪 **Laboratory Mode** | Belmont Labs mad-science aesthetic and verbiage |
| 📋 **Business Mode** | Clean, distraction-free, all signal |
| 🔍 **Fuzzy Search** | Live ticket + known issue matching as you type |
| ⚠️ **Heads Up Alerts** | Known issue overlay surfaced while entering ticket notes |
| 🏛️ **Vault Browser** | Full-text search and browsing across all ticket history |
| 🔁 **Returning Customer Detection** | Auto-detects repeat contacts by ticket number and pre-fills fields |
| 📦 **Bulk Import** | JSON vault import via chunked upload |
| 🎨 **14 Themes** | Dark, Light, Amber Terminal, Win16, FF6, Castlevania, TMNT, Metroid, Synthwave, Cyberpunk, and more |
| 👤 **Multi-User** | Separate vaults, XP, and preferences per user |

---

## Tech Stack

- **Backend:** PHP 8.2, MySQL 8.0
- **Frontend:** Vanilla JS / CSS, Web Audio API
- **Deployment:** Docker Compose

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### 1. Clone the repo

```bash
git clone https://github.com/xanthey/savestate.git
cd savestate
```

### 2. Configure your organization

Copy the example config and edit it to match your workflow:

```bash
cp company.conf.example company.conf
```

Open `company.conf` and update the company name, support URL, field labels, dropdown options, and default theme to suit your team. This is the only file you need to touch.

### 3. Set your passwords

Open `docker-compose.yml` and change the three placeholder passwords before running:

```yaml
SS_DB_PASS:          savestatepass   # ← change this
MYSQL_ROOT_PASSWORD: rootpassword    # ← change this
MYSQL_PASSWORD:      savestatepass   # ← match SS_DB_PASS
```

### 4. Build and start

```bash
docker compose up -d --build
```

The first build will take a minute or two. Once running, open:

```
http://localhost:5473
```

### 5. Complete setup

On first launch the setup wizard will initialize the database and create your admin account. After that, additional users can be added from the profile settings.

---

## Configuration Reference

All organization-specific behavior lives in `company.conf`. The full structure:

```jsonc
{
  "company_name": "Your Company",
  "app_title": "SaveState",
  "app_subtitle": "Contact Intelligence System",
  "support_url": "https://help.yourcompany.com",
  "logo_text": "SS",

  "fields": {
    "ticket_label": "Ticket #",
    "ticket_placeholder": "e.g., 123456",
    "location_label": "Location",
    "location_placeholder": "Country / Region",
    "notes_label": "Notes",
    "notes_placeholder": "Enter case notes here..."
  },

  "dropdowns": {
    "reason_for_contact": {
      "label": "Reason for Contact",
      "options": ["Option A", "Option B", "..."]
    }
  },

  "checkboxes": [
    { "id": "obtained_info", "label": "Obtained Info", "default": false }
  ],

  "solved_field": { "label": "Solved", "id": "solved" },

  "themes": {
    "default": "dark",
    "available": [ ... ]
  }
}
```

See `company.conf.example` for the full working example.

---

## Repo Structure

```
savestate/               ← PHP web app (baked into the web image at build time)
  ├── api/               ← REST API endpoints
  ├── assets/
  │   ├── css/           ← Core, layout, and component stylesheets
  │   ├── js/            ← Common, RPG, vault, entries, themes, modes, etc.
  │   └── img/           ← SVG icons and favicons
  └── *.php              ← Page templates
schema.sql               ← Database schema (auto-loaded on first DB container start)
company.conf.example     ← Starter config — copy to company.conf and edit
Dockerfile               ← Web image build
Dockerfile.db            ← DB image build
docker-compose.yml       ← Bring everything up
belmont-known-issues.csv ← Example known issues data for import
```

---

## Importing Example Data

`belmont-known-issues.csv` contains a set of example known issues you can import into the Heads Up system to see it in action. From the Tools page, use the Known Issues import to load it.

---

## Personality Modes

SaveState ships with three distinct UI personalities, switchable per user from the Settings page:

**🎮 Arcade** — The app becomes an RPG. Log tickets to earn XP, level up, chain word combos, trigger buffs, and collect badges. 8-bit typing sounds powered by the Web Audio API. Your vault is your save file.

**🧪 Laboratory** — Belmont Laboratories aesthetic. Everything is an experiment. Beakers, clinical precision, mad-science verbiage.

**📋 Business** — No theatrics. Just the information you need, presented cleanly.

---

## Useful Commands

```bash
# Start (rebuild on code changes)
docker compose up -d --build

# Stop
docker compose down

# View logs
docker compose logs -f web
docker compose logs -f db

# Wipe data and start fresh (destructive)
docker compose down -v
docker compose up -d --build
```

---

## License

MIT

---

*Belmont Laboratories · Contact Intelligence Division*
