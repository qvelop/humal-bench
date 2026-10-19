'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const CoffeeScript = require('coffeescript');
const { compile: compileCivet } = require('@danielx/civet');
const imbaModule = require('imba/compiler');

const { compile: compileHumal } = require('./humal/src/compiler.js');
const compileImba =
  typeof imbaModule.compile === 'function'
    ? imbaModule.compile
    : typeof imbaModule.default?.compile === 'function'
      ? imbaModule.default.compile
      : null;

if (typeof compileImba !== 'function') {
  throw new Error(
    'Cannot find compile() in require("imba/compiler"). ' +
    'Check your installed Imba version and compiler API.'
  );
}

const candidates = path.join(__dirname, 'candidates');
const localRequire = createRequire(path.join(__dirname, 'package.json'));

const humalPackage = require('./humal/package.json');
function packageVersion(name, entryPath) {
  let dir = path.dirname(entryPath);

  while (true) {
    const packageFile = path.join(dir, 'package.json');

    if (fs.existsSync(packageFile)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));

        if (pkg.name === name) {
          return pkg.version || 'unknown';
        }
      } catch {
      }
    }

    const parent = path.dirname(dir);

    if (parent === dir) {
      return 'unknown';
    }

    dir = parent;
  }
}

const versions = {
  Humal: humalPackage.version,
  CoffeeScript: packageVersion('coffeescript', require.resolve('coffeescript')),
  TypeScript: ts.version,
  Civet: packageVersion('@danielx/civet', require.resolve('@danielx/civet')),
  Imba: packageVersion('imba', require.resolve('imba/compiler'))
};

function printEnvironment() {
  console.log('Benchmark environment');

  for (const [name, version] of Object.entries(versions)) {
    console.log(`${name}: ${version}`);
  }

  console.log('Node.js:', process.version);
  console.log('OS:', `${os.platform()} ${os.release()} ${os.arch()}`);
  console.log('CPU:', os.cpus()[0]?.model || 'unknown');
  console.log('CPU cores:', os.cpus().length);
  console.log();
}

function readcandidates(name, extension) {
  const filename = path.join(candidates, `${name}.${extension}`);

  if (!fs.existsSync(filename)) {
    throw new Error(`Missing benchmark source: ${filename}`);
  }

  return {
    filename,
    source: fs.readFileSync(filename, 'utf8')
  };
}

function requireJavaScript(result, compilerName) {
  if (result && typeof result.then === 'function') {
    throw new Error(
      `${compilerName} returned a Promise. ` +
      'This benchmark expects synchronous compilation.'
    );
  }

  if (typeof result !== 'string') {
    throw new Error(
      `${compilerName} did not return JavaScript text. ` +
      `Received: ${typeof result}`
    );
  }

  return result;
}

function compileTypeScript(source, filename, diagnostics = false) {
  const result = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: diagnostics,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      sourceMap: false,
      inlineSourceMap: false
    }
  });

  if (diagnostics) {
    const errors = (result.diagnostics || []).filter(
      diagnostic => diagnostic.category === ts.DiagnosticCategory.Error
    );

    if (errors.length > 0) {
      const message = errors
        .map(diagnostic =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        )
        .join('\n');

      throw new Error(`TypeScript diagnostics:\n${message}`);
    }
  }

  return result.outputText;
}

function compileCivetSource(source) {
  return requireJavaScript(
    compileCivet(source, { js: true, sync: true, inlineMap: false }),
    'Civet'
  );
}

function extractImbaJavaScript(result) {
  if (typeof result === 'string') {
    return result;
  }

  if (!result || typeof result !== 'object') {
    throw new Error('Imba returned an unexpected compiler result.');
  }

  if (Array.isArray(result.errors) && result.errors.length > 0) {
    const messages = result.errors.map(error =>
      typeof error === 'string'
        ? error
        : error?.message || JSON.stringify(error)
    );

    throw new Error(`Imba compilation errors:\n${messages.join('\n')}`);
  }

  const candidates = [
    result.code,
    result.js,
    result.outputText,
    result.output,
    result.text
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      return candidate;
    }

    if (candidate && typeof candidate === 'object') {
      for (const key of ['code', 'js', 'outputText', 'text']) {
        if (typeof candidate[key] === 'string') {
          return candidate[key];
        }
      }
    }
  }

  throw new Error(
    'Could not extract generated JavaScript from Imba. ' +
    `Result keys: ${Object.keys(result).join(', ') || '(none)'}`
  );
}

