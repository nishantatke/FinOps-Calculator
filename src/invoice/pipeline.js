const { analyze } = require("../finops/analyze");
const { round2 } = require("../finops/utils");
const { parseInvoicePdf } = require("./pdfParser");
const { parseCostExplorerCsvBuffer, insightsFromCostExplorer } = require("./costExplorer");

function mergeServiceCosts(parsedInvoices) {
  const map = new Map();
  parsedInvoices.forEach((inv) => {
    (inv.services || []).forEach((s) => {
      const name = s.service_name;
      map.set(name, round2((map.get(name) || 0) + Number(s.monthly_cost || 0)));
    });
  });
  return [...map.entries()].map(([service_name, monthly_cost]) => ({
    service_name,
    monthly_cost,
  }));
}

function detectInvoiceAnomalies(parsedInvoices) {
  if (parsedInvoices.length < 2) return [];

  const serviceByInvoice = parsedInvoices.map((inv) => {
    const row = {};
    (inv.services || []).forEach((s) => {
      row[s.service_name] = Number(s.monthly_cost || 0);
    });
    return row;
  });

  const allServices = new Set();
  serviceByInvoice.forEach((r) => Object.keys(r).forEach((k) => allServices.add(k)));

  const anomalies = [];
  allServices.forEach((svc) => {
    const vals = serviceByInvoice.map((r) => Number(r[svc] || 0)).filter((v) => v > 0);
    if (vals.length < 2) return;
    const first = vals[0];
    const last = vals[vals.length - 1];
    const changePct = first ? ((last - first) / first) * 100 : 0;
    if (Math.abs(changePct) >= 25) {
      anomalies.push({
        service: svc,
        description: `${round2(changePct)}% change across uploaded invoices`,
      });
    }
  });
  return anomalies;
}

function toCanonicalInput(parsedInvoices, parsedCostExplorer = []) {
  const invoiceTotal = round2(parsedInvoices.reduce((acc, i) => acc + Number(i.total_cost || 0), 0));
  const invoiceServices = mergeServiceCosts(parsedInvoices);
  const ceServices = parsedCostExplorer.flatMap((f) => f.service_costs || []);
  const totalFromCE = round2(
    parsedCostExplorer.reduce((acc, f) => {
      const sum = (f.service_costs || []).reduce((a, s) => a + Number(s.monthly_cost || 0), 0);
      return acc + sum;
    }, 0)
  );

  // Use Cost Explorer totals when available, because CE gives more granular billing semantics.
  const total_cost = totalFromCE > 0 ? totalFromCE : invoiceTotal;
  const serviceMap = new Map();
  [...invoiceServices, ...ceServices].forEach((s) => {
    const key = s.service_name;
    const current = serviceMap.get(key) || 0;
    // If CE exists for a service, CE value dominates invoice heuristic.
    serviceMap.set(key, round2(Math.max(current, Number(s.monthly_cost || 0))));
  });
  const services = [...serviceMap.entries()].map(([service_name, monthly_cost]) => ({
    service_name,
    monthly_cost,
  }));
  const accountsMap = new Map();
  const regions = new Set();

  parsedInvoices.forEach((inv) => {
    const acc = inv.account_id || "unknown";
    accountsMap.set(acc, round2((accountsMap.get(acc) || 0) + Number(inv.total_cost || 0)));
    (inv.regions || []).forEach((r) => regions.add(r));
  });

  const accounts = [...accountsMap.entries()].map(([account_id, monthly_cost], idx) => ({
    account_id,
    account_name: `account-${idx + 1}`,
    monthly_cost,
  }));

  const periodHints = parsedInvoices.map((i) => i.period_hint).filter(Boolean);
  const time_period = {
    start: periodHints[0] || "",
    end: periodHints[periodHints.length - 1] || "",
  };

  return {
    customer_id: "uploaded-customer",
    time_period,
    currency: "USD",
    total_cost,
    accounts,
    services,
    commitments: estimateCommitments(parsedCostExplorer, total_cost),
    networking: {
      nat_gateway_cost: 0,
      data_transfer_cost: 0,
    },
    anomalies: detectInvoiceAnomalies(parsedInvoices),
    metadata: {
      source: "pdf-upload",
      files: parsedInvoices.map((i) => i.file_name),
      invoice_count: parsedInvoices.length,
      cost_explorer_files: parsedCostExplorer.map((c) => c.file_name),
      cost_explorer_row_count: parsedCostExplorer.reduce((acc, c) => acc + Number(c.row_count || 0), 0),
      regions: [...regions],
      monthly_breakdown: parsedInvoices.length > 1,
    },
  };
}

function estimateCommitments(parsedCostExplorer, totalCost) {
  if (!parsedCostExplorer.length) {
    return { savings_plans_coverage: 0, reserved_instances: false };
  }
  const purchases = parsedCostExplorer.reduce(
    (acc, f) => {
      const p = f.purchase_options || {};
      acc.ondemand += Number(p.ondemand || 0);
      acc.savingsplans += Number(p.savingsplans || 0);
      acc.reserved += Number(p.reserved || 0);
      return acc;
    },
    { ondemand: 0, savingsplans: 0, reserved: 0 }
  );
  const commitmentSpend = purchases.savingsplans + purchases.reserved;
  const coverage = totalCost > 0 ? round2((commitmentSpend / totalCost) * 100) : 0;
  return {
    savings_plans_coverage: coverage,
    reserved_instances: purchases.reserved > 0,
  };
}

async function analyzeUploadedInvoices(invoiceFiles = [], costExplorerFiles = []) {
  if ((!Array.isArray(invoiceFiles) || invoiceFiles.length === 0) && (!Array.isArray(costExplorerFiles) || costExplorerFiles.length === 0)) {
    throw new Error("Please upload at least one invoice PDF or Cost Explorer CSV.");
  }

  const parsedInvoices = [];
  for (const file of invoiceFiles) {
    if (!file.mimetype.includes("pdf")) {
      throw new Error(`Unsupported file type for ${file.originalname}. Please upload PDF files only.`);
    }
    const parsed = await parseInvoicePdf(file.buffer, file.originalname);
    parsedInvoices.push(parsed);
  }

  const parsedCostExplorer = [];
  for (const file of costExplorerFiles) {
    const isCsv = file.mimetype.includes("csv") || file.originalname.toLowerCase().endsWith(".csv");
    if (!isCsv) {
      throw new Error(`Unsupported Cost Explorer file ${file.originalname}. Please upload CSV files.`);
    }
    parsedCostExplorer.push(parseCostExplorerCsvBuffer(file.buffer, file.originalname));
  }

  const canonicalInput = toCanonicalInput(parsedInvoices, parsedCostExplorer);
  const analysis = analyze(canonicalInput);
  const deepInsights = insightsFromCostExplorer(parsedCostExplorer, canonicalInput.total_cost);

  return {
    uploaded_invoices: parsedInvoices.map((p) => ({
      file_name: p.file_name,
      period_hint: p.period_hint,
      account_id: p.account_id,
      detected_regions: p.regions,
      detected_total_cost: p.total_cost,
      detected_services: p.services,
    })),
    uploaded_cost_explorer: parsedCostExplorer.map((c) => ({
      file_name: c.file_name,
      rows: c.row_count,
      detected_services: c.service_costs,
    })),
    canonical_input: canonicalInput,
    analysis,
    deep_insights: deepInsights,
  };
}

module.exports = {
  analyzeUploadedInvoices,
};
