/* ── MIRA – app.js ──────────────────────────────────────────── */
'use strict';

// ── State ─────────────────────────────────────────────────────
let patients   = [];
let deleteId   = null;
let searchTimer = null;

// ── DOM refs ──────────────────────────────────────────────────
const tableBody       = document.getElementById('tableBody');
const modalOverlay    = document.getElementById('modalOverlay');
const patientForm     = document.getElementById('patientForm');
const modalTitle      = document.getElementById('modalTitle');
const patientIdInput  = document.getElementById('patientId');
const formErrors      = document.getElementById('formErrors');
const aiNotice        = document.getElementById('aiNotice');
const aiLoading       = document.getElementById('aiLoading');
const submitBtn       = document.getElementById('submitBtn');
const searchInput     = document.getElementById('searchInput');
const remarksOverlay  = document.getElementById('remarksOverlay');
const remarksBody     = document.getElementById('remarksBody');
const deleteOverlay   = document.getElementById('deleteOverlay');
const deleteName      = document.getElementById('deleteName');

// ── API helpers ───────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

// ── Fetch & render patients ────────────────────────────────────
async function loadPatients(q = '') {
  try {
    const url = q ? `/api/patients?q=${encodeURIComponent(q)}` : '/api/patients';
    patients = await api('GET', url);
    renderTable();
    updateStats();
  } catch (e) {
    console.error(e);
    tableBody.innerHTML = '<tr><td colspan="9" class="empty-row">Failed to load patients.</td></tr>';
  }
}

