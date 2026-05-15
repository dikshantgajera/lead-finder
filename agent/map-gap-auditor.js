const DEFAULT_WEIGHTS = {
  reviews: 30,
  website: 25,
  reviewResponses: 20,
  profileCompleteness: 15,
  phoneReadiness: 10,
};

function scoreReviews(reviewCount, threshold = 20) {
  if (reviewCount === 0) return 0;
  if (reviewCount >= threshold * 3) return 30;
  const ratio = Math.min(reviewCount / threshold, 1);
  return Math.round(ratio * 30);
}

function scoreWebsite(hasWebsite) {
  return hasWebsite ? 25 : 0;
}

function scoreReviewResponses(respondsToReviews, reviewCount) {
  if (reviewCount === 0) return 10;
  if (respondsToReviews) return 20;
  return 0;
}

function scoreProfileCompleteness(lead) {
  let score = 0;
  if (lead.hasHours) score += 5;
  if (lead.hasPhotos) score += 5;
  if (lead.address) score += 3;
  if (lead.rating > 0) score += 2;
  return score;
}

function scorePhoneReadiness(lead) {
  if (!lead.phone) return 0;
  const digits = lead.phone.replace(/\D/g, '');
  if (digits.length >= 10) return 10;
  if (digits.length >= 7) return 5;
  return 0;
}

function auditBusiness(lead, options = {}) {
  const threshold = options.reviewThreshold || 20;
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };

  const scores = {
    reviews: scoreReviews(lead.reviewCount || 0, threshold),
    website: scoreWebsite(lead.hasWebsite),
    reviewResponses: scoreReviewResponses(lead.respondsToReviews, lead.reviewCount || 0),
    profileCompleteness: scoreProfileCompleteness(lead),
    phoneReadiness: scorePhoneReadiness(lead),
  };

  const totalScore = scores.reviews + scores.website + scores.reviewResponses + scores.profileCompleteness + scores.phoneReadiness;
  const maxScore = Object.values(weights).reduce((a, b) => a + b, 0);
  const percentage = Math.round((totalScore / maxScore) * 100);

  const gaps = [];
  if (scores.reviews < weights.reviews * 0.5) {
    gaps.push({
      key: 'low_reviews',
      label: 'Low Review Count',
      score: scores.reviews,
      maxScore: weights.reviews,
      detail: `${lead.reviewCount || 0} reviews (target: ${threshold}+)`,
      severity: scores.reviews === 0 ? 'critical' : 'warning',
    });
  }
  if (scores.website === 0) {
    gaps.push({
      key: 'no_website',
      label: 'No Website',
      score: 0,
      maxScore: weights.website,
      detail: 'No website linked on Google Maps listing',
      severity: 'critical',
    });
  }
  if (scores.reviewResponses < weights.reviewResponses * 0.5 && (lead.reviewCount || 0) > 0) {
    gaps.push({
      key: 'no_review_responses',
      label: 'Not Responding to Reviews',
      score: scores.reviewResponses,
      maxScore: weights.reviewResponses,
      detail: `Has ${lead.reviewCount} reviews but no owner responses detected`,
      severity: 'warning',
    });
  }
  if (scores.profileCompleteness < weights.profileCompleteness * 0.6) {
    gaps.push({
      key: 'incomplete_profile',
      label: 'Incomplete Profile',
      score: scores.profileCompleteness,
      maxScore: weights.profileCompleteness,
      detail: 'Missing hours, photos, or business details',
      severity: scores.profileCompleteness < 5 ? 'critical' : 'warning',
    });
  }
  if (scores.phoneReadiness === 0) {
    gaps.push({
      key: 'no_phone',
      label: 'No Phone Number',
      score: 0,
      maxScore: weights.phoneReadiness,
      detail: 'No clickable phone number on listing',
      severity: 'warning',
    });
  }

  const strengths = [];
  if (scores.reviews >= weights.reviews * 0.8) {
    strengths.push(`Strong review presence (${lead.reviewCount} reviews)`);
  }
  if (scores.website === weights.website) {
    strengths.push('Has website linked');
  }
  if (scores.reviewResponses === weights.reviewResponses) {
    strengths.push('Actively responds to reviews');
  }
  if (scores.profileCompleteness >= weights.profileCompleteness * 0.8) {
    strengths.push('Complete business profile');
  }
  if (scores.phoneReadiness === weights.phoneReadiness) {
    strengths.push('Phone number available');
  }

  let grade;
  if (percentage >= 90) grade = 'A';
  else if (percentage >= 80) grade = 'B';
  else if (percentage >= 70) grade = 'C';
  else if (percentage >= 60) grade = 'D';
  else grade = 'F';

  return {
    businessName: lead.name,
    address: lead.address,
    phone: lead.phone,
    website: lead.website,
    rating: lead.rating,
    reviewCount: lead.reviewCount || 0,
    totalScore,
    maxScore,
    percentage,
    grade,
    scores,
    weights,
    gaps,
    strengths,
    gapCount: gaps.length,
    isTarget: gaps.length >= 2,
    timestamp: new Date().toISOString(),
  };
}

function generateSummary(results) {
  const total = results.length;
  const targets = results.filter(r => r.isTarget);
  const avgScore = total > 0 ? Math.round(results.reduce((sum, r) => sum + r.percentage, 0) / total) : 0;
  const criticalGaps = {};

  for (const result of results) {
    for (const gap of result.gaps) {
      criticalGaps[gap.key] = (criticalGaps[gap.key] || 0) + 1;
    }
  }

  return {
    totalBusinesses: total,
    targetCount: targets.length,
    targetPercentage: total > 0 ? Math.round((targets.length / total) * 100) : 0,
    averageScore: avgScore,
    gradeDistribution: {
      A: results.filter(r => r.grade === 'A').length,
      B: results.filter(r => r.grade === 'B').length,
      C: results.filter(r => r.grade === 'C').length,
      D: results.filter(r => r.grade === 'D').length,
      F: results.filter(r => r.grade === 'F').length,
    },
    topGaps: Object.entries(criticalGaps)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, count })),
  };
}

module.exports = { auditBusiness, generateSummary, DEFAULT_WEIGHTS };
