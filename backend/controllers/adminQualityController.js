const asyncHandler = require('express-async-handler');
const { query } = require('..db');
const getQualityDashboard = asyncHandler(async (req, res) => {
  const { from, to, tech_id } = req.query;
  const conditions = ['c.quality_score IS NOT NULL'];
  const params = [];
  let i = 1;
  if (from)    { conditions.push(`c.updated_at >= $${i++}`); params.push(from); }
  if (to)      { conditions.push(`c.updated_at <= $${i++}`); params.push(`${to} 23:59:59`); }
  if (tech_id) { conditions.push(`c.assigned_to = $${i++}`); params.push(parseInt(tech_id)); }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const overallRes = await query (`
    SELECT
      COUNT(*) :: int                                             AS total_scored,
      ROUND(AVG(quality_score)::numeric, 1)                       AS avg_score,
      SUM(CASE WHEN quality_score >= 80 THEN 1 ELSE 0 END) :: int AS excellent,
      SUM(CASE WHEN quality_score >= 60 AND quality_score <80 THEN 1 ELSE 0 END):: int AS good,
      SUM(CASE WHEN quality_score >= 50 AND quality_score <60 THEN 1 ELSE 0 END):: int AS average,
      SUM(CASE WHEN quality_score < 50 THEN 1 ELSE 0 END):: int AS poor,
      SUM(CASE WHEN review_required = TRUE THEN 1 ELSE 0 END) :: int AS review_required,
      SUM(CASE WHEN reopen_count > 0 THEN 1 ELSE 0 END) :: int AS reopened,
      ROUND(AVG(feedback_rating)::numeric,1)                   AS avg_rating
    FROM complaints c
    ${where}
  `, params);
  const reviewRes = await query(`
        SELECT
            qr.id, qr.quality_score, qr.reason, qr.created_at,
            c.ticket_number, c.subject, c.product, c.reopen_count, c.feedback_rating,
            c.quality_explanation,
            t.name AS technician_name
        FROM quality_reviews qr
        JOIN complaints c ON c.id = qr.complaint_id
        JOIN technicians t ON t.id = qr.technician_id
        WHERE qr.status = 'pending'
        ORDER BY qr.quality_score ASC, qr.created_at DESC
    `);

    // Low score complaints
    const lowRes = await query(`
        SELECT
            c.id, c.ticket_number, c.subject, c.product,
            c.quality_score, c.quality_explanation,
            c.reopen_count, c.feedback_rating, c.updated_at,
            t.name AS technician_name,
            f.comment AS feedback_comment
        FROM complaints c
        LEFT JOIN technicians t ON t.id = c.assigned_to
        LEFT JOIN complaint_feedback f ON f.complaint_id = c.id
        ${where}
        ORDER BY c.quality_score ASC
        LIMIT 20
    `, params);

    res.json({
        overall: overallRes.rows[0],
        tech_stats: techRes.rows,
        review_queue: reviewRes.rows,
        low_score_complaints: lowRes.rows
    });
});

// PATCH /api/admin/quality/reviews/:id
const resolveReview = asyncHandler(async (req, res) => {
    const reviewId = parseInt(req.params.id, 10);
    const adminId = req.user.id;
    const { status, admin_notes } = req.body;

    if (!['reviewed', 'dismissed'].includes(status)) {
        res.status(400);
        throw new Error('Status must be "reviewed" or "dismissed".');
    }

    await query(
        `UPDATE quality_reviews SET
            status = $1, admin_notes = $2,
            reviewed_by = $3, reviewed_at = NOW()
         WHERE id = $4`,
        [status, admin_notes || null, adminId, reviewId]
    );

    res.json({ message: `Review marked as ${status}.` });
});

module.exports = { getQualityDashboard, resolveReview };