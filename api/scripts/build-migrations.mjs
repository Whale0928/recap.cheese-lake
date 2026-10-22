import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import ts from "typescript";

const source = process.env.RECAP_MIGRATIONS_SOURCE ?? fileURLToPath(new URL("../../module.secrets/project/cheese-lake/recap/db/migrations/", import.meta.url));
const stage = fileURLToPath(new URL("../.migration-build/", import.meta.url));
const output = fileURLToPath(new URL("../dist/database/migrations/", import.meta.url));
let names;
try {
  names = (await readdir(source)).filter(name => /^\d{13}-.+\.ts$/.test(name)).sort();
} catch (error) {
  if (error.code !== "ENOENT" || process.env.RECAP_MIGRATIONS_SOURCE || !process.argv.includes("--if-present")) throw error;
  await rm(output, { recursive: true, force: true });
  console.warn("Migration source unavailable; initialize module.secrets before building a database-enabled image.");
  process.exit(0);
}
if (!names.length) throw new Error("No TypeORM migrations found");
await rm(stage, { recursive: true, force: true });
await rm(output, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
try {
  for (const name of names) await cp(join(source, name), join(stage, name));
  const program = ts.createProgram(names.map(name => join(stage, name)), {
    target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, skipLibCheck: true, noEmitOnError: true, rootDir: stage, outDir: output,
  });
  const result = program.emit();
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics];
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: path => path, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n",
  }));
  console.log(`Compiled ${names.length} TypeORM migration(s)`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
