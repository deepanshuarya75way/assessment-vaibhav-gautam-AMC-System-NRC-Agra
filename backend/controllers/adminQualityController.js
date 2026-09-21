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
  const techRes = await query!`
  `
})