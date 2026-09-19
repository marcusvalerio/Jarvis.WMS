// Resolve o alias "@/..." (o mesmo do tsconfig) e imports relativos sem
// extensao quando os modulos TypeScript rodam direto no Node, fora do Next.
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const SRC = pathToFileURL(path.join(process.cwd(), "src") + "/").href;
const CANDIDATES = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];

function firstExisting(base) {
  try {
    if (/\.[a-z]+$/i.test(base) && fs.existsSync(new URL(base))) return base;
  } catch { /* ignore */ }
  for (const ext of CANDIDATES) {
    try {
      if (fs.existsSync(new URL(base + ext))) return base + ext;
    } catch { /* ignore */ }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const found = firstExisting(SRC + specifier.slice(2));
    if (found) return { url: found, shortCircuit: true };
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parent = context.parentURL;
    if (parent && !/\.[a-z]+$/i.test(specifier)) {
      const found = firstExisting(new URL(specifier, parent).href);
      if (found) return { url: found, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
