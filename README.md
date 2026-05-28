# MIRA – Medical Intelligence Robotic Automation

A health prediction application for managing patient blood test records with AI-powered clinical remarks.

## Tech Stack

- **Backend**: Python 3.10+ · Flask 3
- **Frontend**: Vanilla HTML / CSS / JavaScript (no build step required)
- **Database**: SQLite (via Python's built-in `sqlite3`)
- **AI/ML API**: Anthropic Claude (`claude-sonnet-4-20250514`) — generates clinical health remarks from blood values

## Features

- ✅ Full **CRUD** — Create, Read, Update, Delete patient records
- 🤖 **AI Remarks** — Claude analyses Glucose, Haemoglobin & Cholesterol and returns a concise clinical summary
- 🔴 **Risk Badges** — Colour-coded indicators for borderline/concerning values
- 🔍 **Live Search** — Filter by patient name or email in real time
- ✔️ **Input Validation** — Both client-side (JS) and server-side (Python)
- 💾 **Persistent Storage** — SQLite database auto-created on first run

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/mira-health.git
cd mira-health
```

### 2. Create a virtual environment
```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure environment variables
```bash
cp .env.example .env
# Edit .env and add your Anthropic API key
```

### 5. Run the app
```bash
python app.py
```

Open http://localhost:5000 in your browser.

## Project Structure

```
mira-health/
├── app.py                  # Flask backend — routes, validation, AI integration
├── requirements.txt
├── .env.example            # Template for secrets (never commit .env)
├── .gitignore
├── templates/
│   └── index.html          # Single-page frontend
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── app.js          # CRUD logic, form handling, table rendering
```

## Blood Test Reference Ranges Used

| Marker       | Normal         | Borderline        | Concerning   |
|--------------|----------------|-------------------|--------------|
| Glucose      | < 100 mg/dL    | 100–125 mg/dL     | ≥ 126 mg/dL  |
| Haemoglobin  | ≥ 12 g/dL      | 7–11.9 g/dL       | < 7 g/dL     |
| Cholesterol  | < 200 mg/dL    | 200–239 mg/dL     | ≥ 240 mg/dL  |
