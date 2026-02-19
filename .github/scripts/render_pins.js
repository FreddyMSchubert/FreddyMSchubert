const fs = require("fs");

const README_PATH = "README.md";

const DEFAULT_THEME = "tokyonight";
const DEFAULT_SHOW_OWNER = "true";

function parseAttrs(line) {
  const attrs = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(line))) attrs[m[1]] = m[2];
  return attrs;
}

function makeCard({ repo, title, theme, show_owner }) {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error(`Invalid repo "${repo}" (expected owner/name)`);

  const t = theme || DEFAULT_THEME;
  const so = show_owner ?? DEFAULT_SHOW_OWNER;

  const img = `https://github-readme-stats.vercel.app/api/pin/?username=${encodeURIComponent(
    owner
  )}&repo=${encodeURIComponent(name)}&theme=${encodeURIComponent(t)}&show_owner=${encodeURIComponent(so)}`;

  const link = `https://github.com/${owner}/${name}`;

  const alt = title ? `${title} (${repo})` : repo;

  return `\t<a href="${link}" target="_blank">\n\t\t<img align="center" src="${img}" alt="${alt}" />\n\t</a>`;
}

function main() {
  const readme = fs.readFileSync(README_PATH, "utf8");

  const pinLines = readme
    .split("\n")
    .filter((l) => l.includes("<!-- PIN"))
    .map((l) => parseAttrs(l))
    .filter((a) => a.repo);

  const rendered = [
    `<div align="center">`,
    ...pinLines.map((p) => makeCard(p)),
    `</div>`,
  ].join("\n");

  const start = "<!-- PINS:RENDERED:START -->";
  const end = "<!-- PINS:RENDERED:END -->";

  const re = new RegExp(
    `${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`,
    "m"
  );

  if (!re.test(readme)) {
    throw new Error(`Couldn't find rendered block markers:\n${start}\n${end}`);
  }

  const next = readme.replace(re, `${start}\n${rendered}\n${end}`);
  fs.writeFileSync(README_PATH, next, "utf8");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main();
