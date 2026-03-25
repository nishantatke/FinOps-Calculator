const ExcelJS = require("exceljs");

function styleHeader(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
}

function autoWidth(sheet) {
  sheet.columns.forEach((column) => {
    let max = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const len = String(cell.value || "").length;
      if (len > max) max = len;
    });
    column.width = Math.min(max + 2, 60);
  });
}

function scoreValue(label) {
  const map = { High: 3, Medium: 2, Low: 1, Easy: 3, "Mid-Term": 2, Strategic: 1 };
  return map[label] || 1;
}

async function buildAssessmentWorkbook(uploadResult) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Presales FinOps Engine";
  workbook.created = new Date();

  const summary = uploadResult.analysis.report.executive_summary;
  const confidence = uploadResult.analysis.confidence_model;
  const savings = uploadResult.analysis.report.savings_summary;

  const wsSummary = workbook.addWorksheet("Executive Summary");
  wsSummary.addRow(["Metric", "Value"]);
  styleHeader(wsSummary.getRow(1));
  wsSummary.addRows([
    ["Estimated Monthly Spend (USD)", summary.estimated_monthly_spend],
    ["Estimated Savings Before Confidence (USD)", summary.estimated_savings_before_confidence],
    ["Confidence Dampening Factor", summary.confidence_dampening_factor],
    ["Low Confidence Penalty Applied", summary.low_confidence_penalty_applied ? "Yes" : "No"],
    ["Potential Savings (USD)", summary.potential_savings],
    ["Potential Savings (%)", summary.potential_savings_percent],
    ["Savings Range Min (USD)", summary.potential_savings_range.min],
    ["Savings Range Max (USD)", summary.potential_savings_range.max],
    ["Confidence Level", summary.confidence_level],
    ["Confidence Score", confidence.score],
    ["Top Optimization Areas", summary.key_optimization_areas.join(", ")],
  ]);
  autoWidth(wsSummary);

  const wsDrivers = workbook.addWorksheet("Cost Drivers");
  wsDrivers.addRow(["Service", "Monthly Cost", "% of Total", "Observation"]);
  styleHeader(wsDrivers.getRow(1));
  uploadResult.analysis.report.key_cost_drivers.forEach((d) => {
    wsDrivers.addRow([d.service, d.monthly_cost, d.percent_of_total, d.observation]);
  });
  autoWidth(wsDrivers);

  const wsFindings = workbook.addWorksheet("Optimization Findings");
  wsFindings.addRow([
    "Finding ID",
    "Category",
    "Type",
    "Priority",
    "Rule",
    "Rationale",
    "Savings Min",
    "Savings Max",
    "Confidence",
  ]);
  styleHeader(wsFindings.getRow(1));
  uploadResult.analysis.rule_findings.forEach((f) => {
    wsFindings.addRow([
      f.id,
      f.category,
      f.type,
      f.priority,
      f.rule,
      f.rationale,
      f.estimated_savings_range_usd.min,
      f.estimated_savings_range_usd.max,
      f.confidence,
    ]);
  });
  autoWidth(wsFindings);

  const wsInvoices = workbook.addWorksheet("Parsed Invoices");
  wsInvoices.addRow(["File", "Period", "Account", "Detected Total", "Regions"]);
  styleHeader(wsInvoices.getRow(1));
  uploadResult.uploaded_invoices.forEach((inv) => {
    wsInvoices.addRow([
      inv.file_name,
      inv.period_hint,
      inv.account_id,
      inv.detected_total_cost,
      (inv.detected_regions || []).join(", "),
    ]);
  });
  autoWidth(wsInvoices);

  const wsSavings = workbook.addWorksheet("Savings Breakdown");
  wsSavings.addRow(["Category", "Min", "Max"]);
  styleHeader(wsSavings.getRow(1));
  const byCategory = savings.by_category || {};
  Object.keys(byCategory).forEach((k) => {
    wsSavings.addRow([k, byCategory[k].min || 0, byCategory[k].max || 0]);
  });
  wsSavings.addRow(["Total (Base)", savings.monthly_savings_usd, savings.monthly_savings_usd]);
  wsSavings.addRow([
    "Total Range",
    savings.monthly_savings_range_usd.min,
    savings.monthly_savings_range_usd.max,
  ]);
  autoWidth(wsSavings);

  const wsDeep = workbook.addWorksheet("Deep Insights");
  wsDeep.addRow([
    "Optimization Area",
    "What to Detect",
    "Why Cost Is High",
    "FinOps Action",
    "Typical Savings %",
    "Detection Logic",
    "Records Flagged",
    "Estimated Impact Cost (USD)",
    "Previous Period",
    "Current Period",
    "Previous Cost (USD)",
    "Current Cost (USD)",
    "Change (%)",
    "Trend",
    "Opportunity Signal",
    "Impact",
    "Ease",
    "Execution Horizon",
    "Potential Savings Min (USD)",
    "Potential Savings Max (USD)",
    "Priority",
    "Confidence",
    "Insight",
  ]);
  styleHeader(wsDeep.getRow(1));
  (uploadResult.deep_insights || []).forEach((d) => {
    wsDeep.addRow([
      d.header,
      d.what_to_detect || "",
      d.why_cost_is_high || "",
      d.finops_action || "",
      d.typical_savings_potential_percent || "",
      d.detection_logic || "",
      d.records_flagged,
      d.estimated_impact_cost_usd,
      d.trend?.previous_period || "",
      d.trend?.current_period || "",
      d.trend?.previous_period_cost_usd || 0,
      d.trend?.current_period_cost_usd || 0,
      d.trend?.change_percent || 0,
      d.trend?.direction || "unknown",
      d.opportunity_signal || "Medium",
      d.impact || "",
      d.ease_of_execution || "",
      d.execution_horizon || "",
      d.potential_savings_range_usd?.min || 0,
      d.potential_savings_range_usd?.max || 0,
      d.priority || "Medium",
      d.confidence || "Medium",
      d.insight || "",
    ]);
  });
  autoWidth(wsDeep);

  const wsCe = workbook.addWorksheet("Cost Explorer Input");
  wsCe.addRow(["File", "Rows", "Detected Services"]);
  styleHeader(wsCe.getRow(1));
  (uploadResult.uploaded_cost_explorer || []).forEach((c) => {
    wsCe.addRow([
      c.file_name,
      c.rows,
      (c.detected_services || [])
        .sort((a, b) => Number(b.monthly_cost || 0) - Number(a.monthly_cost || 0))
        .slice(0, 10)
        .map((s) => `${s.service_name}: ${s.monthly_cost}`)
        .join("; "),
    ]);
  });
  autoWidth(wsCe);

  const wsMatrix = workbook.addWorksheet("Scoring Matrix");
  wsMatrix.addRow([
    "Optimization Area",
    "Impact",
    "Ease",
    "Opportunity Signal",
    "Execution Horizon",
    "Weighted Priority Score",
    "Suggested Sequence",
  ]);
  styleHeader(wsMatrix.getRow(1));

  const matrixRows = (uploadResult.deep_insights || []).map((d) => {
    const impact = d.impact || "Medium";
    const ease = d.ease_of_execution || "Medium";
    const signal = d.opportunity_signal || "Medium";
    const horizon = d.execution_horizon || "Mid-Term";
    // Weighted matrix: 40% impact, 30% ease, 30% signal.
    const weightedScore = Math.round(
      (scoreValue(impact) * 0.4 + scoreValue(ease) * 0.3 + scoreValue(signal) * 0.3) * 100
    ) / 100;
    return {
      header: d.header,
      impact,
      ease,
      signal,
      horizon,
      weightedScore,
    };
  });

  const sortedMatrix = matrixRows.sort((a, b) => b.weightedScore - a.weightedScore);
  sortedMatrix.forEach((r, idx) => {
    wsMatrix.addRow([
      r.header,
      r.impact,
      r.ease,
      r.signal,
      r.horizon,
      r.weightedScore,
      idx + 1,
    ]);
  });
  autoWidth(wsMatrix);

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  buildAssessmentWorkbook,
};
