import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const distDirectory = resolve("dist");
const serviceWorkerPath = join(distDirectory, "service-worker.js");

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

const precacheFiles = collectFiles(distDirectory)
  .filter((path) => path !== serviceWorkerPath)
  .sort();
const precacheUrls = [
  "./",
  ...precacheFiles.map((path) => relative(distDirectory, path).split(sep).join("/")),
].sort();
const buildHash = createHash("sha256").update(JSON.stringify(precacheUrls));
for (const path of precacheFiles) {
  buildHash.update(relative(distDirectory, path)).update(readFileSync(path));
}
const buildId = buildHash.digest("hex").slice(0, 12);
const source = readFileSync(serviceWorkerPath, "utf8");

if (!source.includes('const BUILD_ID = "dev";') || !source.includes("const PRECACHE_URLS = [];")) {
  throw new Error("The service worker is missing its build-time precache placeholders.");
}

const builtServiceWorker = source
  .replace('const BUILD_ID = "dev";', `const BUILD_ID = ${JSON.stringify(buildId)};`)
  .replace("const PRECACHE_URLS = [];", `const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};`);

writeFileSync(serviceWorkerPath, builtServiceWorker);
