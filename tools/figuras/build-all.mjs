// Regenera todas las figuras explicativas en public/figuras (tema oscuro y claro).
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const correr = (archivo, ...args) => execFileSync(process.execPath, [join(HERE, archivo), ...args], { stdio: "inherit" });
correr("obra-4d/build.mjs");
correr("obra-4d/build.mjs", "--light");
for (const f of ["curva-s", "ruta-critica", "caja", "health", "montecarlo", "last-planner"]) correr(`${f}.mjs`);