function compileImbaSource(source, filename) {
  const result = compileImba(source, {
    filename,
    sourcePath: filename,
    format: 'cjs',
    generate: 'dom',
    sourcemap: false,
    raiseErrors: true
  });

  return requireJavaScript(extractImbaJavaScript(result), 'Imba');
}

async function captureOutput(js, sourceName) {
  const lines = [];
  const originalConsole = global.console;
  const fakeConsole = Object.create(originalConsole);

  const capture = (...args) => {
    lines.push(args.map(String).join(' '));
  };

  for (const method of ['log', 'info', 'debug', 'warn', 'error']) {
    fakeConsole[method] = capture;
  }
  const usesEsm = /^\s*(?:import|export)\s/m.test(js);

  if (usesEsm) {
    const { pathToFileURL } = require('node:url');
    const tempFile = path.join(
      __dirname,
      `.bench-generated-${process.pid}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}.mjs`
    );

    fs.writeFileSync(tempFile, js, 'utf8');

    try {
      global.console = fakeConsole;
      const moduleUrl =
        `${pathToFileURL(tempFile).href}?run=${Date.now()}-${Math.random()}`;

      await import(moduleUrl);
    } finally {
      global.console = originalConsole;
      fs.rmSync(tempFile, { force: true });
    }

    return lines.join('\n');
  }

  const moduleObject = { exports: {} };

  const sandbox = {
    console: fakeConsole,
    require: localRequire,
    exports: moduleObject.exports,
    module: moduleObject,
    __filename: sourceName,
    __dirname: candidates,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    URLSearchParams
  };

  new vm.Script(js, {
    filename: `${path.basename(sourceName)}.generated.js`
  }).runInNewContext(sandbox, { timeout: 2000 });

  return lines.join('\n');
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function percentile(values, p = 0.95) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(p * sorted.length) - 1
  );

  return sorted[index];
}

function timeBatch(task, iterations) {
  let lastResult;

  const start = process.hrtime.bigint();

  for (let i = 0; i < iterations; i++) {
    lastResult = task.run();
  }

  const elapsed = process.hrtime.bigint() - start;

  if (typeof lastResult !== 'string') {
    throw new Error(`${task.name} returned non-string output during timing.`);
  }

  return Number(elapsed) / 1e6 / iterations;
}

function formatMs(value) {
  return value < 0.01 ? value.toFixed(5) : value.toFixed(4);
}

function compareWithCoffeeScript(value, baseline) {
  if (value === baseline) {
    return '1.00x (same median)';
  }

  if (value < baseline) {
    return `${(baseline / value).toFixed(2)}x faster`;
  }

  return `${(value / baseline).toFixed(2)}x slower`;
}

