from flask import Flask, render_template, request, jsonify
import sqlite3
import os
import re
from datetime import datetime
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

app = Flask(__name__)
DB_PATH = "mira.db"

# ── Database setup ──────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS patients (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name   TEXT    NOT NULL,
                dob         TEXT    NOT NULL,
                email       TEXT    NOT NULL UNIQUE,
                glucose     REAL    NOT NULL,
                haemoglobin REAL    NOT NULL,
                cholesterol REAL    NOT NULL,
                remarks     TEXT    DEFAULT '',
                created_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
                updated_at  TEXT    DEFAULT CURRENT_TIMESTAMP
            )
        """)

init_db()

# ── Validation helpers ───────────────────────────────────────────
def validate_patient(data, updating=False):
    errors = []

    name = data.get("full_name", "").strip()
    if not name:
        errors.append("Full name is required.")

    dob = data.get("dob", "")
    if not dob:
        errors.append("Date of birth is required.")
    else:
        try:
            dob_dt = datetime.strptime(dob, "%Y-%m-%d")
            if dob_dt.date() >= datetime.today().date():
                errors.append("Date of birth cannot be today or a future date.")
        except ValueError:
            errors.append("Invalid date of birth format.")

    email = data.get("email", "").strip()
    if not email:
        errors.append("Email is required.")
    elif not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        errors.append("Invalid email address format.")

    for field, label, lo, hi in [
        ("glucose",     "Glucose",     0, 1000),
        ("haemoglobin", "Haemoglobin", 0, 30),
        ("cholesterol", "Cholesterol", 0, 1000),
    ]:
        val = data.get(field)
        if val is None or val == "":
            errors.append(f"{label} is required.")
        else:
            try:
                fval = float(val)
                if fval < lo or fval > hi:
                    errors.append(f"{label} must be between {lo} and {hi}.")
            except (ValueError, TypeError):
                errors.append(f"{label} must be a numeric value.")

    return errors

# ── AI Remarks via Gemini API ────────────────────────────────────
def generate_remarks(glucose, haemoglobin, cholesterol, dob):
    """Rule-based health remarks generator based on clinical reference ranges."""
    dob_dt = datetime.strptime(dob, "%Y-%m-%d")
    age = (datetime.today() - dob_dt).days // 365

    remarks = []

    # Glucose analysis
    glucose = float(glucose)
    if glucose < 70:
        remarks.append("Glucose is critically low (hypoglycaemia risk); immediate medical attention advised.")
    elif glucose < 100:
        remarks.append("Glucose level is within the normal fasting range.")
    elif glucose < 126:
        remarks.append("Glucose is in the pre-diabetic range (100–125 mg/dL); lifestyle changes recommended.")
    else:
        remarks.append("Glucose level is elevated, indicating possible diabetes mellitus; further evaluation required.")

    # Haemoglobin analysis
    haemoglobin = float(haemoglobin)
    if age >= 18:
        low_hb = 12.0
        high_hb = 17.5
    else:
        low_hb = 11.0
        high_hb = 16.0

    if haemoglobin < low_hb:
        remarks.append("Haemoglobin is below normal range, suggesting anaemia; dietary iron assessment recommended.")
    elif haemoglobin > high_hb:
        remarks.append("Haemoglobin is elevated above normal range; polycythaemia should be investigated.")
    else:
        remarks.append("Haemoglobin level is within the normal range.")

    # Cholesterol analysis
    cholesterol = float(cholesterol)
    if cholesterol < 200:
        remarks.append("Cholesterol is within the desirable range; cardiovascular risk is low.")
    elif cholesterol < 240:
        remarks.append("Cholesterol is borderline high (200–239 mg/dL); dietary modification and monitoring advised.")
    else:
        remarks.append("Cholesterol is high (≥240 mg/dL), indicating elevated cardiovascular risk; medical review recommended.")

    return " ".join(remarks)
# ── Routes ────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")

# LIST
@app.route("/api/patients", methods=["GET"])
def list_patients():
    search = request.args.get("q", "").strip()
    with get_db() as conn:
        if search:
            rows = conn.execute(
                "SELECT * FROM patients WHERE full_name LIKE ? OR email LIKE ? ORDER BY created_at DESC",
                (f"%{search}%", f"%{search}%"),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM patients ORDER BY created_at DESC").fetchall()
    return jsonify([dict(r) for r in rows])

# CREATE
@app.route("/api/patients", methods=["POST"])
def create_patient():
    data = request.json or {}
    errors = validate_patient(data)
    if errors:
        return jsonify({"errors": errors}), 400

    remarks = generate_remarks(
        data["glucose"], data["haemoglobin"], data["cholesterol"], data["dob"]
    )

    try:
        with get_db() as conn:
            cur = conn.execute(
                """INSERT INTO patients (full_name, dob, email, glucose, haemoglobin, cholesterol, remarks)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    data["full_name"].strip(),
                    data["dob"],
                    data["email"].strip().lower(),
                    float(data["glucose"]),
                    float(data["haemoglobin"]),
                    float(data["cholesterol"]),
                    remarks,
                ),
            )
            new_id = cur.lastrowid
            row = conn.execute("SELECT * FROM patients WHERE id=?", (new_id,)).fetchone()
        return jsonify(dict(row)), 201
    except sqlite3.IntegrityError:
        return jsonify({"errors": ["A patient with this email already exists."]}), 409

