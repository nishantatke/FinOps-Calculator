const { round2 } = require("../finops/utils");

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((v) => String(v).trim().length > 0)) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += ch;
  }
  row.push(current);
  if (row.some((v) => String(v).trim().length > 0)) rows.push(row);
  return rows;
}

function toNumber(v) {
  const n = Number(String(v || "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function findValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return "";
}

function parseCostExplorerCsvBuffer(buffer, fileName = "cost-explorer.csv") {
  const text = buffer.toString("utf8");
  const parsed = parseCsv(text);
  if (parsed.length < 2) {
    throw new Error(`Cost Explorer CSV "${fileName}" appears empty or invalid.`);
  }

  const headers = parsed[0].map(normalizeHeader);
  const rows = parsed.slice(1).map((line) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = line[idx] || "";
    });
    return obj;
  });

  const serviceCosts = new Map();
  const servicesByPurchaseOption = { ondemand: 0, savingsplans: 0, reserved: 0, spot: 0 };

  rows.forEach((row) => {
    const service = String(
      findValue(row, [
        "service",
        "service_name",
        "product_name",
        "line_item_product_code",
        "line_item_line_item_description",
      ]) || "Other"
    );
    const cost = toNumber(
      findValue(row, [
        "cost",
        "amortized_cost",
        "unblended_cost",
        "blended_cost",
        "net_unblended_cost",
      ])
    );

    serviceCosts.set(service, round2((serviceCosts.get(service) || 0) + cost));

    const purchase = String(findValue(row, ["purchaseoption", "purchase_option", "pricing_term"])).toLowerCase();
    if (purchase.includes("on demand") || purchase.includes("ondemand")) servicesByPurchaseOption.ondemand += cost;
    if (purchase.includes("savings")) servicesByPurchaseOption.savingsplans += cost;
    if (purchase.includes("reserved")) servicesByPurchaseOption.reserved += cost;
    if (purchase.includes("spot")) servicesByPurchaseOption.spot += cost;
  });

  return {
    file_name: fileName,
    row_count: rows.length,
    headers,
    rows,
    service_costs: [...serviceCosts.entries()].map(([service_name, monthly_cost]) => ({
      service_name,
      monthly_cost: round2(monthly_cost),
    })),
    purchase_options: Object.fromEntries(
      Object.entries(servicesByPurchaseOption).map(([k, v]) => [k, round2(v)])
    ),
  };
}

function summarizeRowsByKeyword(rows, keywords) {
  let count = 0;
  let cost = 0;
  rows.forEach((row) => {
    const rowText = Object.values(row).join(" ").toLowerCase();
    if (keywords.some((k) => rowText.includes(k))) {
      count += 1;
      cost += toNumber(
        row.unblended_cost || row.amortized_cost || row.blended_cost || row.cost || row.net_unblended_cost
      );
    }
  });
  return { count, cost: round2(cost) };
}

function parsePeriodFromRow(row) {
  const raw = String(
    findValue(row, [
      "date",
      "usage_start_date",
      "usage_startdate",
      "start_date",
      "timeperiod",
      "billing_period",
      "invoice_date",
    ]) || ""
  );
  if (!raw) return "unknown";

  const dateMatch = raw.match(/(20\d{2})[-/](0[1-9]|1[0-2])(?:[-/]\d{2})?/);
  if (dateMatch) return `${dateMatch[1]}-${dateMatch[2]}`;

  const monthMap = {
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
  const monthMatch = raw.toLowerCase().match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s-_,]*(20\d{2})/
  );
  if (monthMatch) return `${monthMatch[2]}-${monthMap[monthMatch[1]]}`;
  return "unknown";
}

