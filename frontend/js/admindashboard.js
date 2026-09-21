let technicians = [];
const BASE_URL  = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://localhost:5000';

document.addEventListener('DOMContentLoaded', async () => {
    let user  = null;
    let token = null;

    try {
        user  = (typeof getUser === 'function') ? getUser() : JSON.parse(localStorage.getItem('user'));
        token = (typeof getToken === 'function') ? getToken() : localStorage.getItem('token');
    } catch (e) {
        user  = JSON.parse(localStorage.getItem('user'));
        token = localStorage.getItem('token');
    }

    if (!user || !token) {
        alert('Session expired. Redirecting to login...');
        window.location.href = 'login.html';
        return;
    }

    if (document.getElementById('adminName')) {
        document.getElementById('adminName').innerText = `Welcome ${user.name}`;
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (typeof logout === 'function') logout();
            else { localStorage.clear(); window.location.href = 'login.html'; }
        });
    }

    await loadTechnicians();
    await loadDashboard();
    await loadComplaints();
    await loadPendingVerification();
    await loadAttendance();
    await loadPendingVerification();
});

// ── Auth headers helper ───────────────────────────────────────────────────────
function authHeaders() {
    return {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type':  'application/json',
    };
}

// ── Dashboard counters ────────────────────────────────────────────────────────
async function loadDashboard() {
    try {
        const res  = await fetch(`${BASE_URL}/api/admin/dashboard`, { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();

        document.getElementById('totalComplaints').innerText    = data.totalComplaints    ?? 0;
        document.getElementById('pendingComplaints').innerText  = data.pendingComplaints  ?? 0;
        document.getElementById('resolvedComplaints').innerText = data.resolvedComplaints ?? 0;

        // Update the awaiting-verification badge if the element exists
        const awaitEl = document.getElementById('awaitingVerification');
        if (awaitEl) awaitEl.innerText = data.awaitingVerificationCount ?? 0;

    } catch (err) { console.error('loadDashboard error:', err); }
}

// ── Technicians list ──────────────────────────────────────────────────────────
async function loadTechnicians() {
    try {
        const res  = await fetch(`${BASE_URL}/api/admin/technicians`, { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        technicians = Array.isArray(data) ? data : [];
    } catch (err) { console.error('loadTechnicians error:', err); technicians = []; }
}

// ── All complaints table ──────────────────────────────────────────────────────
async function loadComplaints() {
    try {
        const res  = await fetch(`${BASE_URL}/api/admin/complaints`, { headers: authHeaders() });
        const data = res.ok ? await res.json() : { error: true, message: `Server ${res.status}` };
        renderTable(data);
    } catch (err) { renderTable({ error: true, message: 'Cannot connect to server.' }); }
}

function renderTable(rawData) {
    const table = document.getElementById('complaintsTable');
    if (!table) return;
    table.innerHTML = '';

    if (rawData && rawData.error) {
        table.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:25px;color:#dc2626;">⚠ ${rawData.message}</td></tr>`;
        return;
    }

    const complaints = Array.isArray(rawData) ? rawData : [];

    if (!complaints.length) {
        table.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;">No Complaints Found</td></tr>`;
        return;
    }

    complaints.forEach(c => {
        if (!c) return;

        const date         = c.created_at ? new Date(c.created_at).toLocaleDateString() : 'N/A';
        const ticketDisplay = c.ticket_number || `TCKT-${String(c.id).padStart(6, '0')}`;
        const assetDisplay  = c.subject || c.product || 'N/A';
        const clientName    = c.user_name || `User #${c.user_id || '?'}`;

        // Technician name from JOIN or fallback to local list
        let activeTechName = c.technician_name || 'Not Assigned';
        if (!c.technician_name && c.assigned_to) {
            const found = technicians.find(t => parseInt(t.id, 10) === parseInt(c.assigned_to, 10));
            if (found) activeTechName = found.name;
        }

        const statusKey = (c.status || 'pending').toLowerCase();

        // Build action cell based on status
        let actionCell;
        if (statusKey === 'closed') {
            actionCell = `<span style="color:green;font-weight:bold;">✓ Closed</span>`;
        } else if (statusKey === 'waiting for user verification') {
            // Technician has submitted resolution — now it's on the USER to respond.
            // Admin has nothing to do here yet.
            actionCell = `<span style="color:#b45309;font-weight:bold;">⏳ Awaiting User Response</span>`;
        } else if (statusKey === 'resolved') {
            // User responded YES (confirmed). Admin can now close with final remarks.
            actionCell = `
                <button class="close-btn" onclick="closeComplaint(${c.id})"
                    style="background:#10b981;color:white;border:none;padding:8px 14px;
                           border-radius:8px;cursor:pointer;font-weight:600;">
                    ✓ User Confirmed — Close
                </button>`;
        } else if (statusKey === 'reopened') {
            // User responded NO (rejected). Admin reassigns to the same/another technician.
            actionCell = `
                <select id="tech-${c.id}" style="padding:6px;border-radius:6px;margin-right:5px;border:1px solid #cbd5e1;">
                    <option value="">-- Reassign Technician --</option>
                    ${technicians.length === 0
                        ? `<option value="">No Technicians</option>`
                        : technicians.map(t => `<option value="${t.id}" ${parseInt(t.id,10)===parseInt(c.assigned_to,10) ? 'selected' : ''}>${t.name}</option>`).join('')
                    }
                </select>
                <button class="assign-btn" onclick="assignTechnician(${c.id})"
                    ${technicians.length === 0 ? 'disabled' : ''}
                    style="background:#ef4444;color:white;border:none;padding:8px 14px;
                           border-radius:8px;cursor:pointer;font-weight:600;">
                    Reassign
                </button>`;
        } else if (statusKey === 'assigned' || statusKey === 'accepted' || statusKey === 'in progress') {
            actionCell = `<span style="color:#2563eb;font-weight:bold;">${c.status}</span>`;
        } else {
            // Pending — show assign dropdown
            actionCell = `
                <select id="tech-${c.id}" style="padding:6px;border-radius:6px;margin-right:5px;border:1px solid #cbd5e1;">
                    <option value="">-- Select Technician --</option>
                    ${technicians.length === 0
                        ? `<option value="">No Technicians</option>`
                        : technicians.map(t => `<option value="${t.id}">${t.name}</option>`).join('')
                    }
                </select>
                <button class="assign-btn" onclick="assignTechnician(${c.id})"
                    ${technicians.length === 0 ? 'disabled' : ''}>Assign</button>`;
        }

        table.innerHTML += `
        <tr>
            <td>${ticketDisplay}</td>
            <td>${clientName}</td>
            <td>
                <strong>${assetDisplay}</strong>
                ${c.tech_remarks || c.technician_resolution
                    ? `<br><span style="font-size:11px;color:#10b981;display:block;margin-top:3px;">
                         <strong>Tech:</strong> ${c.tech_remarks || c.technician_resolution}</span>` : ''}
                ${c.user_verification_response !== null && c.user_verification_response !== undefined
                    ? `<br><span style="font-size:11px;display:block;margin-top:2px;color:${c.user_verification_response ? '#10b981' : '#dc2626'};">
                         <strong>User said:</strong> ${c.user_verification_response ? '✓ Yes, resolved' : '✗ No, not resolved'}
                         ${c.user_verification_remarks ? ` — "${c.user_verification_remarks}"` : ''}</span>` : ''}
                ${c.admin_closing_remarks || c.admin_remarks
                    ? `<br><span style="font-size:11px;color:#4f46e5;display:block;margin-top:2px;">
                         <strong>Closed:</strong> ${c.admin_closing_remarks || c.admin_remarks}</span>` : ''}
            </td>
            <td>
                <strong>${activeTechName}</strong>
                ${c.technician_phone ? `<br><span style="font-size:11px;color:#64748b;">${c.technician_phone}</span>` : ''}
            </td>
            <td><span class="status ${statusKey}">${c.status || 'Pending'}</span></td>
            <td>${date}</td>
            <td>${actionCell}</td>
        </tr>`;
    });
}

// ── Assign technician ─────────────────────────────────────────────────────────
async function assignTechnician(complaintId) {
    try {
        const selectEl = document.getElementById(`tech-${complaintId}`);
        if (!selectEl) return;

        const techId = selectEl.value;
        if (!techId) { alert('Please select a technician first.'); return; }

        const res  = await fetch(`${BASE_URL}/api/admin/assign/${complaintId}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ technician_id: techId }),
        });
        const data = await res.json();

        if (res.ok) {
            alert(data.message || 'Technician assigned successfully.');
            await loadComplaints();
            await loadDashboard();
        } else {
            alert(`Assignment failed: ${data.message}`);
        }
    } catch (err) { console.error('assignTechnician error:', err); }
}

// NOTE: The old "Verify with User" admin-side dialog has been removed.
// Verification is now submitted directly by the user from their own dashboard
// (PUT /api/complaints/:id/verify). The admin only sees the result — see
// renderTable() and loadPendingVerification() below.

// ── Close complaint with admin remarks ────────────────────────────────────────
function closeComplaint(id) {
    const modal     = document.getElementById('customRemarksModal');
    const title     = document.getElementById('modalTitle');
    const input     = document.getElementById('modalRemarksInput');
    const cancelBtn = document.getElementById('modalCancelBtn');
    const submitBtn = document.getElementById('modalSubmitBtn');

    title.innerText = 'Enter Final Closing Remarks';
    input.value     = '';
    modal.style.display = 'flex';

    cancelBtn.onclick = () => { modal.style.display = 'none'; };

    submitBtn.onclick = async () => {
        const remarks = input.value.trim();
        if (!remarks) { alert('Closing remarks are required.'); return; }
        modal.style.display = 'none';

        try {
            const res  = await fetch(`${BASE_URL}/api/admin/close/${id}`, {
                method:  'PUT',
                headers: authHeaders(),
                body:    JSON.stringify({ remarks }),
            });
            const data = await res.json();

            if (res.ok) {
                alert(data.message || 'Complaint closed successfully.');
            } else {
                alert(`Error: ${data.message || data.error || 'Close failed.'}`);
            }

            await loadDashboard();
            await loadComplaints();
            await loadPendingVerification();
        } catch (err) {
            console.error('closeComplaint error:', err);
            alert('Network error while closing complaint.');
        }
    };
}

// ── Pending verification section (waiting on the USER, not the admin) ────────
async function loadPendingVerification() {
    try {
        const res  = await fetch(`${BASE_URL}/api/admin/complaints/pending-verification`, { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();

        const tbody = document.getElementById('pendingVerifTable');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:16px;color:#64748b;">No complaints awaiting user verification.</td></tr>`;
            return;
        }

        data.forEach(c => {
            const resolvedDate = c.resolved_at
                ? new Date(c.resolved_at).toLocaleString('en-IN')
                : (c.updated_at ? new Date(c.updated_at).toLocaleString('en-IN') : 'N/A');

            tbody.innerHTML += `
            <tr>
                <td><strong>${c.ticket_number || `TCKT-${String(c.id).padStart(6, '0')}`}</strong></td>
                <td>${c.user_name || '—'}</td>
                <td>${c.department || '—'}</td>
                <td>${c.technician_name || '—'}</td>
                <td style="max-width:200px;word-break:break-word;">
                    ${c.technician_resolution || c.tech_remarks || '—'}
                </td>
                <td>${resolvedDate}</td>
                <td>
                    <span style="color:#b45309;font-weight:600;">⏳ Waiting for user response</span>
                </td>
            </tr>`;
        });
    } catch (err) { console.error('loadPendingVerification error:', err); }
}

// ── Filter by asset type ──────────────────────────────────────────────────────
async function filterComplaints(asset) {
    try {
        const url = asset === 'All'
            ? `${BASE_URL}/api/admin/complaints`
            : `${BASE_URL}/api/admin/complaints/filter/${encodeURIComponent(asset)}`;
        const res  = await fetch(url, { headers: authHeaders() });
        const data = res.ok ? await res.json() : { error: true, message: `Server ${res.status}` };
        renderTable(data);
    } catch (err) { renderTable({ error: true, message: 'Filter failed.' }); }
}

function initFeedbackSection(complaint) {
    currentComplaintId = complaint.id;
    const status = (complaint.status || '').toLowerCase();

    if (status === 'resolved' || status === 'closed') {
        const closedDate = complaint.closed_at || complaint.resolved_at || complaint.updated_at;
        const daysSince = Math.floor((Date.now() - new Date(closedDate).getTime()) / (1000 * 60 * 60 * 24));
        const daysLeft = 7 - daysSince;

        if (daysLeft > 0 && !complaint.feedback_rating) {
            document.getElementById('feedbackSection').style.display = 'block';
            document.getElementById('feedbackDaysLeft').textContent =
                `${daysLeft} day(s) left to give feedback`;
        }

        if (daysLeft > 0 && !complaint.feedback_rating) {
            document.getElementById('reopenSection').style.display = 'block';
        }
    }

    // Star rating click handler
    document.querySelectorAll('.star').forEach(star => {
        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.val);
            document.querySelectorAll('.star').forEach((s, i) => {
                s.textContent = i < selectedRating ? '★' : '☆';
            });
        });
    });
}

async function submitFeedback() {
    if (!selectedRating) {
        document.getElementById('feedbackMsg').textContent = 'Please select a star rating.';
        document.getElementById('feedbackMsg').style.color = '#DC2626';
        return;
    }

    const token = localStorage.getItem('token'); // adjust to your auth storage
    const comment = document.getElementById('feedbackComment').value.trim();

    try {
        const res = await fetch(`/api/complaints/${currentComplaintId}/feedback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ rating: selectedRating, comment })
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('feedbackMsg').style.color = '#15803D';
            document.getElementById('feedbackMsg').textContent =
                `Feedback submitted! Quality Score: ${data.quality_score}/100`;
            document.getElementById('feedbackSection').style.pointerEvents = 'none';
            document.getElementById('feedbackSection').style.opacity = '0.6';
        } else {
            document.getElementById('feedbackMsg').style.color = '#DC2626';
            document.getElementById('feedbackMsg').textContent = data.message;
        }
    } catch (e) {
        document.getElementById('feedbackMsg').textContent = 'Network error.';
    }
}

async function submitReopen() {
    const reason = document.getElementById('reopenReason').value.trim();
    if (reason.length < 10) {
        document.getElementById('reopenMsg').textContent = 'Please provide more detail (min 10 characters).';
        document.getElementById('reopenMsg').style.color = '#DC2626';
        return;
    }

    const token = localStorage.getItem('token');

    try {
        const res = await fetch(`/api/complaints/${currentComplaintId}/reopen`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ reason })
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('reopenMsg').style.color = '#15803D';
            document.getElementById('reopenMsg').textContent =
                `Reopened! New ticket: ${data.new_ticket}`;
            document.getElementById('reopenSection').style.pointerEvents = 'none';
            document.getElementById('reopenSection').style.opacity = '0.6';
        } else {
            document.getElementById('reopenMsg').style.color = '#DC2626';
            document.getElementById('reopenMsg').textContent = data.message;
        }
    } catch (e) {
        document.getElementById('reopenMsg').textContent = 'Network error.';
    }
}

// ── Attendance ────────────────────────────────────────────────────────────────
async function loadAttendance() {
    try {
        const res  = await fetch(`${BASE_URL}/api/admin/attendance`, { headers: authHeaders() });
        const data = await res.json();
        if (!data.success) return;

        const tbody = document.getElementById('attendanceTable');
        if (!tbody) return;
        tbody.innerHTML = '';

        data.attendance.forEach(a => {
            const badge =
                a.status === 'Present'  ? "<span style='color:green;font-weight:bold'>🟢 Present</span>"  :
                a.status === 'Half Day' ? "<span style='color:orange;font-weight:bold'>🟡 Half Day</span>" :
                                          "<span style='color:red;font-weight:bold'>🔴 Absent</span>";

            tbody.innerHTML += `
            <tr>
                <td>${a.photo
                    ? `<img src="${BASE_URL}${a.photo}?t=${Date.now()}" width="60" height="60"
                          style="border-radius:50%;object-fit:cover;border:2px solid #2563eb;"
                          onerror="this.outerHTML='No Photo'">`
                    : 'No Photo'}</td>
                <td>${a.name}</td>
                <td>${a.email}</td>
                <td>${new Date(a.attendance_date).toLocaleDateString()}</td>
                <td>${a.check_in ? new Date(a.check_in).toLocaleTimeString() : '—'}</td>
                <td>
                    <select id="status-${a.id}">
                        <option value="Present"  ${a.status === 'Present'  ? 'selected' : ''}>🟢 Present</option>
                        <option value="Half Day" ${a.status === 'Half Day' ? 'selected' : ''}>🟡 Half Day</option>
                        <option value="Absent"   ${a.status === 'Absent'   ? 'selected' : ''}>🔴 Absent</option>
                    </select>
                </td>
                <td>
                    <button onclick="updateAttendance(${a.id})"
                        style="background:#2563eb;color:white;border:none;padding:8px 14px;
                               border-radius:6px;cursor:pointer;font-weight:bold;">
                        Update
                    </button>
                </td>
            </tr>`;
        });
    } catch (err) { console.error('loadAttendance error:', err); }
}

const attendanceBtn = document.getElementById('attendanceBtn');
if (attendanceBtn) {
    attendanceBtn.addEventListener('click', () => {
        const section = document.getElementById('attendanceSection');
        if (section) section.style.display = 'block';
        loadAttendance();
    });
}

async function updateAttendance(id) {
    const status = document.getElementById(`status-${id}`).value;
    try {
        const res  = await fetch(`${BASE_URL}/api/admin/attendance/${id}`, {
            method:  'PUT',
            headers: authHeaders(),
            body:    JSON.stringify({ status }),
        });
        const data = await res.json();
        if (data.success) { alert('✅ Attendance Updated Successfully'); loadAttendance(); }
        else alert(data.message);
    } catch (err) { console.error(err); alert('Error updating attendance.'); }
}

// ============================================================
// MERGED EXTRA FEATURES: Attendance Summary, Date Filter,
// Export CSV, Print, Technician Search, Announcement Publish
// ============================================================

// Enhanced Attendance Loader with optional date filter + summary counts
async function loadAttendance(date = "") {
    try {
        const response = await fetch(
            `${BASE_URL}/api/admin/attendance${date ? `?date=${date}` : ""}`,
            {
                method: "GET",
                headers: authHeaders()
            }
        );

        const data = await response.json();
        if (!data.success) return;

        const tbody = document.getElementById("attendanceTable");
        if (!tbody) return;

        tbody.innerHTML = "";

        let present = 0;
        let halfDay = 0;
        let absent = 0;

        data.attendance.forEach(a => {
            if (a.status === "Present") present++;
            else if (a.status === "Half Day") halfDay++;
            else absent++;

            tbody.innerHTML += `
                <tr>
                    <td>
                        ${
                            a.photo
                            ? `<img
    src="${BASE_URL}${a.photo}?t=${Date.now()}"
    class="attendance-photo"
    title="Click to view full photo"
    onclick="openPhotoPreview('${BASE_URL}${a.photo}')"
    onerror="this.outerHTML='No Photo';">`
                            : "No Photo"
                        }
                    </td>
                    <td>${a.name || "—"}</td>
                    <td>${a.email || "—"}</td>
                    <td>${a.attendance_date ? new Date(a.attendance_date).toLocaleDateString() : "—"}</td>
                    <td>${a.check_in ? new Date(a.check_in).toLocaleTimeString() : "—"}</td>
                    <td>
                        <select id="status-${a.id}">
                            <option value="Present" ${a.status === "Present" ? "selected" : ""}>🟢 Present</option>
                            <option value="Half Day" ${a.status === "Half Day" ? "selected" : ""}>🟡 Half Day</option>
                            <option value="Absent" ${a.status === "Absent" ? "selected" : ""}>🔴 Absent</option>
                        </select>
                    </td>
                    <td>
                        <button
                            onclick="updateAttendance(${a.id})"
                            style="background:#2563eb;color:white;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:bold;">
                            Update
                        </button>
                    </td>
                </tr>
            `;
        });

        const presentEl = document.getElementById("presentCount");
        const halfDayEl = document.getElementById("halfDayCount");
        const absentEl = document.getElementById("absentCount");

        if (presentEl) presentEl.innerText = present;
        if (halfDayEl) halfDayEl.innerText = halfDay;
        if (absentEl) absentEl.innerText = absent;

    } catch (err) {
        console.error("loadAttendance error:", err);
    }
}

// Enhanced Attendance Update keeps current date filter
async function updateAttendance(id) {
    const status = document.getElementById(`status-${id}`).value;

    try {
        const response = await fetch(`${BASE_URL}/api/admin/attendance/${id}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ status })
        });

        const data = await response.json();

        if (data.success) {
            alert("✅ Attendance Updated Successfully");
            const dateEl = document.getElementById("attendanceDate");
            loadAttendance(dateEl ? dateEl.value : "");
        } else {
            alert(data.message || "Attendance update failed.");
        }
    } catch (err) {
        console.error(err);
        alert("Error updating attendance.");
    }
}

