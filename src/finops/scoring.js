const { clamp, pct, round2 } = require("./utils");

function labelForScore(score) {
  if (score >= 80) return "High";
  if (score >= 60) return "Medium";
  return "Low";
}

function parseMonthToken(value) {
  const str = String(value || "");
  const date = str.match(/(20\d{2})[-/](0[1-9]|1[0-2])/);
  if (date) return `${date[1]}-${date[2]}`;
  const monthMatch = str.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,\-_/]*(20\d{2})/i
  );
  if (monthMatch) {
    const map = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    return `${monthMatch[2]}-${map[monthMatch[1].toLowerCase()]}`;
  }
  return "";
}

function estimateMonthsOfData(normalized) {
  const metadata = normalized.metadata || {};
  const hints = new Set();
  const tp = normalized.time_period || {};
  const start = parseMonthToken(tp.start);
  const end = parseMonthToken(tp.end);
  if (start) hints.add(start);
  if (end) hints.add(end);

  if (Number(metadata.invoice_count) > 0) {
    for (let i = 0; i < Number(metadata.invoice_count); i += 1) {
      hints.add(`inv-${i + 1}`);
    }
  }
  if (Number(metadata.cost_explorer_row_count) > 0) {
    if (metadata.monthly_breakdown) {
      hints.add("ce-1");
      hints.add("ce-2");
      hints.add("ce-3");
    } else {
      hints.add("ce-1");
    }
  }
  return hints.size;
}

function costByService(normalized, names) {
  const set = names.map((n) => n.toLowerCase());
  return round2(
    (normalized.services || [])
      .filter((s) =>
        set.some((key) => String(s.service_name || "").toLowerCase().includes(key))
      )
      .reduce((acc, s) => acc + Number(s.monthly_cost || 0), 0)
  );
}

function hasFinding(findings, id) {
  return findings.some((f) => f.id === id);
}

function hasSnapshotAnomaly(normalized) {
  return (normalized.anomalies || []).some((a) =>
    String(a.description || "").toLowerCase().includes("snapshot")
  );
}

function extractVolatilitySignal(normalized) {
  const numbers = [];
  (normalized.anomalies || []).forEach((a) => {
    const m = String(a.description || "").match(/(-?\d+(?:\.\d+)?)\s*%/);
    if (m) numbers.push(Math.abs(Number(m[1])));
  });
  if (!numbers.length) return null;
  return Math.max(...numbers);
}

