import fs from "node:fs";
import path from "node:path";

const README = "README.md";
const OUT_DIR = "profile/pins";
const STATE_PATH = ".github/pins-state.json";

const startRendered = "<!-- PINS:RENDERED:START -->";
const endRendered = "<!-- PINS:RENDERED:END -->";

const ghToken = process.env.GH_TOKEN;
if (!ghToken) throw new Error("GH_TOKEN missing");

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { repos: {} };
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function parsePins(readme) {
  const lines = readme.split("\n");
  const pins = [];
  for (const line of lines) {
    if (!line.includes("<!-- PIN")) continue;
    const attrs = {};
    for (const m of line.matchAll(/(\w+)="([^"]*)"/g)) attrs[m[1]] = m[2];
    if (!attrs.repo) continue;
    pins.push({
      repo: attrs.repo.trim(),
      title: (attrs.title || "").trim(),
    });
  }
  return pins;
}

async function gh(pathname) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Authorization: `Bearer ${ghToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub API ${res.status} for ${pathname}: ${txt}`);
  }
  return res.json();
}

async function getRepoHeadSha(owner, repo) {
  const repoInfo = await gh(`/repos/${owner}/${repo}`);
  const branch = repoInfo.default_branch;
  const branchInfo = await gh(`/repos/${owner}/${repo}/branches/${branch}`);
  return {
    default_branch: branch,
    sha: branchInfo.commit.sha,
    description: repoInfo.description || "",
    stars: repoInfo.stargazers_count ?? 0,
    forks: repoInfo.forks_count ?? 0,
    issues: repoInfo.open_issues_count ?? 0,
    language: repoInfo.language || "",
  };
}

function esc(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Simple, fully local SVG pin card.
 * (You can style-match your other widgets later; this keeps it reliable.)
 */
function renderSvg({ title, full, description, stars, forks, issues, language }) {
  const w = 495;
  const h = 120;

  const t = title || full;
  const desc = description || "";
  const meta = [
    language ? `● ${language}` : null,
    `★ ${stars}`,
    `⑂ ${forks}`,
    `! ${issues}`,
  ].filter(Boolean).join("   ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(full)}">
  <style>
    .bg { fill: #1a1b27; stroke: #e4e2e2; stroke-opacity: 1; }
    .title { font: 700 16px 'Segoe UI', Ubuntu, Sans-Serif; fill: #70a5fd; }
    .sub { font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: #38bdae; }
    .meta { font: 600 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: #38bdae; opacity: .95; }
  </style>

  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="8" class="bg"/>
  <text x="16" y="32" class="title">${esc(t)}</text>
  <text x="16" y="52" class="sub">${esc(full)}</text>

  <foreignObject x="16" y="62" width="${w - 32}" height="34">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif; color:#38bdae; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
      ${esc(desc)}
    </div>
  </foreignObject>

  <text x="16" y="110" class="meta">${esc(meta)}</text>
</svg>
`;
}

function outName(owner, repo) {
  return `${owner}__${repo}.svg`;
}

function replaceRenderedBlock(readme, html) {
  const re = new RegExp(
    `${escapeRegExp(startRendered)}[\\s\\S]*?${escapeRegExp(endRendered)}`,
    "m"
  );
  if (!re.test(readme)) {
    throw new Error(`Missing markers:\n${startRendered}\n${endRendered}`);
  }
  return readme.replace(re, `${startRendered}\n${html}\n${endRendered}`);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const readme = fs.readFileSync(README, "utf8");
  const pins = parsePins(readme);
  const state = loadState();

  const renderedCards = [];

  for (const pin of pins) {
    const [owner, repo] = pin.repo.split("/");
    if (!owner || !repo) throw new Error(`Bad repo "${pin.repo}"`);

    const info = await getRepoHeadSha(owner, repo);
    const key = `${owner}/${repo}`;
    const prevSha = state.repos?.[key]?.sha;

    const svgPath = path.join(OUT_DIR, outName(owner, repo));

    if (prevSha !== info.sha || !fs.existsSync(svgPath)) {
      const svg = renderSvg({
        title: pin.title,
        full: key,
        description: info.description,
        stars: info.stars,
        forks: info.forks,
        issues: info.issues,
        language: info.language,
      });
      fs.writeFileSync(svgPath, svg, "utf8");
      state.repos[key] = { sha: info.sha, default_branch: info.default_branch };
    }

    // Cache-bust with the *repo head sha*, so it only changes when the repo changes.
    const rawUrl = `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY}/main/${OUT_DIR}/${outName(owner, repo)}`;
    const imgUrl = `${rawUrl}?v=${state.repos[key].sha}`;

    renderedCards.push(
      `\t<a href="https://github.com/${owner}/${repo}" target="_blank">` +
      `\n\t\t<img align="center" src="${imgUrl}" alt="${pin.title ? esc(pin.title) : esc(key)} (${esc(key)})" />` +
      `\n\t</a>`
    );
  }

  const renderedHtml = `<div align="center">\n${renderedCards.join("\n")}\n</div>`;

  const nextReadme = replaceRenderedBlock(readme, renderedHtml);

  fs.writeFileSync(README, nextReadme, "utf8");
  saveState(state);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
