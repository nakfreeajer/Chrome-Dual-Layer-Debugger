#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

function fail(code) {
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}

const args = process.argv.slice(2);
if (args.length !== 4 || args.some((value) => value.length === 0)) {
  fail('USAGE: run.mjs <cdld-cli-entry> <suite-file> <left-result> <right-result>');
} else {
  const [cliArgument, suitePath, leftResultPath, rightResultPath] = args;
  const cliPath = resolve(cliArgument);
  let cliIsFile = false;
  try {
    cliIsFile = statSync(cliPath).isFile();
  } catch {
    cliIsFile = false;
  }

  if (!cliIsFile) {
    fail('CDLD_CLI_PATH_INVALID');
  } else {
    const child = spawnSync(process.execPath, [cliPath, 'suite', 'compare', '--suite', suitePath,
      '--left-result', leftResultPath, '--right-result', rightResultPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 64 * 1024
    });

    if (child.error || child.signal || child.status === null) {
      fail('CDLD_CLI_PROCESS_FAILED');
    } else {
      let comparison;
      try {
        comparison = JSON.parse(child.stdout.trim());
      } catch {
        comparison = undefined;
      }

      if (child.status === 0 && comparison?.status === 'PASS') {
        process.stdout.write('{"status":"PASS","exitCode":0}\n');
        process.exitCode = 0;
      } else if (child.status === 2 && (comparison?.status === 'FAIL' || comparison?.status === 'NOT_COMPARABLE')) {
        process.stdout.write(`{"status":"FAIL","comparisonStatus":"${comparison.status}","exitCode":2}\n`);
        process.exitCode = 2;
      } else {
        fail('CDLD_CLI_RESULT_UNEXPECTED');
      }
    }
  }
}
