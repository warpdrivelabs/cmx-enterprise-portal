#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const metadataDir = path.join(projectRoot, "src", "metadata");
const tagsDir = path.join(metadataDir, "tags");
const indexPath = path.join(metadataDir, "tag-index.json");
const indexHtmlPath = path.join(projectRoot, "index.html");
const mainJsPath = path.join(projectRoot, "src", "main.js");
const reportPath = path.join(projectRoot, "tools", "sync-report.json");

const MODULE_ALIAS = {
  "ui5-checkbox": { pkg: "@ui5/webcomponents", mod: "CheckBox" },
  "ui5-combobox": { pkg: "@ui5/webcomponents", mod: "ComboBox" },
  "ui5-multi-combobox": { pkg: "@ui5/webcomponents", mod: "MultiComboBox" },
  "ui5-shellbar": { pkg: "@ui5/webcomponents-fiori", mod: "ShellBar" },
  "ui5-tabcontainer": { pkg: "@ui5/webcomponents", mod: "TabContainer" },
  "ui5-textarea": { pkg: "@ui5/webcomponents", mod: "TextArea" },
  "ui5-li": { pkg: "@ui5/webcomponents", mod: "ListItemStandard" },
  "ui5-cb-item": { pkg: "@ui5/webcomponents", mod: "ComboBoxItem" },
  "ui5-mcb-item": { pkg: "@ui5/webcomponents", mod: "MultiComboBoxItem" }
};

function toPascalCase(tag) {
  return tag
    .replace(/^ui5-/, "")
    .split("-")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

function inferModule(tag) {
  if (!tag.startsWith("ui5-")) return null;
  if (MODULE_ALIAS[tag]) return MODULE_ALIAS[tag];

  const pkg = [
    "ui5-shellbar",
    "ui5-side-navigation",
    "ui5-side-navigation-item",
    "ui5-side-navigation-sub-item",
    "ui5-page",
    "ui5-media-gallery",
    "ui5-media-gallery-item",
    "ui5-product-switch",
    "ui5-product-switch-item",
    "ui5-notification-list",
    "ui5-notification-list-item",
    "ui5-notification-action",
    "ui5-timeline",
    "ui5-timeline-item",
    "ui5-flexible-column-layout",
    "ui5-user-menu",
    "ui5-user-menu-item"
  ].includes(tag)
    ? "@ui5/webcomponents-fiori"
    : "@ui5/webcomponents";

  return { pkg, mod: toPascalCase(tag) };
}

async function walkJsonFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkJsonFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      out.push(full);
    }
  }
  return out;
}

async function buildTagIndex() {
  const files = await walkJsonFiles(tagsDir);
  const byTag = new Map();

  for (const file of files) {
    const raw = await fs.readFile(file, "utf-8");
    const data = JSON.parse(raw);
    if (!data?.tag) continue;

    const rel = path.relative(tagsDir, file).replaceAll(path.sep, "/");
    // 同名标签优先保留 fiori 路径
    const existing = byTag.get(data.tag);
    if (!existing || rel.startsWith("fiori/")) {
      byTag.set(data.tag, { tag: data.tag, path: rel });
    }
  }

  return [...byTag.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

async function parseImportedModules() {
  const html = await fs.readFile(indexHtmlPath, "utf-8");
  const regex =
    /import\s+"https:\/\/unpkg\.com\/(@ui5\/webcomponents(?:-fiori)?)\/dist\/([^"]+)\.js\?module";/g;
  const imported = new Set();
  let match;
  while ((match = regex.exec(html)) !== null) {
    imported.add(`${match[1]}/${match[2]}`);
  }
  return imported;
}

async function detectBundleMode() {
  try {
    const mainJs = await fs.readFile(mainJsPath, "utf-8");
    const hasUi5Bundle = mainJs.includes("@ui5/webcomponents/dist/bundle.esm.js");
    const hasFioriBundle = mainJs.includes("@ui5/webcomponents-fiori/dist/bundle.esm.js");
    return hasUi5Bundle && hasFioriBundle;
  } catch {
    return false;
  }
}

async function fixImports(missingStatements) {
  if (!missingStatements.length) return false;
  const html = await fs.readFile(indexHtmlPath, "utf-8");
  const blockRegex = /<script type="module">([\s\S]*?)<\/script>/;
  const match = html.match(blockRegex);
  if (!match) {
    throw new Error("index.html 未找到可写入的 <script type=\"module\"> 导入区块");
  }

  const currentBlock = match[1];
  const importRegex = /^\s*import\s+"https:\/\/unpkg\.com\/@ui5\/webcomponents(?:-fiori)?\/dist\/[^"]+\.js\?module";\s*$/gm;
  const currentImports = (currentBlock.match(importRegex) || []).map((s) => s.trim());
  const merged = [...new Set([...currentImports, ...missingStatements])].sort((a, b) => a.localeCompare(b));
  const newBlock = `\n      ${merged.join("\n      ")}\n    `;
  const newHtml = html.replace(blockRegex, `<script type="module">${newBlock}</script>`);
  await fs.writeFile(indexHtmlPath, newHtml, "utf-8");
  return true;
}

async function main() {
  const shouldFix = process.argv.includes("--fix-imports");
  const shouldReport = process.argv.includes("--report");
  const index = await buildTagIndex();
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
  console.log(`已同步 tag-index.json，标签数量: ${index.length}`);

  const imported = await parseImportedModules();
  const bundleMode = await detectBundleMode();
  const ui5Tags = index.map((i) => i.tag).filter((t) => t.startsWith("ui5-"));

  const missing = [];
  const missingStatements = [];
  const report = [];
  for (const tag of ui5Tags) {
    const mod = inferModule(tag);
    if (!mod) continue;
    const key = `${mod.pkg}/${mod.mod}`;
    const statement = `import "https://unpkg.com/${mod.pkg}/dist/${mod.mod}.js?module";`;
    const importedOk = bundleMode ? true : imported.has(key);
    report.push({
      tag,
      package: mod.pkg,
      module: mod.mod,
      importKey: key,
      importStatement: statement,
      imported: importedOk
    });
    if (!importedOk) {
      missing.push({
        tag,
        statement
      });
      missingStatements.push(statement);
    }
  }

  if (bundleMode) {
    console.log("检测到 Vite bundle 模式（main.js 使用 UI5/Fiori bundle），跳过逐组件导入缺失检查。");
  } else if (!missing.length) {
    console.log("UI5/Fiori 模块导入检查通过，无缺失。");
  } else {
    console.log(`发现缺失导入: ${missing.length}`);
    for (const item of missing) {
      console.log(`- ${item.tag}`);
      console.log(`  ${item.statement}`);
    }

    if (shouldFix) {
      const changed = await fixImports(missingStatements);
      if (changed) {
        console.log("已自动写入缺失导入到 index.html");
      }
    } else {
      console.log("可加参数 --fix-imports 自动写入缺失导入。");
    }
  }

  if (shouldReport) {
    const payload = {
      generatedAt: new Date().toISOString(),
      bundleMode,
      totalUi5Tags: report.length,
      missingCount: report.filter((x) => !x.imported).length,
      items: report.sort((a, b) => a.tag.localeCompare(b.tag))
    };
    await fs.writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    console.log(`已生成导入报告: ${path.relative(projectRoot, reportPath)}`);
  }
}

main().catch((err) => {
  console.error("同步失败:", err.message);
  process.exit(1);
});

