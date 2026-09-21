const express = require('express');
const router  = express.Router();
const { pool } = require('../config/db');
const { getQualityDashboard, resolveReview } = require('../controllers/adminQualityController');

// ─── Helper: insert complaint history row ─────────────────────────────────────
async function logHistory(complaintId, action, performedBy, remarks = null) {
    await pool.query(
        `INSERT INTO complaint_history (complaint_id, action, performed_by, remarks)
         VALUES ($1, $2, $3, $4)`,
        [complaintId, action, performedBy, remarks]
    );
}

// ─── Helper: safe notification insert ─────────────────────────────────────
async function notifyUser(userId, complaintId, message) {
    try {
        await pool.query(
            `INSERT INTO notifications (user_id, complaint_id, message) VALUES ($1, $2, $3)`,
            [userId, complaintId, message]
        );
    } catch (e) {
        console.warn('[notify] Non-fatal notification insert error:', e.message);
    }
}

// ── 1. Dashboard counters ─────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
    try {
        const total    = await pool.query(`SELECT COUNT(*) FROM complaints`);
        const pending  = await pool.query(
            `SELECT COUNT(*) FROM complaints WHERE LOWER(status) IN ('pending','assigned','accepted','in progress','reopened')`
        );
        const resolved = await pool.query(
            `SELECT COUNT(*) FROM complaints WHERE LOWER(status) IN ('resolved','closed')`
        );
        // "Awaiting verification" now means waiting on the USER's response,
        // not the admin's — that happens once the technician submits resolution remarks.
        const waitVerif = await pool.query(
            `SELECT COUNT(*) FROM complaints WHERE LOWER(status) = 'waiting for user verification'`
        );

        res.json({
            totalComplaints:              parseInt(total.rows[0].count, 10),
            pendingComplaints:            parseInt(pending.rows[0].count, 10),
            resolvedComplaints:           parseInt(resolved.rows[0].count, 10),
            awaitingVerificationCount:    parseInt(waitVerif.rows[0].count, 10),
        });
    } catch (err) {
        console.error('[admin/dashboard] Error:', err.message, '\n', err.stack);
        res.status(500).json({ success: false, message: 'Failed to load dashboard', error: err.message });
    }
});

// ── 2. All complaints (with user + technician names) ─────────────────────────
router.get('/complaints', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                c.*,
                u.name  AS user_name,
                u.email AS user_email,
                t.name  AS technician_name,
                t.phone AS technician_phone
            FROM complaints c
            LEFT JOIN users       u ON c.user_id     = u.id
            LEFT JOIN technicians t ON c.assigned_to = t.id
            ORDER BY c.id DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('[admin/complaints] Error:', err.message, '\n', err.stack);
        res.status(500).json({ success: false, message: 'Failed to load complaints', error: err.message });
    }
});

// ── 3. Complaints waiting on the USER's response (status = 'Waiting for User Verification') ─
router.get('/complaints/pending-verification', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                c.id, c.ticket_number, c.subject, c.department, c.status,
                c.technician_resolution, c.tech_remarks,
                c.resolved_at, c.updated_at,
                c.user_verification_response, c.user_verification_remarks, c.user_verified_at,
                u.name  AS user_name,
                t.name  AS technician_name,
                t.phone AS technician_phone
            FROM complaints c
            LEFT JOIN users       u ON c.user_id     = u.id
            LEFT JOIN technicians t ON c.assigned_to = t.id
            WHERE LOWER(c.status) = 'waiting for user verification'
            ORDER BY c.resolved_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('[admin/pending-verification] Error:', err.message, '\n', err.stack);
        res.status(500).json({ success: false, message: 'Failed to load pending verifications', error: err.message });
    }
});

