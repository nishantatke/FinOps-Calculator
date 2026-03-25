const express = require("express");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const { analyze } = require("./src/finops/analyze");
const { normalizeInput, sampleInputSchema } = require("./src/finops/normalize");
const { analyzeUploadedInvoices } = require("./src/invoice/pipeline");
const { buildAssessmentWorkbook } = require("./src/invoice/excelExport");

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 20 },
});
const reportCache = new Map();

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "presales-finops",
    mode: "rule-engine-first",
    time: new Date().toISOString(),
  });
});

app.get("/api/schema", (_req, res) => {
  res.json({
    description: "Canonical AWS billing ingestion schema used by the assessment engine",
    sample_payload: sampleInputSchema(),
  });
});

app.post("/api/normalize", (req, res) => {
  try {
    const normalized = normalizeInput(req.body || {});
    res.json(normalized);
  } catch (error) {
    res.status(400).json({
      error: "Normalization failed",
      details: String(error.message || error),
    });
  }
});

app.post("/api/analyze", (req, res) => {
  try {
    res.json(analyze(req.body || {}));
  } catch (error) {
    res.status(400).json({
      error: "Analysis failed",
      details: String(error.message || error),
    });
  }
});

app.post("/api/assess", (req, res) => {
  try {
    const output = analyze(req.body || {});
    res.json(output.report);
  } catch (error) {
    res.status(400).json({
      error: "Assessment failed",
      details: String(error.message || error),
    });
  }
});

app.post(
  "/api/invoices/analyze",
  upload.fields([
    { name: "invoices", maxCount: 20 },
    { name: "costExplorer", maxCount: 10 },
    { name: "cost_explorer", maxCount: 10 },
  ]),
  async (req, res) => {
  try {
      const files = req.files || {};
      const invoiceFiles = files.invoices || [];
      const costExplorerFiles = [...(files.costExplorer || []), ...(files.cost_explorer || [])];
      const result = await analyzeUploadedInvoices(invoiceFiles, costExplorerFiles);
    const reportId = crypto.randomUUID();
    reportCache.set(reportId, {
      created_at: Date.now(),
      result,
    });
    res.json({
      report_id: reportId,
      ...result,
    });
  } catch (error) {
    res.status(400).json({
      error: "Invoice analysis failed",
      details: String(error.message || error),
    });
  }
  }
);

app.get("/api/invoices/export/:reportId", async (req, res) => {
  try {
    const cached = reportCache.get(req.params.reportId);
    if (!cached) {
      return res.status(404).json({
        error: "Report not found",
        details: "Please run invoice analysis again and export using the returned report_id.",
      });
    }
    const excelBuffer = await buildAssessmentWorkbook(cached.result);
    const fileName = `finops-assessment-${req.params.reportId.slice(0, 8)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);
    return res.send(Buffer.from(excelBuffer));
  } catch (error) {
    return res.status(500).json({
      error: "Excel export failed",
      details: String(error.message || error),
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Presales FinOps app running at http://localhost:${PORT}`);
});
