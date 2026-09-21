const asyncHandler = require('express-async-handler');
const { query } = require('../config/db');
const { computeQualityScore } = require('../quality');

const VALID_PRODUCTS = ['PC', 'UPS', 'Printer', 'Miscellaneous'];

const generateTicketNumber = async () => {
    const result = await query("SELECT nextval('ticket_number_seq') AS next_val");
    return `TCKT-${String(result.rows[0].next_val).padStart(6, '0')}`;
};

const logHistory = async (complaintId, action, performedBy, remarks = null) => {
    await query(
        `INSERT INTO complaint_history (complaint_id, action, performed_by, remarks)
         VALUES ($1, $2, $3, $4)`,
        [complaintId, action, performedBy, remarks]
    );
};

const createComplaint = asyncHandler(async (req, res) => {
    const { subject, description, phone, product, department } = req.body;
    const userId = req.user.id;

    if (!subject || !description || !phone || !product || !department) {
        res.status(400);
        throw new Error('All fields (subject, description, phone, product, department) are required.');
    }

    if (!VALID_PRODUCTS.includes(product)) {
        res.status(400);
        throw new Error(`Invalid product. Allowed: ${VALID_PRODUCTS.join(', ')}.`);
    }

    const ticketNumber = await generateTicketNumber();

    const result = await query(
        `INSERT INTO complaints
        (ticket_number, user_id, subject, description, phone, product, department, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending')
        RETURNING *`,
        [ticketNumber, userId, subject, description, phone, product, department]
    );

    const complaint = result.rows[0];
    await logHistory(complaint.id, 'Complaint Created', req.user.name, 'Complaint submitted by user.');

    res.status(201).json({ message: 'Complaint submitted successfully!', complaint });
});

const getUserComplaints = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const result = await query(
        `SELECT
            c.id, c.ticket_number, c.subject, c.description, c.status,
            c.phone, c.product, c.department, c.assigned_to,
            c.resolution_notes, c.technician_resolution, c.tech_remarks,
            c.admin_closing_remarks, c.resolved_at, c.closed_at,
            c.user_verification_response, c.user_verification_remarks, c.user_verified_at,
            c.created_at, c.updated_at,
            t.name AS technician_name,
            t.phone AS technician_phone
         FROM complaints c
         LEFT JOIN technicians t ON c.assigned_to = t.id
         WHERE c.user_id = $1
         ORDER BY c.created_at DESC`,
        [userId]
    );

    res.json(result.rows);
});

const getComplaintById = asyncHandler(async (req, res) => {
    const idParam = req.params.id;
    const isTicket = idParam.toUpperCase().startsWith('TCKT-');
    const whereClause = isTicket ? 'c.ticket_number = $1' : 'c.id = $1';
    const lookupValue = isTicket ? idParam.toUpperCase() : idParam;

    const result = await query(
        `SELECT
            c.id, c.ticket_number, c.subject, c.description, c.status,
            c.phone, c.product, c.department, c.assigned_to,
            c.resolution_notes, c.technician_resolution,
            c.admin_closing_remarks, c.resolved_at, c.closed_at,
            c.created_at, c.updated_at,
            t.name AS technician_name,
            t.phone AS technician_phone
         FROM complaints c
         LEFT JOIN technicians t ON c.assigned_to = t.id
         WHERE ${whereClause}`,
        [lookupValue]
    );

    if (result.rows.length === 0) {
        res.status(404);
        throw new Error('Complaint not found.');
    }

    const complaint = result.rows[0];

    const historyResult = await query(
        `SELECT action, performed_by, remarks, created_at
         FROM complaint_history
         WHERE complaint_id = $1
         ORDER BY created_at ASC`,
        [complaint.id]
    );

    res.json({ message: 'Complaint found.', complaint, history: historyResult.rows });
});