function calculateConfidence(normalized, findings) {
  const total = Number(normalized.total_cost || 0);
  const services = normalized.services || [];
  const metadata = normalized.metadata || {};
  const commitments = normalized.commitments || {};
  const months = estimateMonthsOfData(normalized);

  // 1) Data Quality (20%)
  let dataQuality = 50;
  if (months >= 3 && services.length >= 3) dataQuality = 95;
  else if (months >= 2 && services.length >= 1) dataQuality = 78;
  else if (total > 0 && services.length > 0) dataQuality = 60;
  else if (total > 0) dataQuality = 45;
  if (!metadata.tags || (Array.isArray(metadata.tags) && metadata.tags.length === 0)) {
    dataQuality = Math.max(40, dataQuality - 8);
  }

  // 2) Usage Visibility (15%)
  const servicesWithUsage = services.filter(
    (s) => s.usage_patterns && Object.keys(s.usage_patterns).length > 0
  );
  const hasUtilizationMetrics = servicesWithUsage.some((s) =>
    Object.prototype.hasOwnProperty.call(s.usage_patterns, "avg_utilization")
  );
  const hasInstanceGranularity =
    servicesWithUsage.some((s) =>
      Object.prototype.hasOwnProperty.call(s.usage_patterns, "idle_instances_estimated")
    ) || Boolean(metadata.instance_level_granularity);
  let usageVisibility = 40;
  if (hasUtilizationMetrics) usageVisibility += 40;
  if (hasInstanceGranularity) usageVisibility += 30;
  if (!hasUtilizationMetrics && !hasInstanceGranularity) usageVisibility -= 40; // billing-only penalty
  usageVisibility = clamp(usageVisibility, 0, 100);

  // 3) Optimization Signals (25%)
  let optimizationSignals = 0;
  const idleEc2 =
    hasFinding(findings, "compute-rightsizing") ||
    servicesWithUsage.some((s) => Number(s.usage_patterns.idle_instances_estimated || 0) > 0);
  if (idleEc2) optimizationSignals += 20;

  const lowUtilization = servicesWithUsage.some(
    (s) => Number(s.usage_patterns.avg_utilization || 100) < 30
  );
  if (lowUtilization) optimizationSignals += 15;

  const noSavingsPlan = Number(commitments.savings_plans_coverage || 0) < 40;
  if (noSavingsPlan) optimizationSignals += 20;

  const s3 = services.find((s) => String(s.service_name).toLowerCase() === "s3");
  const highS3Standard = Number(s3?.storage_class_distribution?.standard || 0) > 70;
  if (highS3Standard || hasFinding(findings, "s3-tiering")) optimizationSignals += 10;

  if (hasFinding(findings, "snapshot-cleanup") || hasSnapshotAnomaly(normalized)) optimizationSignals += 10;

  const networkCost =
    costByService(normalized, ["data transfer", "nat", "cloudfront", "transit gateway", "vpc"]) || 0;
  if (networkCost > total * 0.05 || hasFinding(findings, "network-optimization")) optimizationSignals += 10;

  const orphanHint =
    hasFinding(findings, "baseline-governance") ||
    String(metadata.notes || "")
      .toLowerCase()
      .includes("orphan");
  if (orphanHint) optimizationSignals += 15;
  optimizationSignals = clamp(optimizationSignals, 0, 100);

  // 4) Commitment Coverage (15%)
  const coverage = Number(commitments.savings_plans_coverage || 0);
  let commitmentCoverage = 40;
  if (coverage > 70) commitmentCoverage = 90;
  else if (coverage >= 40) commitmentCoverage = 70;
  else commitmentCoverage = 40;

  // 5) Historical Stability (10%)
  const volatility = extractVolatilitySignal(normalized);
  let historicalStability = 70;
  if (volatility === null) {
    historicalStability = metadata.monthly_breakdown ? 70 : 65;
  } else if (volatility <= 10) historicalStability = 90;
  else if (volatility <= 25) historicalStability = 70;
  else historicalStability = 40;

  // 6) Heuristic Reliability (15%)
  const strongSignalsCount = [
    hasFinding(findings, "compute-rightsizing"),
    hasFinding(findings, "commitment-gap"),
    hasFinding(findings, "s3-tiering"),
  ].filter(Boolean).length;
  let heuristicReliability = 40;
  if (strongSignalsCount >= 3) heuristicReliability = 90;
  else if (strongSignalsCount >= 1) heuristicReliability = 60;
  else heuristicReliability = 40;

  const score = round2(
    dataQuality * 0.2 +
      usageVisibility * 0.15 +
      optimizationSignals * 0.25 +
      commitmentCoverage * 0.15 +
      historicalStability * 0.1 +
      heuristicReliability * 0.15
  );

  return {
    score,
    label: labelForScore(score),
    factors: {
      data_quality: round2(dataQuality),
      usage_visibility: round2(usageVisibility),
      optimization_signals: round2(optimizationSignals),
      commitment_coverage: round2(commitmentCoverage),
      historical_stability: round2(historicalStability),
      heuristic_reliability: round2(heuristicReliability),
    },
    weights: {
      data_quality: 0.2,
      usage_visibility: 0.15,
      optimization_signals: 0.25,
      commitment_coverage: 0.15,
      historical_stability: 0.1,
      heuristic_reliability: 0.15,
    },
    notes: [
      hasUtilizationMetrics ? "Utilization metrics available." : "Limited utilization metrics.",
      noSavingsPlan ? "Low commitment coverage is a major savings lever." : "Commitment posture is partially established.",
      metadata.tags ? "Tag metadata present." : "Tag metadata missing or limited.",
    ],
  };
}

