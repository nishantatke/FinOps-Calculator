const pdfParseModule = require("pdf-parse");
const { round2 } = require("../finops/utils");

const SERVICE_PATTERNS = [
  { key: "EC2", match: /(?:amazon\s+)?(?:ec2|elastic compute cloud)/i },
  { key: "S3", match: /(?:amazon\s+)?s3|simple storage service/i },
  { key: "RDS", match: /(?:amazon\s+)?rds|relational database service/i },
  { key: "DynamoDB", match: /dynamodb/i },
  { key: "EBS", match: /(?:amazon\s+)?ebs|elastic block store/i },
  { key: "EKS", match: /(?:amazon\s+)?eks|elastic kubernetes service/i },
  { key: "ECS", match: /(?:amazon\s+)?ecs|elastic container service/i },
  { key: "Lambda", match: /aws\s+lambda|lambda/i },
  { key: "CloudFront", match: /cloudfront/i },
  { key: "NAT Gateway", match: /nat gateway/i },
  { key: "Data Transfer", match: /data transfer|data xfer|bandwidth/i },
  { key: "CloudWatch", match: /cloudwatch/i },
  { key: "Route 53", match: /route\s*53/i },
];

function parseMoney(text) {
  if (!text) return 0;
  const cleaned = String(text).replace(/[$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function extractAmounts(line) {
  const matches = line.match(/[$]?\d{1,3}(?:,\d{3})*(?:\.\d{2})|[$]?\d+(?:\.\d{2})/g);
  if (!matches) return [];
  return matches.map(parseMoney).filter((v) => v > 0);
}

function extractTotalCost(text) {
  const candidates = [
    ...collectAmountMatches(
      text,
      /total\s+amount\s+due(?:\s+on\s+.*?)?\s+usd\s*([\d,]+\.\d{2})/gi
    ),
    ...collectAmountMatches(text, /total\s+for\s+this\s+invoice\s+usd\s*([\d,]+\.\d{2})/gi),
    ...collectAmountMatches(text, /aws\s+service\s+charges\s+usd\s*([\d,]+\.\d{2})/gi),
    ...collectAmountMatches(text, /invoice\s+total(?:\s+usd)?\s*([\d,]+\.\d{2})/gi),
    ...collectAmountMatches(text, /\btotal\b[\w\s]{0,30}usd\s*([\d,]+\.\d{2})/gi),
  ];
  for (const value of candidates) {
    if (value > 0) return value;
  }
  return 0;
}

function collectAmountMatches(text, regex) {
  const values = [];
  let match = regex.exec(text);
  while (match) {
    values.push(parseMoney(match[1]));
    match = regex.exec(text);
  }
  return values;
}

function extractRegions(text) {
  const regionRegex = /\b(?:us|eu|ap|sa|ca|me|af)-(?:north|south|east|west|central|southeast|northeast|southwest)-\d\b/g;
  const regions = text.match(regionRegex) || [];
  return [...new Set(regions)];
}

function extractAccountId(text) {
  const accountMatch = text.match(/\b\d{12}\b/);
  return accountMatch ? accountMatch[0] : "unknown";
}

function extractServiceCosts(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const services = new Map();

  lines.forEach((line) => {
    const lower = line.toLowerCase();
    if (
      lower.startsWith("charges ") ||
      lower.startsWith("discount ") ||
      lower.startsWith("credits ") ||
      lower.startsWith("tax ") ||
      lower.startsWith("vat ") ||
      lower.startsWith("gst ") ||
      lower.startsWith("estimated ") ||
      lower.startsWith("ct ")
    ) {
      return;
    }
    if (!/\busd\b/i.test(line)) return;

    const amounts = extractAmounts(line);
    if (!amounts.length) return;
    const amount = amounts[amounts.length - 1];

    for (const pattern of SERVICE_PATTERNS) {
      if (pattern.match.test(line)) {
        services.set(pattern.key, round2((services.get(pattern.key) || 0) + amount));
        return;
      }
    }
  });

  return [...services.entries()].map(([service_name, monthly_cost]) => ({
    service_name,
    monthly_cost,
  }));
}

function extractPeriodHint(fileName, text) {
  const fromName = String(fileName || "").match(
    /(20\d{2})[-_ ]?(0[1-9]|1[0-2])|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_ ]?(20\d{2})/i
  );
  if (fromName) return fromName[0];

  const fromText = text.match(
    /(bill(?:ing)?\s+period|invoice\s+date)[:\s-]*([a-z]{3,9}\s+\d{1,2},?\s+20\d{2}|20\d{2}[-/]\d{2}[-/]\d{2})/i
  );
  return fromText ? fromText[2] : "";
}

async function parseInvoicePdf(buffer, fileName) {
  const text = await extractTextFromPdf(buffer);

  const services = extractServiceCosts(text);
  const totalFromHeader = extractTotalCost(text);
  const serviceSum = services.reduce((acc, s) => acc + s.monthly_cost, 0);
  const total_cost = round2(totalFromHeader || serviceSum);

  return {
    file_name: fileName || "invoice.pdf",
    period_hint: extractPeriodHint(fileName, text),
    account_id: extractAccountId(text),
    regions: extractRegions(text),
    total_cost,
    services,
    raw_text_excerpt: text.slice(0, 1500),
  };
}

async function extractTextFromPdf(buffer) {
  // pdf-parse v2 API: new PDFParse({ data }).getText()
  if (pdfParseModule && typeof pdfParseModule.PDFParse === "function") {
    const parser = new pdfParseModule.PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result && result.text ? String(result.text) : "";
    } finally {
      // Always destroy parser to free resources.
      await parser.destroy();
    }
  }

  // Backward-compat fallback for pdf-parse v1 style API.
  if (typeof pdfParseModule === "function") {
    const parsed = await pdfParseModule(buffer);
    return parsed && parsed.text ? String(parsed.text) : "";
  }

  throw new Error("Unsupported pdf-parse module format. Expected PDFParse class or function export.");
}

module.exports = {
  parseInvoicePdf,
};