function renderTable() {
  if (!patients.length) {
    tableBody.innerHTML = '<tr><td colspan="9" class="empty-row">No patients found. Click <strong>+ Add Patient</strong> to begin.</td></tr>';
    return;
  }
  tableBody.innerHTML = patients.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <div class="patient-name">${esc(p.full_name)}</div>
        <div class="patient-email">${esc(p.email)}</div>
      </td>
      <td>${formatDob(p.dob)}</td>
      <td>${esc(p.email)}</td>
      <td>${riskBadge('glucose', p.glucose)}</td>
      <td>${riskBadge('haemoglobin', p.haemoglobin)}</td>
      <td>${riskBadge('cholesterol', p.cholesterol)}</td>
      <td class="remarks-cell" title="${esc(p.remarks)}" onclick="viewRemarks(${p.id})">
        ${p.remarks ? esc(p.remarks) : '<span style="color:var(--text-3)">—</span>'}
      </td>
      <td class="actions-cell">
        <button class="btn-icon view" onclick="viewRemarks(${p.id})" title="View Remarks">👁</button>
        <button class="btn-icon edit" onclick="openEdit(${p.id})" title="Edit">✎</button>
        <button class="btn-icon del"  onclick="openDelete(${p.id})" title="Delete">🗑</button>
      </td>
    </tr>
  `).join('');
}

function riskBadge(field, val) {
  let cls = 'badge-normal', label = val;
  const n = parseFloat(val);
  if (field === 'glucose') {
    if (n >= 126)     { cls = 'badge-alert'; label = `${n} ↑`; }
    else if (n >= 100){ cls = 'badge-warn';  label = `${n} ~`; }
  } else if (field === 'haemoglobin') {
    if (n < 7)        { cls = 'badge-alert'; label = `${n} ↓`; }
    else if (n < 12)  { cls = 'badge-warn';  label = `${n} ~`; }
  } else if (field === 'cholesterol') {
    if (n >= 240)     { cls = 'badge-alert'; label = `${n} ↑`; }
    else if (n >= 200){ cls = 'badge-warn';  label = `${n} ~`; }
  }
  return `<span class="badge ${cls}">${label}</span>`;
}

function updateStats() {
  document.getElementById('statTotal').textContent = patients.length;
  const today = new Date().toISOString().slice(0, 10);
  const addedToday = patients.filter(p => p.created_at && p.created_at.startsWith(today)).length;
  document.getElementById('statToday').textContent = addedToday;
  const flagged = patients.filter(p =>
    parseFloat(p.glucose) >= 126 ||
    parseFloat(p.haemoglobin) < 7 ||
    parseFloat(p.cholesterol) >= 240
  ).length;
  document.getElementById('statFlagged').textContent = flagged;
}

function formatDob(dob) {
  if (!dob) return '—';
  const d = new Date(dob + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Search ────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadPatients(searchInput.value.trim()), 300);
});

// ── Modal helpers ─────────────────────────────────────────────
function openModal() { modalOverlay.classList.add('open'); }
function closeModal() {
  modalOverlay.classList.remove('open');
  patientForm.reset();
  patientIdInput.value = '';
  clearErrors();
  aiNotice.style.display = '';
  aiLoading.style.display = 'none';
  submitBtn.disabled = false;
  submitBtn.textContent = 'Save Patient';
}

document.getElementById('openAddModal').addEventListener('click', () => {
  modalTitle.textContent = 'Add Patient';
  openModal();
});
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelModal').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

// ── Edit ──────────────────────────────────────────────────────
function openEdit(id) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  modalTitle.textContent = 'Edit Patient';
  patientIdInput.value = p.id;
  document.getElementById('full_name').value   = p.full_name;
  document.getElementById('dob').value         = p.dob;
  document.getElementById('email').value       = p.email;
  document.getElementById('glucose').value     = p.glucose;
  document.getElementById('haemoglobin').value = p.haemoglobin;
  document.getElementById('cholesterol').value = p.cholesterol;
  openModal();
}

// ── View Remarks ──────────────────────────────────────────────
function viewRemarks(id) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  remarksBody.innerHTML = `
    <p><strong>${esc(p.full_name)}</strong> — ${formatDob(p.dob)}</p>
    <hr style="margin:10px 0;border:none;border-top:1px solid var(--border)"/>
    <p>${p.remarks ? esc(p.remarks) : '<em>No remarks available.</em>'}</p>
  `;
  remarksOverlay.classList.add('open');
}
document.getElementById('closeRemarks').addEventListener('click', () => remarksOverlay.classList.remove('open'));
document.getElementById('closeRemarksBtn').addEventListener('click', () => remarksOverlay.classList.remove('open'));
remarksOverlay.addEventListener('click', e => { if (e.target === remarksOverlay) remarksOverlay.classList.remove('open'); });

// ── Delete ────────────────────────────────────────────────────
function openDelete(id) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  deleteId = id;
  deleteName.textContent = p.full_name;
  deleteOverlay.classList.add('open');
}
document.getElementById('closeDelete').addEventListener('click', () => deleteOverlay.classList.remove('open'));
document.getElementById('cancelDelete').addEventListener('click', () => deleteOverlay.classList.remove('open'));
deleteOverlay.addEventListener('click', e => { if (e.target === deleteOverlay) deleteOverlay.classList.remove('open'); });

document.getElementById('confirmDelete').addEventListener('click', async () => {
  if (!deleteId) return;
  try {
    await api('DELETE', `/api/patients/${deleteId}`);
    deleteOverlay.classList.remove('open');
    toast('Patient deleted.', 'success');
    loadPatients(searchInput.value.trim());
  } catch (e) {
    toast('Failed to delete patient.', 'error');
  }
  deleteId = null;
});

// ── Form Submit ───────────────────────────────────────────────
patientForm.addEventListener('submit', async e => {
  e.preventDefault();
  clearErrors();

  const id = patientIdInput.value;
  const body = {
    full_name:   document.getElementById('full_name').value.trim(),
    dob:         document.getElementById('dob').value,
    email:       document.getElementById('email').value.trim(),
    glucose:     document.getElementById('glucose').value,
    haemoglobin: document.getElementById('haemoglobin').value,
    cholesterol: document.getElementById('cholesterol').value,
  };

  // Client-side quick checks
  const clientErrors = clientValidate(body);
  if (clientErrors.length) {
    showErrors(clientErrors);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';
  aiNotice.style.display = 'none';
  aiLoading.style.display = 'flex';

  try {
    const method = id ? 'PUT' : 'POST';
    const url    = id ? `/api/patients/${id}` : '/api/patients';
    await api(method, url, body);
    closeModal();
    toast(id ? 'Patient updated.' : 'Patient added.', 'success');
    loadPatients(searchInput.value.trim());
  } catch (err) {
    aiLoading.style.display = 'none';
    aiNotice.style.display = '';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Patient';
    const errors = err.errors || [err.error || 'An unexpected error occurred.'];
    showErrors(errors);
  }
});

function clientValidate(d) {
  const errs = [];
  if (!d.full_name) errs.push('Full name is required.');
  if (!d.dob) {
    errs.push('Date of birth is required.');
  } else {
    const today = new Date(); today.setHours(0,0,0,0);
    if (new Date(d.dob) >= today) errs.push('Date of birth cannot be today or a future date.');
  }
  if (!d.email) errs.push('Email is required.');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errs.push('Invalid email address.');
  ['glucose','haemoglobin','cholesterol'].forEach(f => {
    if (!d[f] && d[f] !== 0) errs.push(`${f.charAt(0).toUpperCase()+f.slice(1)} is required.`);
    else if (isNaN(parseFloat(d[f]))) errs.push(`${f.charAt(0).toUpperCase()+f.slice(1)} must be numeric.`);
  });
  return errs;
}

function showErrors(errors) {
  formErrors.innerHTML = errors.map(e => `<div>• ${esc(e)}</div>`).join('');
  formErrors.classList.add('show');
}
function clearErrors() {
  formErrors.classList.remove('show');
  formErrors.innerHTML = '';
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Init ──────────────────────────────────────────────────────
loadPatients();