async function runBenchmark(name) {
  console.log(`\nTest: ${name}`);

  const humal = readcandidates(name, 'hum');
  const coffee = readcandidates(name, 'coffee');
  const typescript = readcandidates(name, 'ts');
  const civet = readcandidates(name, 'civet');
  const imba = readcandidates(name, 'imba');

  const tasks = [
    {
      name: 'Humal core',
      source: humal.source,
      filename: humal.filename,
      run: () => compileHumal(humal.source, 'cjs', {
        validate: false,
        sourceMap: false
      })
    },
    {
      name: 'Humal default',
      source: humal.source,
      filename: humal.filename,
      run: () => compileHumal(humal.source, 'cjs', {
        validate: true,
        sourceMap: false
      })
    },
    {
      name: 'CoffeeScript',
      source: coffee.source,
      filename: coffee.filename,
      run: () => CoffeeScript.compile(coffee.source, {
        bare: true,
        header: false,
        sourceMap: false
      })
    },
    {
      name: 'TypeScript emit',
      source: typescript.source,
      filename: typescript.filename,
      run: () => compileTypeScript(typescript.source, typescript.filename, false),
      preflight: () => compileTypeScript(typescript.source, typescript.filename, true)
    },
    {
      name: 'Civet',
      source: civet.source,
      filename: civet.filename,
      run: () => compileCivetSource(civet.source)
    },
    {
      name: 'Imba',
      source: imba.source,
      filename: imba.filename,
      run: () => compileImbaSource(imba.source, imba.filename)
    }
  ];

  const compiled = new Map();
  const outputs = new Map();

  for (const task of tasks) {
    try {
      if (task.preflight) {
        task.preflight();
      }

      const js = requireJavaScript(task.run(), task.name);

      compiled.set(task.name, js);
      outputs.set(task.name, await captureOutput(js, task.filename));
    } catch (error) {
      throw new Error(
        `${task.name} failed in test "${name}": ` +
        `${error.stack || error.message || error}`
      );
    }
  }

  const expectedOutput = outputs.get('Humal default');

  for (const [compiler, output] of outputs) {
    if (output !== expectedOutput) {
      throw new Error(
        `${name}: output mismatch for ${compiler}.\n` +
        `Expected: ${JSON.stringify(expectedOutput)}\n` +
        `Received: ${JSON.stringify(output)}`
      );
    }
  }

  console.log('Verified output:', JSON.stringify(expectedOutput));
  console.log('\nInput size:');

  for (const task of tasks) {
    console.log(
      `  ${task.name.padEnd(20)} ` +
      `${Buffer.byteLength(task.source)} bytes`
    );
  }

  console.log('\nGenerated JavaScript:');

  for (const task of tasks) {
    console.log(
      `  ${task.name.padEnd(20)} ` +
      `${Buffer.byteLength(compiled.get(task.name))} bytes`
    );
  }

  const maxInputBytes = Math.max(
    ...tasks.map(task => Buffer.byteLength(task.source))
  );

  const iterations =
    maxInputBytes < 10_000 ? 30 :
    maxInputBytes < 100_000 ? 5 : 1;

  const warmups =
    maxInputBytes < 10_000 ? 50 :
    maxInputBytes < 100_000 ? 10 : 2;

  const rounds = 25;

  console.log('\nMeasurement settings:');
  console.log('  Warm-up compilations per compiler:', warmups);
  console.log('  Compilations per batch:', iterations);
  console.log('  Measured batches:', rounds);

  for (const task of tasks) {
    for (let i = 0; i < warmups; i++) {
      task.run();
    }
  }

  const samples = new Map(tasks.map(task => [task.name, []]));
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 === 0 ? tasks : [...tasks].reverse();

    for (const task of order) {
      const elapsed = timeBatch(task, iterations);
      samples.get(task.name).push(elapsed);
    }
  }

  const medians = new Map();

  for (const task of tasks) {
    const values = samples.get(task.name);
    const med = median(values);
    const p95 = percentile(values, 0.95);

    medians.set(task.name, med);

    console.log(
      `\n${task.name}\n` +
      `  median: ${formatMs(med)} ms/compile\n` +
      `  p95 batch mean: ${formatMs(p95)} ms/compile`
    );
  }

  const coffeeMedian = medians.get('CoffeeScript');

  console.log('\nRelative median vs CoffeeScript:');

  for (const task of tasks) {
    console.log(
      `  ${task.name.padEnd(20)} ` +
      compareWithCoffeeScript(medians.get(task.name), coffeeMedian)
    );
  }
}

async function main() {
  if (!fs.existsSync(candidates)) {
    throw new Error(`candidates directory not found: ${candidates}`);
  }

  printEnvironment();

  const files = fs.readdirSync(candidates)
    .filter(file => file.endsWith('.hum'))
    .sort();

  if (files.length === 0) {
    throw new Error('No .hum benchmark files found in candidates/.');
  }

  for (const file of files) {
    const name = path.basename(file, '.hum');
    await runBenchmark(name);
  }

  console.log('\nBenchmark completed successfully');
}

main().catch(error => {
  console.error('\nBENCHMARK FAILED');
  console.error(error.stack || error);
  process.exitCode = 1;
});