// ── 3b. Complaints the user has RESPONDED to (Yes = Resolved, No = Reopened) ──
// Admin uses this list to see the user's decision, then close (Yes) or reassign (No).
router.get('/complaints/user-responses', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                c.id, c.ticket_number, c.subject, c.department, c.status,
                c.technician_resolution, c.tech_remarks,
                c.user_verification_response, c.user_verification_remarks, c.user_verified_at,
                u.name  AS user_name,
                t.name  AS technician_name,
                t.phone AS technician_phone
            FROM complaints c
            LEFT JOIN users       u ON c.user_id     = u.id
            LEFT JOIN technicians t ON c.assigned_to = t.id
            WHERE c.user_verification_response IS NOT NULL
              AND LOWER(c.status) IN ('resolved', 'reopened')
            ORDER BY c.user_verified_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('[admin/user-responses] Error:', err.message, '\n', err.stack);
        res.status(500).json({ success: false, message: 'Failed to load user responses', error: err.message });
    }
});

// ── 4. All technicians list ───────────────────────────────────────────────────
router.get('/technicians', async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, name, phone FROM technicians ORDER BY name`);
        res.json(result.rows);
    } catch (err) {
        console.error('[admin/technicians] Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to load technicians', error: err.message });
    }
});

// ── 5. Assign technician to complaint ─────────────────────────────────────────
router.put('/assign/:id', async (req, res) => {
    try {
        const complaintId  = parseInt(req.params.id, 10);
        const rawTechId    = req.body.technician_id || req.body.technicianId;
        const technician_id = parseInt(rawTechId, 10);

        if (isNaN(complaintId) || isNaN(technician_id)) {
            return res.status(400).json({ success: false, message: 'Invalid Complaint ID or Technician ID.' });
        }

        const techRow = await pool.query(`SELECT id, name FROM technicians WHERE id = $1`, [technician_id]);
        if (techRow.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Technician not found.' });
        }
        const techName = techRow.rows[0].name;

        await pool.query(`
            UPDATE complaints
            SET assigned_to = $1, status = 'Assigned', updated_at = NOW()
            WHERE id = $2
        `, [technician_id, complaintId]);

        await logHistory(complaintId, 'Assigned', 'Admin', `Assigned to technician: ${techName}`);

        // Notify technician via notifications table if user_id is available
        // (We notify admin-side — technician checks their own complaints)
        const compRow = await pool.query(`SELECT user_id, ticket_number FROM complaints WHERE id = $1`, [complaintId]);
        if (compRow.rows.length > 0) {
            await notifyUser(
                compRow.rows[0].user_id,
                complaintId,
                `Your complaint ${compRow.rows[0].ticket_number} has been assigned to technician ${techName}.`
            );
        }

        return res.json({ success: true, message: `Technician ${techName} assigned successfully!` });

    } catch (err) {
        console.error('[admin/assign] Error:', err.message, '\nBody:', req.body, '\n', err.stack);
        res.status(500).json({ success: false, message: 'Failed to assign technician', error: err.message });
    }
});

// ── 6. Filter complaints by asset type ───────────────────────────────────────
router.get('/complaints/filter/:asset', async (req, res) => {
    try {
        const asset = req.params.asset;
        let result;

        if (asset === 'All') {
            result = await pool.query(`
                SELECT c.*, u.name AS user_name, t.name AS technician_name, t.phone AS technician_phone
                FROM complaints c
                LEFT JOIN users u ON c.user_id = u.id
                LEFT JOIN technicians t ON c.assigned_to = t.id
                ORDER BY c.id DESC
            `);
        } else {
            result = await pool.query(`
                SELECT c.*, u.name AS user_name, t.name AS technician_name, t.phone AS technician_phone
                FROM complaints c
                LEFT JOIN users u ON c.user_id = u.id
                LEFT JOIN technicians t ON c.assigned_to = t.id
                WHERE LOWER(c.subject) LIKE LOWER($1) OR LOWER(c.product) LIKE LOWER($1)
                ORDER BY c.id DESC
            `, [`%${asset}%`]);
        }

        res.json(result.rows);
    } catch (err) {
        console.error('[admin/filter] Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to filter complaints', error: err.message });
    }
});

// ── 7. DEPRECATED — admin no longer answers verification on the user's behalf.
// The actual user now responds via PUT /api/complaints/:id/verify (see routes/complaints.js).
// This endpoint is kept only so any old/cached frontend calls don't hard-crash; it simply
// reports the complaint's current state instead of mutating it.
router.put('/verify/:id', async (req, res) => {
    try {
        const complaintId = parseInt(req.params.id, 10);
        const comp = await pool.query(`SELECT status, user_verification_response FROM complaints WHERE id = $1`, [complaintId]);
        if (comp.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Complaint not found.' });
        }
        return res.json({
            success: true,
            message: 'Verification is now submitted by the user directly from their dashboard. This endpoint no longer changes complaint state.',
            status: comp.rows[0].status,
            user_verification_response: comp.rows[0].user_verification_response,
        });
    } catch (err) {
        console.error('[admin/verify] Error:', err.message, '\nBody:', req.body, '\n', err.stack);
        res.status(500).json({ success: false, message: 'Failed to process verification', error: err.message });
    }
});

// ── 8. Admin closes complaint with final closing remarks ─────────────────────
// ROOT CAUSE FIX: old query tried to SET admin_remarks which may not exist.
// Now uses admin_closing_remarks (from migration) + properly sets closed_at.
// A complaint can only be closed once status = 'Resolved' AND the user responded Yes
// (user_verification_response = TRUE) — i.e. after the new verification workflow.
router.put('/close/:id', async (req, res) => {
    try {
        const complaintId = parseInt(req.params.id, 10);
        const remarks     = (req.body.remarks || '').trim();

        if (!remarks) {
            return res.status(400).json({ success: false, message: 'Closing remarks are required.' });
        }

        const comp = await pool.query(`SELECT * FROM complaints WHERE id = $1`, [complaintId]);
        if (comp.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Complaint not found.' });
        }

        const current = comp.rows[0];

        if (current.status.toLowerCase() !== 'resolved' || current.user_verification_response !== true) {
            return res.status(400).json({
                success: false,
                message: 'Only complaints the user confirmed as resolved (Yes) can be closed.',
            });
        }

        await pool.query(`
            UPDATE complaints
            SET status                = 'Closed',
                admin_closing_remarks = $1,
                admin_remarks         = $1,
                closed_at             = NOW(),
                updated_at            = NOW()
            WHERE id = $2
        `, [remarks, complaintId]);

        await logHistory(complaintId, 'Closed', 'Admin', remarks);

        // Notify the user their complaint is closed
        await notifyUser(
            comp.rows[0].user_id,
            complaintId,
            `Your complaint ${comp.rows[0].ticket_number} has been closed. Admin remarks: ${remarks}`
        );

        res.json({ success: true, message: 'Complaint closed successfully.' });

    } catch (err) {
        console.error('[admin/close] Error:', err.message, '\nBody:', req.body, '\n', err.stack);
        res.status(500).json({ success: false, message: 'Failed to close complaint', error: err.message });
    }
});

// ── 9. Attendance list with optional date filter ──────────────────────────────
router.get('/attendance', async (req, res) => {
    try {
        const { date } = req.query;

        let query = `
            SELECT
                ta.id, ta.attendance_date, ta.check_in, ta.status, ta.photo,
                t.id AS technician_id,
                t.name,
                t.email
            FROM technician_attendance ta
            INNER JOIN technicians t ON ta.technician_id = t.id
        `;

        const values = [];

        if (date) {
            query += ` WHERE DATE(ta.attendance_date) = $1`;
            values.push(date);
        }

        query += `
            ORDER BY ta.attendance_date DESC, ta.check_in DESC
        `;

        const result = await pool.query(query, values);
        res.json({ success: true, attendance: result.rows });

    } catch (err) {
        console.error('[admin/attendance] Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to fetch attendance', error: err.message });
    }
});

// ── 10. Update attendance status ──────────────────────────────────────────────
router.put('/attendance/:id', async (req, res) => {
    try {
        const { status } = req.body;
        await pool.query(
            `UPDATE technician_attendance SET status = $1 WHERE id = $2`,
            [status, req.params.id]
        );
        res.json({ success: true, message: 'Attendance updated successfully.' });
    } catch (err) {
        console.error('[admin/attendance/update] Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to update attendance', error: err.message });
    }
});

router.get('/quality', protect, authorize('admin'), getQualityDashboard);
router.patch('/quality/reviews/:id', protect, authorize('admin'), resolveReview);

module.exports = router;
