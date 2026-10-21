const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve("src");
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".html"]);
const patterns = [
  { label: "UTF-8 mojibake: â†", regex: /â†/ },
  { label: "UTF-8 mojibake: â–", regex: /â–/ },
  { label: "UTF-8 mojibake: âŒ", regex: /âŒ/ },
  { label: "UTF-8 mojibake: ï¼", regex: /ï¼/ },
  { label: "UTF-8 mojibake: Â·", regex: /Â·/ },
  { label: "UTF-8 mojibake: Ã followed by a letter", regex: /Ã[A-Za-z]/ },
];

const issues = [];

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      scan(file);
      continue;
    }

    if (!extensions.has(path.extname(entry.name))) continue;

    const content = fs.readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        if (pattern.regex.test(line)) {
          issues.push(`${path.relative(process.cwd(), file)}:${index + 1}: ${pattern.label}`);
        }
      }
    });
  }
}

if (!fs.existsSync(root)) {
  console.error("Character check failed: src directory not found.");
  process.exit(1);
}

scan(root);

if (issues.length) {
  console.error("Character-integrity check failed:");
  for (const issue of issues) console.error(`  ${issue}`);
  process.exit(1);
}

console.log("Character-integrity check passed.");