function buildSavingsSummary(normalized, findings, confidence) {
  const total = Number(normalized.total_cost || 0);
  const computeSpend = costByService(normalized, ["ec2", "eks", "ecs", "lambda", "fargate"]);
  const s3Spend = costByService(normalized, ["s3"]);
  const snapshotSpend = costByService(normalized, ["snapshot", "ebs"]);
  const networkSpend = costByService(normalized, ["data transfer", "nat", "cloudfront", "transit gateway"]);
  const databaseSpend = costByService(normalized, ["rds", "dynamodb", "aurora", "redshift"]);
  const commitmentBaseSpend = computeSpend + databaseSpend;

  const computeSignal = hasFinding(findings, "compute-rightsizing");
  const commitmentSignal = hasFinding(findings, "commitment-gap");
  const s3Signal = hasFinding(findings, "s3-tiering");
  const snapshotSignal = hasFinding(findings, "snapshot-cleanup");
  const networkSignal = hasFinding(findings, "network-optimization");

  // Industry-calibrated benchmarks with conservative mid-points.
  const computeEstimated = round2(computeSpend * (computeSignal ? 0.25 : 0.12)); // 15-35%
  const commitmentEstimated = round2(
    commitmentBaseSpend *
      (Number(normalized.commitments?.savings_plans_coverage || 0) < 40 ? 0.2 : 0.12)
  ); // 10-30%
  const s3Estimated = round2(s3Spend * (s3Signal ? 0.17 : 0.1)); // 10-25%
  const snapshotEstimated = round2(snapshotSpend * (snapshotSignal ? 0.1 : 0.05)); // 5-15%
  const networkEstimated = round2(networkSpend * (networkSignal ? 0.12 : 0.06)); // 5-20%

  const estimatedRaw = round2(
    computeEstimated + commitmentEstimated + s3Estimated + snapshotEstimated + networkEstimated
  );

  const confidenceFactor = round2((confidence?.score || 0) / 100);
  let adjusted = round2(estimatedRaw * confidenceFactor);
  let lowConfidencePenaltyApplied = false;
  if ((confidence?.score || 0) < 60) {
    adjusted = round2(adjusted * 0.8); // additional 20% reduction
    lowConfidencePenaltyApplied = true;
  }

  const cap = round2(total * 0.45);
  const adjustedCapped = cap > 0 ? Math.min(adjusted, cap) : adjusted;
  const minAccuracy = round2(estimatedRaw * 0.7);
  const maxAccuracy = round2(estimatedRaw * 1.2);

  return {
    by_category: {
      compute: { min: round2(computeEstimated * 0.7), max: round2(computeEstimated * 1.2) },
      commitments: { min: round2(commitmentEstimated * 0.7), max: round2(commitmentEstimated * 1.2) },
      storage: {
        min: round2((s3Estimated + snapshotEstimated) * 0.7),
        max: round2((s3Estimated + snapshotEstimated) * 1.2),
      },
      network: { min: round2(networkEstimated * 0.7), max: round2(networkEstimated * 1.2) },
      other: { min: 0, max: 0 },
      database: { min: 0, max: 0 },
    },
    estimated_monthly_savings_usd: estimatedRaw,
    confidence_dampening_factor: confidenceFactor,
    low_confidence_penalty_applied: lowConfidencePenaltyApplied,
    monthly_savings_usd: round2(adjustedCapped),
    monthly_savings_percent: round2(pct(adjustedCapped, total)),
    monthly_savings_range_usd: {
      min: minAccuracy,
      max: maxAccuracy,
    },
  };
}

module.exports = {
  calculateConfidence,
  buildSavingsSummary,
};