# READ ONE
@app.route("/api/patients/<int:pid>", methods=["GET"])
def get_patient(pid):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM patients WHERE id=?", (pid,)).fetchone()
    if not row:
        return jsonify({"error": "Patient not found."}), 404
    return jsonify(dict(row))

# UPDATE
@app.route("/api/patients/<int:pid>", methods=["PUT"])
def update_patient(pid):
    data = request.json or {}
    errors = validate_patient(data, updating=True)
    if errors:
        return jsonify({"errors": errors}), 400

    with get_db() as conn:
        existing = conn.execute("SELECT * FROM patients WHERE id=?", (pid,)).fetchone()
    if not existing:
        return jsonify({"error": "Patient not found."}), 404

    existing_dict = dict(existing)
    values_changed = (
        float(data["glucose"])     != existing_dict["glucose"] or
        float(data["haemoglobin"]) != existing_dict["haemoglobin"] or
        float(data["cholesterol"]) != existing_dict["cholesterol"] or
        data["dob"]               != existing_dict["dob"]
    )
    remarks = (
        generate_remarks(data["glucose"], data["haemoglobin"], data["cholesterol"], data["dob"])
        if values_changed
        else existing_dict["remarks"]
    )

    try:
        with get_db() as conn:
            conn.execute(
                """UPDATE patients SET full_name=?, dob=?, email=?, glucose=?,
                   haemoglobin=?, cholesterol=?, remarks=?, updated_at=CURRENT_TIMESTAMP
                   WHERE id=?""",
                (
                    data["full_name"].strip(),
                    data["dob"],
                    data["email"].strip().lower(),
                    float(data["glucose"]),
                    float(data["haemoglobin"]),
                    float(data["cholesterol"]),
                    remarks,
                    pid,
                ),
            )
            row = conn.execute("SELECT * FROM patients WHERE id=?", (pid,)).fetchone()
        return jsonify(dict(row))
    except sqlite3.IntegrityError:
        return jsonify({"errors": ["Another patient with this email already exists."]}), 409

# DELETE
@app.route("/api/patients/<int:pid>", methods=["DELETE"])
def delete_patient(pid):
    with get_db() as conn:
        row = conn.execute("SELECT id FROM patients WHERE id=?", (pid,)).fetchone()
        if not row:
            return jsonify({"error": "Patient not found."}), 404
        conn.execute("DELETE FROM patients WHERE id=?", (pid,))
    return jsonify({"message": "Patient deleted successfully."})

if __name__ == "__main__":
    app.run(debug=True, port=5000)