const submitUserVerification = asyncHandler(async (req, res) => {
    const complaintId = parseInt(req.params.id, 10);
    const userId = req.user.id;
    const { confirmed, remarks } = req.body;

    if (typeof confirmed !== 'boolean') {
        res.status(400);
        throw new Error('"confirmed" must be true or false.');
    }

    const compRes = await query('SELECT * FROM complaints WHERE id = $1', [complaintId]);

    if (compRes.rows.length === 0) {
        res.status(404);
        throw new Error('Complaint not found.');
    }

    const complaint = compRes.rows[0];

    if (complaint.user_id !== userId) {
        res.status(403);
        throw new Error('You are not authorized to verify this complaint.');
    }

    if ((complaint.status || '').toLowerCase() !== 'waiting for user verification') {
        res.status(400);
        throw new Error('This complaint is not currently awaiting your verification.');
    }

    const cleanRemarks = (remarks || '').trim() || null;
    const newStatus = confirmed ? 'Resolved' : 'Reopened';

    const updateResult = await query(
        `UPDATE complaints
         SET status = $1,
             user_verification_response = $2,
             user_verification_remarks = $3,
             user_verified_at = NOW(),
             verified_by_user = $2,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [newStatus, confirmed, cleanRemarks, complaintId]
    );

    await logHistory(
        complaintId,
        confirmed ? 'User Confirmed Resolution' : 'User Rejected Resolution',
        req.user.name,
        cleanRemarks || (confirmed ? 'User confirmed the issue is resolved.' : 'User reported the issue is not resolved.')
    );

    try {
        await query(
            `INSERT INTO notifications (user_id, complaint_id, message)
             VALUES ($1, $2, $3)`,
            [
                userId,
                complaintId,
                confirmed
                    ? `You confirmed complaint ${complaint.ticket_number} is resolved. Awaiting admin closure.`
                    : `You reported complaint ${complaint.ticket_number} is not resolved. It has been sent back for further action.`
            ]
        );
    } catch (n) {
        console.warn('[verify] notification non-fatal:', n.message);
    }

    res.json({
        message: confirmed
            ? 'Thank you! Your confirmation has been recorded. The admin will close this complaint shortly.'
            : 'Your response has been recorded. This complaint has been reopened for further action.',
        complaint: updateResult.rows[0]
    });
});

const submitFeedback = asyncHandler(async (req, res) => {
    const complainId = parseInt(req.params.id, 10);
    const userId = req.user.id;
    const { rating, comment } = req.body;
    if(!rating || rating < 1 || rating > 5) {
        res.status(400);
        throw new Error('Rating must be between 1 and 5');
    }
    const compRes = await query ('SELECT * FROM complaints WHERE ID = $1', [complaintId]);
    if (compRes.rows.length === 0){
        res.status(404);
        throw new Error ('Complaint not found');
    }
    const complaint = compRes.rows[0];
    if(complaint.user_id !== userId) {
        res.status(403);
        throw new Error ('Not Authorized');
    }
    if (complaint.status !== 'Resolved' && complaint.status !== 'Closed') {
        res.status(400);
        throw new Error('Feedback onlyallowed after complaint is resolved or closed');
    }
    const closedDate = complaint.closed_at || complaint.resolved_at || complaint.updated_at;
    const daysSince = (Date.now() - new Date(closedDate).getTime()) / (1000 * 60 * 60 * 24);
    if(daysSince > 7){
        res.status(400);
        throw new Error('Feedback window closed. You can only give feedback within 7 days of closure');
    }
    const existing = await query(
        'SELECT id FROM complaint_feedback WHERE complaint_id = $1', [complaintId]
    );
    if (existing.rows.length > 0) {
        res.status(400);
        throw new Error('You have already submitted feedback');
    }
    await query(
        `INSERT INTO complaint_feedback ( complaint_id, user_id, rating, comment)
         VALUES ($1,$2,$3,$4)`,
        [complaintId, userId, rating, comment || null]
    );
    const { score, explanation, review_required } = computeQualityScore({
        resolvedAt: complaint.resolved_at,
        deadlineAr: complaint.deadline_at,
        reopenCount: complaint.reopen_count || 0,
        feedbackRating : rating
    });
    await query(
        `UPDATE complaints SET
           quality_score = $1,
           quality_explanation = $2,
           feedback_rating = $3,
           review_required = $4,
           updated_at = NOW()
        WHERE id = $5`,
        [score, explanation, rating, review_required, complainId]
    );
    if (review_required && complaint.assigned_to) {
        const existingReview = await query(
            `SELECT id FROM quality_review WHERE complaint_id = $1 AND status = 'pending'`,
            [complainId]
        );
        if (existingReview.rows.length === 0) {
            await query(
                `INSERT INTO quality_review (complaint_id), technician_id, quality_score, reason)
                 VALUES ($1,$2,$3,$4)`,
                [complainId, complaint.assigned_to, score, explanation.join('; ')]
            );
        }
    }
    await logHistory(complaintId, 'Feedback Submitted', req.user.name,
        `User rated ${rating}/5. Quality Score: ${score}/100`);
    res.json({
        message: 'Feedback Submitted',
        quality_score: score,
        explanation,
        review_required
    });
});

const reopenComplaint = asyncHandler(async ( req, res) => {
    const complaintId = parseInt(req.params.id, 10);
    const userId = req.user.id;
    const { reason } = req.body;
    const compRes = await query ('SELECT * FROM complaints WHERE id = $1', [complaintId]);
    if (compRes.rows.length === 0){
        res.status(404);
        throw new Error('Complaint not found');
    }
    const complaint = compRes.rows[0];
    if (complaint.user_id !== userId) {
        res.status(403);
        throw new Error('Not Authorised');
    }
    if (complaint.status !== 'Resoved' && complaint.status !== 'Closed') {
        res.status(400);
        throw new Error('Only resolved complaints can be opened');
    }
    const closedDate = complaint.closed_at || complaint.resolved_at || complaint. updated_at;
    const daysSince = Math.floor(
        (Date.now() - new Date(closedDate).getTime())/ (1000 * 60 * 60 * 24)
    );
    if (daysSince>7){
        res.status(400);
        throw new Error('Reopen window closed');
    }
    const ticketNumber = await generateTicketNumber();
    const newComplaintRes = await query(
        `INSERT INTO complaints
            ticket_number, user_id, subject, descryttion, phone, product, department, status, assigned_to, is_reopened_from)
         VaALUES ($1, $2, $3, $4,$5,$6,$7, 'Pending', $8,$9)
         RETURNING *`
        [
            ticketNumber,
            userId,
            `[REOPEN] ${complaint.subject}`,
            `Reopened - original issue nt resolved.\n\nReason: ${reason.trim()}\n\nOriginal Descryption:\n${complaint.description}`,
            complaint.phone,
            complaint.product,
            complaint.department,
            complaint.assigned_to,
            complaintId
        ] 
    );
    const newComplaint = newComplaintRes.rows[0];
    await query(
        `INSERT INTO complaint_reopens
            (original_complaint_id, new_complaint_id, reopened_by, reason, days_since_closure)
         VALUES ($!,$2,$3,$4,$5)`,
        [complaintId, newComplaint.id, userId, reason.trim(), daysSince]
    );
    await query(
        `UPDATE complaints SET reopen_count = reopen_count +1, updated_at = NOW() WHERE id = $1`,
        [complaintId]
    );
    const updated = await query('SELECT * FROM complaints WHERE id = $1', [complaintId]);
    const orig = updated.rows[0];
    const { score, explaination, review_required } = computeQualityScore({
        resolvedAt: orig.resolved_at,
        deadlineAt: orig.deadline_at,
        reopenCount: orig.reopen_count,
        feedbackRating: orig.feedback_rating
    });
    await query(
        `UPDATE complaints SET
            quality_score = $1, quality_explanation = $2,
            review_required = $3, updated_at = NOW()
         WHERE id = $4`,
        [score, explaination, review_required, complaintId]
    );
    if(review_required &&  complaint.assigned_to){
        const existingReview = await query(
            `SELECT id FROM quality_review WHERE complaint_id = $1 AND status = 'pending'`,
            [complaintId]
        );
        if (existingReview.rows.length === 0){
            await query(
                `INSERT INTO quality_reviews (complaint_id, technician_id, quality_score, reason)
                 VALUES ($1,$2,$3,$4)`,
                [complaintId, complaint.assigned_to, score, explaination.join('; ')]
            );
        }
    }
    await logHistory(complaintId, 'Complaint Reopened', req.user.name,
        `User reopened. New Ticket: ${ticketNumber}. Reason : ${reason.trim()}`);
    await logHistory(newComplaint.id, 'Complaint Created (Reopen)', req.user.name,
        `Created fromreopen of ${complaint.ticket_number}`);
    try{
        await query(
            `INSERT INTO notifications (user_id, complaint_id, message) VALUES ($1, $2, $3)`,
            [userId, newComplaint.id,
                `Your complaint has been reopened. New Ticket: ${ticketNumber}`]
        );
    } catch (e) {
        console.warn('Reopen Failed:', e.message);
    }
    res.status(201).json({
        message: 'Complaint reopened Successfully',
        new_ticket: ticketNumber,
        new_complaint_id: newComplaint.id
    });
});


module.exports = {
    createComplaint,
    getUserComplaints,
    getComplaintById,
    submitUserVerification,
    submitFeedback,
    reopenComplaint,
    logHistory
};