function summarizeRowsByKeywordWithTrend(rows, keywords) {
  const matched = rows.filter((row) => {
    const rowText = Object.values(row).join(" ").toLowerCase();
    return keywords.some((k) => rowText.includes(k));
  });

  let totalCost = 0;
  const perPeriod = new Map();
  matched.forEach((row) => {
    const cost = toNumber(
      row.unblended_cost || row.amortized_cost || row.blended_cost || row.cost || row.net_unblended_cost
    );
    totalCost += cost;
    const period = parsePeriodFromRow(row);
    perPeriod.set(period, round2((perPeriod.get(period) || 0) + cost));
  });

  const knownPeriods = [...perPeriod.keys()].filter((p) => p !== "unknown").sort();
  let previousPeriodCost = 0;
  let currentPeriodCost = round2(totalCost);
  let previousPeriod = "";
  let currentPeriod = "";
  if (knownPeriods.length >= 2) {
    previousPeriod = knownPeriods[knownPeriods.length - 2];
    currentPeriod = knownPeriods[knownPeriods.length - 1];
    previousPeriodCost = round2(perPeriod.get(previousPeriod) || 0);
    currentPeriodCost = round2(perPeriod.get(currentPeriod) || 0);
  } else if (knownPeriods.length === 1) {
    currentPeriod = knownPeriods[0];
    currentPeriodCost = round2(perPeriod.get(currentPeriod) || totalCost);
  }

  const changePct = previousPeriodCost
    ? round2(((currentPeriodCost - previousPeriodCost) / previousPeriodCost) * 100)
    : 0;
  const changeDirection =
    previousPeriodCost === 0
      ? "unknown"
      : changePct > 3
        ? "increasing"
        : changePct < -3
          ? "decreasing"
          : "stable";

  return {
    count: matched.length,
    cost: round2(totalCost),
    current_period: currentPeriod,
    previous_period: previousPeriod,
    current_period_cost: currentPeriodCost,
    previous_period_cost: previousPeriodCost,
    change_pct: changePct,
    change_direction: changeDirection,
  };
}

function opportunitySignal(summary, totalCost) {
  const spendRatio = totalCost ? summary.cost / totalCost : 0;
  if (summary.count === 0 || summary.cost === 0) return "Low";
  if (summary.change_direction === "increasing" || spendRatio >= 0.05) return "High";
  if (summary.change_direction === "stable" && spendRatio >= 0.02) return "Medium";
  return "Medium";
}

