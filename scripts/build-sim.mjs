// Bundles the real engine (src/core) with the simulator UI into ONE self-contained HTML file.
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = await esbuild.build({
  entryPoints: [path.join(root, "sim/sim.ts")],
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  platform: "browser",
  write: false,
  logLevel: "warning",
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const template = fs.readFileSync(path.join(root, "sim/template.html"), "utf8");
// a function replacer: the minified engine is full of "$" sequences that String.replace would mangle
const html = template.replace("/*__SIM_JS__*/", () => js);
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/sim.html"), html);
console.log(`dist/sim.html: ${(html.length / 1024).toFixed(0)} KB (engine ${(js.length / 1024).toFixed(0)} KB)`);
