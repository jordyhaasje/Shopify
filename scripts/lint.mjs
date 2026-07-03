import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const roots = ["packages", "docs", "skills", "scripts"];
const allowedExtensions = new Set([".ts", ".md", ".json", ".mjs", ".yaml"]);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

function extension(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

const failures = [];
for (const root of roots) {
  for (const file of await listFiles(root)) {
    if (!allowedExtensions.has(extension(file))) continue;
    const content = await readFile(file, "utf8");
    if (content.includes("\t")) failures.push(`${file}: contains tabs`);
    if (!content.endsWith("\n")) failures.push(`${file}: missing final newline`);
    content.split("\n").forEach((line, index) => {
      if (/[ \t]$/.test(line)) failures.push(`${file}:${index + 1}: trailing whitespace`);
    });
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("lint ok");
