// Bundles the browser-side Director module (needs the alpha fal client) into web/director.bundle.js.
import esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await esbuild.build({
  entryPoints: [path.join(root, "web-src/director.ts")],
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  platform: "browser",
  outfile: path.join(root, "web/director.bundle.js"),
  logLevel: "warning",
});
console.log("web/director.bundle.js built");
