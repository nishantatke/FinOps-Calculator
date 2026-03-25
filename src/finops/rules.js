const { pct, round2, sum } = require("./utils");

function addFinding(collection, finding) {
  collection.push({
    id: finding.id,
    category: finding.category,
    type: finding.type,
    priority: finding.priority,
    rule: finding.rule,
    rationale: finding.rationale,
    estimated_savings_range_usd: {
      min: round2(finding.min),
      max: round2(finding.max),
    },
    confidence: finding.confidence,
  });
}

function costByService(services, names) {
  const nameSet = names.map((n) => n.toLowerCase());
  return sum(
    services
      .filter((s) =>
        nameSet.some((n) => String(s.service_name || "").toLowerCase().includes(n))
      )
      .map((s) => s.monthly_cost)
  );
}

function runRuleEngine(normalized) {
  const findings = [];
  const total = normalized.total_cost || 0;
  const services = normalized.services || [];
  const commitments = normalized.commitments || {};
  const networking = normalized.networking || {};
  const anomalies = normalized.anomalies || [];

  const computeCost = costByService(services, ["ec2", "eks", "ecs", "lambda", "fargate"]);
  const s3 = services.find((s) => s.service_name === "S3");
  const snapshotCost = costByService(services, ["snapshot", "ebs"]);

  if (pct(computeCost, total) > 40) {
    addFinding(findings, {
      id: "compute-rightsizing",
      category: "compute",
      type: "Quick Win",
      priority: "High",
      rule: "EC2/EKS/ECS spend > 40% of total",
      rationale: "High compute concentration usually carries rightsizing and scheduling opportunity.",
      min: computeCost * 0.06,
      max: computeCost * 0.15,
      confidence: "Medium",
    });
  }

  if ((commitments.savings_plans_coverage || 0) < 50 || !commitments.reserved_instances) {
    addFinding(findings, {
      id: "commitment-gap",
      category: "commitments",
      type: "Strategic",
      priority: "High",
      rule: "Savings Plans coverage low or RI absent",
      rationale: "Steady-state workloads usually benefit from phased commitments.",
      min: (computeCost || total * 0.2) * 0.03,
      max: (computeCost || total * 0.2) * 0.1,
      confidence: "Medium",
    });
  }

  if (s3 && s3.storage_class_distribution) {
    const standardPct = Number(s3.storage_class_distribution.standard || 0);
    if (standardPct > 70) {
      addFinding(findings, {
        id: "s3-tiering",
        category: "storage",
        type: "Quick Win",
        priority: "Medium",
        rule: "S3 Standard > 70%",
        rationale: "High standard-class ratio suggests lifecycle and tiering opportunity.",
        min: s3.monthly_cost * 0.08,
        max: s3.monthly_cost * 0.2,
        confidence: "Medium",
      });
    }
  }

  const hasSnapshotSpike = anomalies.some((a) =>
    String(a.description || "").toLowerCase().includes("snapshot")
  );
  if (hasSnapshotSpike || snapshotCost > total * 0.08) {
    addFinding(findings, {
      id: "snapshot-cleanup",
      category: "storage",
      type: "Quick Win",
      priority: "Medium",
      rule: "Snapshot growth anomaly or high snapshot share",
      rationale: "Retention controls and cleanup can reduce stale backup costs.",
      min: snapshotCost * 0.08,
      max: snapshotCost * 0.18,
      confidence: "Medium",
    });
  }

  const natCost = Number(networking.nat_gateway_cost || 0);
  const dtCost = Number(networking.data_transfer_cost || 0);
  if (pct(natCost + dtCost, total) > 5) {
    addFinding(findings, {
      id: "network-optimization",
      category: "network",
      type: "Mixed",
      priority: "Medium",
      rule: "NAT + data transfer > 5% of total",
      rationale: "Network path and endpoint tuning often lower egress and NAT charges.",
      min: (natCost + dtCost) * 0.05,
      max: (natCost + dtCost) * 0.15,
      confidence: "Low",
    });
  }

  if (!findings.length && total > 0) {
    addFinding(findings, {
      id: "baseline-governance",
      category: "other",
      type: "Quick Win",
      priority: "Low",
      rule: "No strong cost-pattern triggers found",
      rationale: "Governance and tagging cleanup generally produce modest initial savings.",
      min: total * 0.01,
      max: total * 0.03,
      confidence: "Low",
    });
  }

  return findings;
}

module.exports = {
  runRuleEngine,
};

