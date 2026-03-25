const { pct, round2 } = require("./utils");

function topCostDrivers(normalized) {
  const total = Number(normalized.total_cost || 1);
  return (normalized.services || [])
    .map((s) => ({
      service: s.service_name,
      monthly_cost: round2(s.monthly_cost),
      percent_of_total: round2(pct(s.monthly_cost, total)),
      observation:
        s.monthly_cost / total > 0.2
          ? "Primary cost lever for early optimization."
          : "Secondary lever after top spend services.",
    }))
    .sort((a, b) => b.monthly_cost - a.monthly_cost)
    .slice(0, 8);
}

function prioritizeActions(findings) {
  const high = [];
  const medium = [];
  const longTerm = [];

  findings.forEach((f) => {
    const action = `${f.category.toUpperCase()}: ${f.rationale}`;
    if (f.priority === "High") high.push(action);
    else if (f.priority === "Medium") medium.push(action);
    else longTerm.push(action);
  });

  if (!high.length) high.push("Run top-20 service deep-dive and validate utilization signals.");
  if (!medium.length) medium.push("Introduce lifecycle and cleanup automation for storage and snapshots.");
  if (!longTerm.length) {
    longTerm.push("Establish monthly FinOps governance cadence with commitment planning.");
  }

  return {
    high_impact: high,
    medium_impact: medium,
    long_term: longTerm,
  };
}

function buildReport(normalized, findings, confidence, savings) {
  const keyAreas = [];
  if (findings.some((f) => f.category === "compute")) keyAreas.push("Compute");
  if (findings.some((f) => f.category === "commitments")) keyAreas.push("Commitments");
  if (findings.some((f) => f.category === "storage")) keyAreas.push("Storage");
  if (!keyAreas.length) keyAreas.push("Governance");

  return {
    executive_summary: {
      estimated_monthly_spend: round2(normalized.total_cost),
      potential_savings: round2(savings.monthly_savings_usd),
      potential_savings_percent: round2(savings.monthly_savings_percent),
      potential_savings_range: savings.monthly_savings_range_usd,
      estimated_savings_before_confidence: round2(savings.estimated_monthly_savings_usd),
      confidence_dampening_factor: round2(savings.confidence_dampening_factor),
      low_confidence_penalty_applied: Boolean(savings.low_confidence_penalty_applied),
      confidence_level: confidence.label,
      confidence_score: confidence.score,
      key_optimization_areas: keyAreas,
    },
    key_cost_drivers: topCostDrivers(normalized),
    optimization_opportunities: findings,
    savings_summary: savings,
    confidence_model: confidence,
    recommended_actions: prioritizeActions(findings),
    assumptions: [
      "Assessment is based on billing-derived signals and heuristics.",
      "Workload-level telemetry is not fully available in this stage.",
      "Savings are confidence-dampened for higher estimation accuracy."
    ],
    next_steps: [
      "Connect CUR + CloudWatch/Trusted Advisor for workload validation.",
      "Build 30-60-90 day implementation roadmap with owners.",
      "Track realized savings against baseline using monthly governance."
    ],
  };
}

module.exports = {
  buildReport,
};