function insightsFromCostExplorer(parsedCostExplorer, totalCost) {
  const rows = parsedCostExplorer.flatMap((f) => f.rows || []);
  const allPurchase = parsedCostExplorer.reduce(
    (acc, f) => {
      const p = f.purchase_options || {};
      acc.ondemand += Number(p.ondemand || 0);
      acc.savingsplans += Number(p.savingsplans || 0);
      acc.reserved += Number(p.reserved || 0);
      acc.spot += Number(p.spot || 0);
      return acc;
    },
    { ondemand: 0, savingsplans: 0, reserved: 0, spot: 0 }
  );
  const safeTotal = totalCost || 1;

  function makeInsight(definition, summary, confidence = "Medium") {
    const { header, recommendation, pctLow, pctHigh, whatToDetect, whyHigh, detectionLogic, impact, ease, horizon } =
      definition;
    const min = round2(summary.cost * pctLow);
    const max = round2(summary.cost * pctHigh);
    const trendNote =
      summary.previous_period && summary.current_period
        ? ` ${summary.previous_period} -> ${summary.current_period}: ${summary.change_pct}% (${summary.change_direction}).`
        : "";
    const signal = opportunitySignal(summary, safeTotal);
    return {
      header,
      what_to_detect: whatToDetect,
      why_cost_is_high: whyHigh,
      finops_action: recommendation,
      typical_savings_potential_percent: `${round2(pctLow * 100)}-${round2(pctHigh * 100)}%`,
      detection_logic: detectionLogic,
      estimated_impact_cost_usd: summary.cost,
      records_flagged: summary.count,
      insight: summary.count
        ? `${summary.count} matching cost records detected with approx. $${summary.cost} spend influence.${trendNote}`
        : "No direct matching records were detected in current extract.",
      potential_savings_range_usd: { min, max },
      priority: summary.cost / safeTotal > 0.05 ? "High" : "Medium",
      confidence,
      impact,
      ease_of_execution: ease,
      execution_horizon: horizon,
      trend: {
        previous_period: summary.previous_period || "",
        current_period: summary.current_period || "",
        previous_period_cost_usd: summary.previous_period_cost || 0,
        current_period_cost_usd: summary.current_period_cost || summary.cost,
        change_percent: summary.change_pct || 0,
        direction: summary.change_direction || "unknown",
      },
      opportunity_signal: signal,
    };
  }

  const definitions = [
    {
      header: "EBS volumes with older generation",
      keywords: ["gp2", "io1", "st1", "sc1", "magnetic"],
      recommendation: "Migrate legacy EBS volume types to gp3 (or io2 where required).",
      pctLow: 0.1,
      pctHigh: 0.25,
      whatToDetect: "EBS volume types gp2/io1/st1/sc1 instead of gp3/io2",
      whyHigh: "Older generations are less cost-efficient and can couple performance with storage size.",
      detectionLogic: "IF volume_type in (gp2, io1, st1, sc1) THEN recommend migration",
      impact: "Medium",
      ease: "Medium",
      horizon: "Mid-Term",
    },
    {
      header: "Unused EBS Volumes",
      keywords: ["ebs:volumeusage", "ebs volume", "detached", "volumeidle"],
      recommendation: "Delete unattached volumes after snapshot/backup verification.",
      pctLow: 1.0,
      pctHigh: 1.0,
      whatToDetect: "Detached/available EBS volumes not attached to active instances",
      whyHigh: "Unattached EBS still incurs full storage charges.",
      detectionLogic: "IF volume.attached = false THEN mark unused and save full cost",
      impact: "High",
      ease: "Easy",
      horizon: "Quick Win",
    },
    {
      header: "Provisioned IOPS EBS",
      keywords: ["piops", "provisioned iops", "ebs:volumepiops", "io1", "io2"],
      recommendation: "Rightsize IOPS or move suitable workloads to gp3.",
      pctLow: 0.2,
      pctHigh: 0.5,
      whatToDetect: "Provisioned IOPS volumes with high provisioned vs low consumed I/O",
      whyHigh: "PIOPS incurs separate IOPS charges and is often overprovisioned.",
      detectionLogic: "IF provisioned_iops >> actual_usage THEN reduce IOPS or migrate",
      impact: "Medium",
      ease: "Medium",
      horizon: "Mid-Term",
    },
    {
      header: "Old EBS Snapshots",
      keywords: ["snapshot", "ebs:snapshotusage"],
      recommendation: "Apply lifecycle retention and delete/archive stale snapshots.",
      pctLow: 0.05,
      pctHigh: 0.2,
      whatToDetect: "Snapshots older than policy threshold with no restore dependency",
      whyHigh: "Snapshot storage accumulates incrementally over time.",
      detectionLogic: "IF snapshot_age > threshold AND no recent restore THEN cleanup",
      impact: "Medium",
      ease: "Easy",
      horizon: "Quick Win",
    },
    {
      header: "Unused EIP",
      keywords: ["idleaddress", "elastic ip", "eip", "publicipv4:idleaddress"],
      recommendation: "Release unattached Elastic IPs immediately.",
      pctLow: 0.8,
      pctHigh: 1.0,
      whatToDetect: "Elastic IPs not attached to running resources",
      whyHigh: "Idle public IPv4 addresses are charged by AWS.",
      detectionLogic: "IF EIP not attached to running resource THEN mark unused",
      impact: "Low",
      ease: "Easy",
      horizon: "Quick Win",
    },
    {
      header: "Previous Generation EC2",
      keywords: ["m3.", "m4.", "c3.", "c4.", "t2.", "r3.", "r4.", "previous generation"],
      recommendation: "Upgrade to latest generation, preferably Graviton where compatible.",
      pctLow: 0.1,
      pctHigh: 0.4,
      whatToDetect: "Legacy EC2 families (m3/m4/c3/c4/t2/r3/r4 etc.)",
      whyHigh: "Older instances deliver lower price-performance.",
      detectionLogic: "IF instance_family in old_gen THEN recommend upgrade",
      impact: "High",
      ease: "Medium",
      horizon: "Mid-Term",
    },
    {
      header: "Idle Ec2 Instances",
      keywords: ["ec2", "boxusage", "stopped", "idle", "low utilization"],
      recommendation: "Stop/terminate idle instances and enforce non-prod schedules.",
      pctLow: 0.3,
      pctHigh: 1.0,
      whatToDetect: "Instances with sustained low CPU/network utilization",
      whyHigh: "Compute charges continue despite minimal workload activity.",
      detectionLogic: "IF cpu_utilization < 10% for 7+ days THEN mark idle",
      impact: "High",
      ease: "Easy",
      horizon: "Quick Win",
    },
    {
      header: "EC2 rightsizing",
      keywords: ["ec2", "boxusage", "instance", "m5", "m6", "c5", "c6", "r5", "r6"],
      recommendation: "Downsize overprovisioned instance families/sizes based on usage.",
      pctLow: 0.15,
      pctHigh: 0.35,
      whatToDetect: "Overprovisioned EC2 with low sustained CPU/memory profile",
      whyHigh: "Larger instance sizes are paid for unused headroom.",
      detectionLogic: "IF avg_cpu < 40% and memory low THEN recommend smaller instance",
      impact: "High",
      ease: "Medium",
      horizon: "Mid-Term",
    },
    {
      header: "Unused/Idle Load balancers",
      keywords: ["load balancer", "lcu", "elb", "alb", "nlb", "requestcount", "request_count", "idle"],
      recommendation: "Remove idle LBs and consolidate low-traffic front doors.",
      pctLow: 1.0,
      pctHigh: 1.0,
      whatToDetect: "ALB/NLB with zero/near-zero request count",
      whyHigh: "Load balancers incur hourly + LCU charges regardless of demand.",
      detectionLogic: "IF request_count = 0 THEN mark LB unused",
      impact: "Medium",
      ease: "Easy",
      horizon: "Quick Win",
    },
    {
      header: "Commitment",
      keywords: [],
      recommendation: "Purchase Savings Plans in phased tranches for stable baseline usage.",
      pctLow: 0.1,
      pctHigh: 0.3,
      whatToDetect: "Low Savings Plan/RI coverage on steady compute base",
      whyHigh: "On-demand rates are materially higher for predictable workloads.",
      detectionLogic: "IF coverage < 50% THEN recommend Savings Plans/RI",
      impact: "High",
      ease: "Medium",
      horizon: "Strategic",
    },
    {
      header: "RDS Manual Snapshot Deletion",
      keywords: ["rds", "chargedbackupusage", "manual snapshot", "snapshotusage"],
      recommendation: "Apply retention policy for manual snapshots and clean stale backups.",
      pctLow: 0.05,
      pctHigh: 0.15,
      whatToDetect: "Manual RDS snapshots retained beyond policy window",
      whyHigh: "Manual snapshots persist indefinitely unless explicitly deleted.",
      detectionLogic: "IF snapshot_type = manual AND old THEN mark for cleanup",
      impact: "Medium",
      ease: "Easy",
      horizon: "Quick Win",
    },
    {
      header: "S3 Teiring",
      keywords: ["s3", "timedstorage-bytehrs", "standard storage", "standardstorage", "intelligent-tiering"],
      recommendation: "Move eligible data to IA/Glacier/Intelligent-Tiering via lifecycle policy.",
      pctLow: 0.2,
      pctHigh: 0.6,
      whatToDetect: "High S3 Standard storage share vs cold/infrequent access patterns",
      whyHigh: "S3 Standard is expensive for infrequently accessed objects.",
      detectionLogic: "IF standard_storage > 60% THEN recommend tiering",
      impact: "Medium",
      ease: "Easy",
      horizon: "Mid-Term",
    },
  ];

  const out = [];
  definitions
    .filter((d) => d.header !== "Commitment")
    .forEach((d) => out.push(makeInsight(d, summarizeRowsByKeywordWithTrend(rows, d.keywords))));

  const onDemandShare = round2((allPurchase.ondemand / (safeTotal || 1)) * 100);
  const commitmentDef = definitions.find((d) => d.header === "Commitment");
  out.push({
    header: "Commitment",
    what_to_detect: commitmentDef.whatToDetect,
    why_cost_is_high: commitmentDef.whyHigh,
    finops_action: commitmentDef.recommendation,
    typical_savings_potential_percent: `${round2(commitmentDef.pctLow * 100)}-${round2(
      commitmentDef.pctHigh * 100
    )}%`,
    detection_logic: commitmentDef.detectionLogic,
    estimated_impact_cost_usd: round2(allPurchase.ondemand),
    records_flagged: rows.length,
    insight: `On-Demand share inferred at ${onDemandShare}% of analyzed spend.`,
    potential_savings_range_usd: {
      min: round2(allPurchase.ondemand * commitmentDef.pctLow),
      max: round2(allPurchase.ondemand * commitmentDef.pctHigh),
    },
    priority: onDemandShare > 60 ? "High" : "Medium",
    confidence: rows.length ? "Medium" : "Low",
    impact: commitmentDef.impact,
    ease_of_execution: commitmentDef.ease,
    execution_horizon: commitmentDef.horizon,
    trend: {
      previous_period: "",
      current_period: "",
      previous_period_cost_usd: 0,
      current_period_cost_usd: round2(allPurchase.ondemand),
      change_percent: 0,
      direction: "unknown",
    },
    opportunity_signal: onDemandShare > 60 ? "High" : "Medium",
  });

  return out;
}

module.exports = {
  parseCostExplorerCsvBuffer,
  insightsFromCostExplorer,
};