// Publish Announcement / Train Notice
async function publishNotice() {
    const messageEl = document.getElementById('noticeMessage');
    const targetEl = document.getElementById('noticeTarget');
    const monthsEl = document.getElementById('noticeMonths');
    const daysEl = document.getElementById('noticeDays');
    const minutesEl = document.getElementById('noticeMinutes');
    const pdfEl = document.getElementById('noticePdf');

    if (!messageEl || !targetEl || !monthsEl || !daysEl || !minutesEl) {
        alert("Notice form not found.");
        return;
    }

    const message = messageEl.value.trim();
    const target_role = targetEl.value;
    const duration_months = monthsEl.value;
    const duration_days = daysEl.value;
    const duration_minutes = minutesEl.value;

    if (!message) {
        alert("⚠️ Please enter an announcement message first.");
        return;
    }
const formData = new FormData();
formData.append("message", message);
formData.append("target_role", target_role);
formData.append("duration_months", duration_months);
formData.append("duration_days", duration_days);
formData.append("duration_minutes", duration_minutes);

if (pdfEl && pdfEl.files[0]) {
    formData.append("pdf", pdfEl.files[0]);
}
    try {
        const response = await fetch(`${BASE_URL}/api/announcements/create`, {
            method: 'POST',
            headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
},
body: formData
        });

        const data = await response.json();

        if (response.ok || data.success) {
            alert(data.message || "✅ Notice successfully broadcast!");
            messageEl.value = "";
            monthsEl.value = "0";
            daysEl.value = "0";
            minutesEl.value = "30";
        } else {
            alert(`Failed: ${data.message || "Could not publish notice."}`);
        }
    } catch (err) {
        console.error("Notice publishing error:", err);
        alert("Network error while publishing notice.");
    }
}

