const { toNumber, round2, pct, sum } = require("./utils");

const SERVICE_MAP = {
  "amazon elastic compute cloud": "EC2",
  ec2: "EC2",
  "elastic compute cloud": "EC2",
  "amazon simple storage service": "S3",
  s3: "S3",
  "amazon relational database service": "RDS",
  rds: "RDS",
  dynamodb: "DynamoDB",
  "data transfer": "Data Transfer",
  nat: "NAT Gateway",
  "nat gateway": "NAT Gateway",
  ebs: "EBS",
  snapshot: "EBS Snapshots",
  eks: "EKS",
  ecs: "ECS",
  lambda: "Lambda",
};

function canonicalServiceName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "Other";
  const lower = raw.toLowerCase();
  for (const [key, canonical] of Object.entries(SERVICE_MAP)) {
    if (lower.includes(key)) return canonical;
  }
  return raw;
}

function normalizeServices(rawServices = [], totalCost = 0) {
  const normalized = (Array.isArray(rawServices) ? rawServices : [])
    .map((s) => {
      const serviceName = canonicalServiceName(s.service_name || s.name);
      const monthlyCost = round2(toNumber(s.monthly_cost || s.monthly_cost_usd));
      const regions = Array.isArray(s.regions) ? s.regions : [];
      return {
        service_name: serviceName,
        monthly_cost: monthlyCost,
        percentage: round2(s.percentage || pct(monthlyCost, totalCost || 1)),
        regions,
        usage_patterns: s.usage_patterns || {},
        storage_class_distribution: s.storage_class_distribution || undefined,
      };
    })
    .filter((s) => s.monthly_cost >= 0);

  return normalized;
}

function parseTimePeriod(raw) {
  if (!raw) return { start: "", end: "" };
  if (typeof raw === "string") return { start: raw, end: "" };
  return {
    start: String(raw.start || ""),
    end: String(raw.end || ""),
  };
}

function normalizeInput(raw = {}) {
  const totalCostRaw = toNumber(raw.total_cost || raw.monthly_spend_usd);
  const preServices = Array.isArray(raw.services) ? raw.services : [];
  const fallbackTotal = sum(
    preServices.map((s) => toNumber(s.monthly_cost || s.monthly_cost_usd))
  );
  const totalCost = round2(totalCostRaw || fallbackTotal);

  const accounts =
    Array.isArray(raw.accounts) && raw.accounts.length
      ? raw.accounts.map((a, i) => ({
          account_id: String(a.account_id || a.id || `account_${i + 1}`),
          account_name: String(a.account_name || a.name || `Account ${i + 1}`),
          monthly_cost: round2(toNumber(a.monthly_cost || a.monthly_cost_usd)),
        }))
      : [
          {
            account_id: "unknown",
            account_name: "Single Account",
            monthly_cost: totalCost,
          },
        ];

  const commitments = raw.commitments || {};
  const networking = raw.networking || {};

  const normalized = {
    customer_id: String(raw.customer_id || "unknown_customer"),
    time_period: parseTimePeriod(raw.time_period),
    currency: String(raw.currency || "USD"),
    total_cost: totalCost,
    accounts,
    services: normalizeServices(preServices, totalCost),
    commitments: {
      savings_plans_coverage: toNumber(commitments.savings_plans_coverage),
      reserved_instances: Boolean(commitments.reserved_instances),
    },
    networking: {
      nat_gateway_cost: round2(toNumber(networking.nat_gateway_cost)),
      data_transfer_cost: round2(toNumber(networking.data_transfer_cost)),
    },
    anomalies: Array.isArray(raw.anomalies)
      ? raw.anomalies.map((a) => ({
          service: String(a.service || "Unknown"),
          description: String(a.description || ""),
        }))
      : [],
    metadata: raw.metadata || {},
  };

  return normalized;
}

function sampleInputSchema() {
  return {
    customer_id: "cust_001",
    time_period: { start: "2025-12-01", end: "2026-02-28" },
    currency: "USD",
    total_cost: 12000,
    accounts: [
      {
        account_id: "123456789",
        account_name: "prod-account",
        monthly_cost: 8000,
      },
    ],
    services: [
      {
        service_name: "EC2",
        monthly_cost: 5000,
        percentage: 41.6,
        regions: ["us-east-1", "us-west-2"],
        usage_patterns: { avg_utilization: 25, idle_instances_estimated: 5 },
      },
      {
        service_name: "S3",
        monthly_cost: 2000,
        storage_class_distribution: {
          standard: 80,
          infrequent_access: 15,
          glacier: 5,
        },
      },
    ],
    commitments: { savings_plans_coverage: 20, reserved_instances: false },
    networking: { nat_gateway_cost: 800, data_transfer_cost: 600 },
    anomalies: [{ service: "EBS", description: "30% spike in snapshot cost MoM" }],
  };
}

module.exports = {
  normalizeInput,
  sampleInputSchema,
};

