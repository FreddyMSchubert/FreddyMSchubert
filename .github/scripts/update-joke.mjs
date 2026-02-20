import fs from "node:fs";

const README = "README.md";

const readme = fs.readFileSync(README, "utf8");

const jokeBlock = readme.match(/<!-- JOKE:START -->([\s\S]*?)<!-- JOKE:END -->/);
if (!jokeBlock) {
  console.log("No JOKE block found. Exiting.");
  process.exit(0);
}

const url = "https://github.com/ABSphreak/readme-jokes/blob/master/src/jokes.json?raw=true";
const res = await fetch(url, {
  headers: {
    "User-Agent": "node",
    "Accept": "application/json",
  },
});
if (!res.ok) {
  console.error(`Failed to fetch jokes.json: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const jokesJson = await res.json();

const keys = Object.keys(jokesJson);
const key = keys[Math.floor(Math.random() * keys.length)];
const jokeJson = jokesJson[key];

let joke = "<em>Daily random joke: </em>";

if (typeof jokeJson === "string") {
  joke += jokeJson;
} else if (jokeJson && typeof jokeJson === "object" && jokeJson.form === "qa") {
  joke += `<strong>Q:</strong> ${jokeJson.q}\n\n<strong>A:</strong> ${jokeJson.a}`;
} else {
  console.error("Unknown joke format", jokeJson);
  process.exit(1);
}

const updated = readme.replace(
  /<!-- JOKE:START -->([\s\S]*?)<!-- JOKE:END -->/,
  `<!-- JOKE:START -->\n${joke}\n<!-- JOKE:END -->`
);

fs.writeFileSync(README, updated, "utf8");
console.log("Joke updated.");
