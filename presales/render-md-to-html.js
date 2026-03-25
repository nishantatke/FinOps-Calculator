const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slug(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function renderMarkdownFile(mdPath, outDir) {
  const raw = fs.readFileSync(mdPath, "utf8");
  const htmlBody = marked.parse(raw);
  const title = path.basename(mdPath, path.extname(mdPath));

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    :root { --bg: #f6f9f7; --ink: #10211b; --card: #ffffff; --muted: #41584e; --line: #d8e5dd; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: 'Segoe UI', Tahoma, sans-serif; }
    .page { max-width: 1200px; margin: 24px auto; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 30px; }
    h1,h2,h3 { color: #0c4d36; margin-top: 24px; }
    p, li { line-height: 1.5; }
    pre { background: #101820; color: #dce7f7; padding: 12px; border-radius: 8px; overflow: auto; }
    code { font-family: Consolas, monospace; }
    hr { border: 0; border-top: 1px solid var(--line); margin: 24px 0; }
    .mermaid { background: #fff; border: 1px solid #dbe8e0; border-radius: 10px; padding: 8px; }
  </style>
</head>
<body>
  <div class="page">${htmlBody}</div>
  <script type="module">
    import mermaid from '../node_modules/mermaid/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'default', securityLevel: 'loose' });
  </script>
</body>
</html>`;

  const outPath = path.join(outDir, `${slug(title)}.html`);
  fs.writeFileSync(outPath, html, "utf8");
  return outPath;
}

function main() {
  const baseDir = __dirname;
  const outDir = path.join(baseDir, ".render");
  ensureDir(outDir);

  const files = [
    "COST_OPTIMIZATION_ARCHITECTURE_AND_ALGORITHM.md",
    "FINOPS_ONE_PAGER_VISUAL.md",
  ];

  const created = files.map((f) => renderMarkdownFile(path.join(baseDir, f), outDir));
  console.log(JSON.stringify(created, null, 2));
}

main();

