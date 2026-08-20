import { runScheduleSelfChecks } from "./run-checks";

try {
  const result = runScheduleSelfChecks();
  console.log(`schedule-checks: ${result}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