// Technician search inside Attendance Table
function searchTechnician() {
    const input = document.getElementById("searchTech");
    if (!input) return;

    const keyword = input.value.toLowerCase();
    const rows = document.querySelectorAll("#attendanceTable tr");

    rows.forEach(row => {
        const technicianName = row.cells[1] ? row.cells[1].innerText.toLowerCase() : "";
        row.style.display = technicianName.includes(keyword) ? "" : "none";
    });
}

// Wire extra buttons safely after page load
document.addEventListener("DOMContentLoaded", () => {
    const attendanceBtnMerged = document.getElementById("attendanceBtn");
    if (attendanceBtnMerged) {
        attendanceBtnMerged.addEventListener("click", () => {
            const attendanceSection = document.getElementById("attendanceSection");
            const attendanceSummary = document.getElementById("attendanceSummary");
            const attendanceFilters = document.getElementById("attendanceFilters");

            if (attendanceSection) attendanceSection.style.display = "block";
            if (attendanceSummary) attendanceSummary.style.display = "grid";
            if (attendanceFilters) attendanceFilters.style.display = "block";

            loadAttendance();
        });
    }

    const filterBtn = document.getElementById("filterAttendanceBtn");
    if (filterBtn) {
        filterBtn.addEventListener("click", () => {
            const date = document.getElementById("attendanceDate").value;
            loadAttendance(date);
        });
    }

    const searchBtn = document.getElementById("searchTechBtn");
    if (searchBtn) {
        searchBtn.addEventListener("click", searchTechnician);
    }

    const exportBtn = document.getElementById("exportAttendanceBtn");
    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            let csv = "Technician,Email,Date,Check In,Status\n";

            document.querySelectorAll("#attendanceTable tr").forEach(row => {
                const cols = row.querySelectorAll("td");
                if (cols.length > 0) {
                    const tech = cols[1].innerText.trim();
                    const email = cols[2].innerText.trim();
                    const date = cols[3].innerText.trim();
                    const checkIn = cols[4].innerText.trim();
                    const statusSelect = cols[5].querySelector("select");
                    const status = statusSelect ? statusSelect.value : cols[5].innerText.trim();

                    csv += `"${tech}","${email}","${date}","${checkIn}","${status}"\n`;
                }
            });

            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = "Attendance_Report.csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            URL.revokeObjectURL(url);
        });
    }

    const printBtn = document.getElementById("printAttendanceBtn");
    if (printBtn) {
        printBtn.addEventListener("click", () => {
            const section = document.getElementById("attendanceSection");
            if (!section) return;

            const printWindow = window.open("", "", "width=1000,height=700");

            printWindow.document.write(`
                <html>
                <head>
                    <title>Attendance Report</title>
                    <style>
                        body{font-family:Arial,sans-serif;padding:20px;}
                        h2{text-align:center;margin-bottom:20px;}
                        table{width:100%;border-collapse:collapse;}
                        th,td{border:1px solid #000;padding:8px;text-align:left;}
                        th{background:#2563eb;color:white;}
                        img{width:60px;height:60px;border-radius:50%;}
                    </style>
                </head>
                <body>
                    <h2>Technician Attendance Report</h2>
                    ${section.innerHTML}
                </body>
                </html>
            `);

            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
        });
    }
});

function openPhotoPreview(photoUrl) {
    const modal = document.getElementById("photoPreviewModal");
    const img = document.getElementById("previewAttendancePhoto");

    if (!modal || !img) return;

    img.src = `${photoUrl}?t=${Date.now()}`;
    modal.style.display = "flex";
}

function closePhotoPreview(event) {
    const modal = document.getElementById("photoPreviewModal");
    const img = document.getElementById("previewAttendancePhoto");

    if (
        event.target.id === "photoPreviewModal" ||
        event.target.classList.contains("photo-preview-close")
    ) {
        modal.style.display = "none";
        if (img) img.src = "";
    }
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        const modal = document.getElementById("photoPreviewModal");
        const img = document.getElementById("previewAttendancePhoto");

        if (modal) modal.style.display = "none";
        if (img) img.src = "";
    }
});