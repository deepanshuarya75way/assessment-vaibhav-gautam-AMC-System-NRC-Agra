function computeQualityScore( { resolvedAt, deadlineAt, reopenCount, feedbackRating }) {
  let score = 100;
  const exxplanation = [];
  if(deadlineAt && resolvedAt) {
    const deadline = new Date(deadlineAt).getTime();
    const resolved = new Date(resolvedAt).getTime();
    if(resolved > deadline){
      const hoursLate = Math.round((resolved - deadline) / 3600000);
      score -= 15;
      exxplanation.push(`Resolved ${hoursLate}h after deadline (-15)`);
    }
  }
  if (feedbackRating != null) {
    const ratingMap = {1: -20, 2: -10, 3: 0, 4: 5, 5:10};
    const delta = ratingMap[feedbackRating] ?? 0;
    score += delta;
    const sign = delta >= 0 ? '+' : '';
    exxplanation.push(`User rated ${feedbackRating}/5 stars (${sign}${delta})`);
  } else {
    exxplanation.push('no user feedback yet');
  }
   score = Math.max(0, Math.min(100, score));
   return {
    score,
    explanation,
    review_requiered : score <50
  };
}

module.exports = { computeQualityScore }; 


