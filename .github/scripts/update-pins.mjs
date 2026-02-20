import fs from "node:fs";
import path from "node:path";

const README = "README.md";
const OUT_DIR = "profile/pins";
const MANIFEST_PATH = path.join(OUT_DIR, "pins-manifest.json");
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error("Missing GITHUB_TOKEN");
  process.exit(1);
}

const readme = fs.readFileSync(README, "utf8");

// Extract PIN lines
const pinsBlock = readme.match(/<!-- PINS:START -->([\s\S]*?)<!-- PINS:END -->/);
if (!pinsBlock) {
  console.log("No PINS block found. Exiting.");
  process.exit(0);
}

const pinRe = /<!--\s*PIN\s+repo="([^"]+)"\s+title="([^"]+)"\s*-->/g;
const pins = [];
for (const m of pinsBlock[1].matchAll(pinRe)) {
  pins.push({ repo: m[1], title: m[2] });
}
if (pins.length === 0) {
  console.log("No PIN entries found. Exiting.");
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let manifest = {};
if (fs.existsSync(MANIFEST_PATH)) {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

// GitHub API helper
async function gh(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      Accept: "application/vnd.github+json",
      "User-Agent": "pins-updater",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function getRepoHeadSha(full) {
  const repo = await gh(`https://api.github.com/repos/${full}`);
  const branch = repo.default_branch;
  const ref = await gh(`https://api.github.com/repos/${full}/commits/${encodeURIComponent(branch)}`);
  return ref.sha;
}

function slug(full) {
  return full.replace("/", "__");
}

let changedAny = false;

// Render pins by calling the locally-running github-readme-stats server
// (Started by the workflow at http://127.0.0.1:9000)
async function renderPinSvg({ repo, title }, sha) {
  const [owner, name] = repo.split("/");
  const url =
    `http://127.0.0.1:9000/api/pin/` +
    `?username=${encodeURIComponent(owner)}` +
    `&repo=${encodeURIComponent(name)}` +
    `&show_owner=true` +
    `&theme=tokyonight`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to render ${repo}: ${res.status} ${res.statusText}`);
  const svg = await res.text();

  const outFile = path.join(OUT_DIR, `${slug(repo)}.svg`);
  fs.writeFileSync(outFile, svg, "utf8");

  manifest[repo] = { sha, title, file: `profile/pins/${slug(repo)}.svg` };
  changedAny = true;
}

for (const pin of pins) {
  const sha = await getRepoHeadSha(pin.repo);
  const prev = manifest[pin.repo]?.sha;
  if (prev === sha) {
    console.log(`UNCHANGED ${pin.repo} (${sha.slice(0, 7)})`);
    continue;
  }
  console.log(`CHANGED   ${pin.repo} ${prev ? prev.slice(0, 7) : "—"} -> ${sha.slice(0, 7)}`);
  await renderPinSvg(pin, sha);
}

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");

// Rebuild rendered HTML block (always, so adds new entries even if some unchanged)
const cards = pins
  .map((p) => {
    const info = manifest[p.repo];
    const raw = `https://raw.githubusercontent.com/${process.env.PROFILE_REPO}/main/${info.file}?v=${info.sha}`;
    const href = `https://github.com/${p.repo}`;
    const alt = `${p.title} (${p.repo})`;
    return `\t<a href="${href}" target="_blank">\n\t\t<img align="center" src="${raw}" alt="${alt}" />\n\t</a>`;
  })
  .join("\n");

const rendered = `<div align="center">\n${cards}\n</div>`;

const updated = readme.replace(
  /<!-- PINS:RENDERED:START -->([\s\S]*?)<!-- PINS:RENDERED:END -->/,
  `<!-- PINS:RENDERED:START -->\n${rendered}\n<!-- PINS:RENDERED:END -->`
);

fs.writeFileSync(README, updated, "utf8");

console.log(changedAny ? "Pins updated." : "No pin SVG changes needed.");
