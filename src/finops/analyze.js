const { normalizeInput } = require("./normalize");
const { runRuleEngine } = require("./rules");
const { calculateConfidence, buildSavingsSummary } = require("./scoring");
const { buildReport } = require("./report");

function analyze(rawInput = {}) {
  const normalized = normalizeInput(rawInput);
  const ruleFindings = runRuleEngine(normalized);
  const confidence = calculateConfidence(normalized, ruleFindings);
  const savings = buildSavingsSummary(normalized, ruleFindings, confidence);
  const report = buildReport(normalized, ruleFindings, confidence, savings);

  return {
    normalized_data: normalized,
    rule_findings: ruleFindings,
    confidence_model: confidence,
    report,
  };
}

module.exports = {
  analyze,
};
