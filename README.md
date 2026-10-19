# Humal Compiler Benchmark

**Benchmarking compilation speed of Humal, CoffeeScript, TypeScript, Civet, and Imba.**

> **Important:** These results represent a specific synthetic workload and hardware configuration. They should not be interpreted as a universal ranking of programming languages or as a guarantee of performance on every project.

## Summary

In the tests performed on an AMD Ryzen 5 6600H running Node.js 24.21.0, Humal achieved the lowest median compilation time at all four tested program sizes.

For the largest test, containing 5,000 generated functions, Humal's default compilation mode completed in **24.55 ms**, compared with 163.07 ms for TypeScript transpilation, 231.49 ms for Imba, 4,802.53 ms for CoffeeScript, and 10,487.11 ms for Civet.

> These are observed results from this benchmark, not universal performance guarantees.

## Tested compilers

| Compiler | Version | Configuration |
|---|---|---|
| Humal | 1.4.0 | Core and default compilation |
| CoffeeScript | 2.7.0 | JavaScript generation |
| TypeScript | 6.0.3 | Transpilation without full type checking |
| Civet | 0.11.16 | JavaScript generation |
| Imba | 2.0.0-alpha.253 | JavaScript generation |

## Test environment

| Component | Configuration |
|---|---|
| CPU | AMD Ryzen 5 6600H with Radeon Graphics |
| CPU cores reported by Node.js | 6 |
| Node.js | v24.21.0 |
| Operating system | Linux under WSL2 |
| Architecture | x64 |
| WSL2 kernel | 6.18.33.2-microsoft-standard-WSL2 |

All measurements were collected on the same machine.

## Methodology

### Workload

The benchmark generates programs containing 100, 1,000, or 5,000 simple functions.

Each generated function returns its argument plus one:

```javascript
function f00000(x) {
    return x + 1;
}
```

The final function is called with an input of `14`, and the program must print:

```text
15
```

Each language receives an implementation of the same logical workload using its own syntax.

The benchmark also includes a small manually prepared test named `tiny`.

### What is measured?

The benchmark measures the time required to compile source code into JavaScript using the compilers' in-process APIs.

It reports two Humal configurations:

**Humal core:** compilation with validation disabled.

**Humal default:** compilation with validation enabled.

The other compilers use their configured JavaScript-generation APIs. TypeScript is measured through `transpileModule`, without a full project-wide type check.

The benchmark does not measure runtime execution speed, complete CLI startup time, production bundling time, or TypeScript's full type-checking performance.

### Timing procedure

The benchmark uses `process.hrtime.bigint()` for high-resolution timing.

For each compiler, it performs warm-up compilations followed by 25 measurement batches. The number of compilations per batch depends on the largest input:

| Maximum input size | Warm-up compilations | Compilations per batch | Measured batches |
|---|---:|---:|---:|
| Below 10 KB | 50 | 30 | 25 |
| 10–100 KB | 10 | 5 | 25 |
| Above 100 KB | 2 | 1 | 25 |

The median is the primary comparison metric. The reported p95 is the 95th percentile of the measured batch-average times, expressed in milliseconds per compilation.

### Generated source and output sizes

The benchmark also records the size of each source file and its generated JavaScript output. These sizes are not identical across languages, which is an important limitation when interpreting raw compilation-time ratios.

## Results

All times are medians in milliseconds per compilation. Lower values indicate faster compilation.

### Compilation time

| Test | Functions | Humal core | Humal default | TypeScript | Imba | CoffeeScript | Civet |
|---|---:|---:|---:|---:|---:|---:|---:|
| Tiny | — | 0.0121 | **0.0179** | 0.4932 | 0.2594 | 0.6159 | 4.3570 |
| Scale 100 | 100 | 0.3648 | **0.3793** | 3.4668 | 2.4848 | 10.6618 | 118.4947 |
| Scale 1,000 | 1,000 | 3.9162 | **3.5555** | 29.9435 | 27.2337 | 226.5225 | 1,429.1397 |
| Scale 5,000 | 5,000 | 23.9211 | **24.5482** | 163.0748 | 231.4935 | 4,802.5319 | 10,487.1081 |

### Relative performance against Humal default

The following ratios are calculated from the measured medians. A value of `10x slower` means the comparison compiler took ten times as long as Humal default.

| Test | TypeScript | Imba | CoffeeScript | Civet |
|---|---:|---:|---:|---:|
| Tiny | 27.6x slower | 14.5x slower | 34.4x slower | 243.4x slower |
| Scale 100 | 9.1x slower | 6.6x slower | 28.1x slower | 312.4x slower |
| Scale 1,000 | 8.4x slower | 7.7x slower | 63.7x slower | 402.0x slower |
| Scale 5,000 | 6.6x slower | 9.4x slower | 195.6x slower | 427.2x slower |

These ratios apply only to the tested source programs, compiler versions, and execution environment.

### Source and generated JavaScript size

The 5,000-function workload produced the following file sizes:

| Language | Source size | Generated JavaScript |
|---|---:|---:|
| Humal | 155,017 bytes | 195,024 bytes |
| CoffeeScript | 160,023 bytes | 255,030 bytes |
| TypeScript | 290,025 bytes | 205,039 bytes |
| Civet | 290,025 bytes | 210,025 bytes |
| Imba | 140,023 bytes | 195,035 bytes |

## Scaling behavior

Between the 100-function and 5,000-function tests, the median compilation time changed as follows:

| Compiler | Increase in compilation time |
|---|---:|
| Humal default | 64.7x |
| TypeScript transpilation | 47.0x |
| Imba | 93.2x|
| CoffeeScript | 450.4x |
| Civet | 88.5x |

## Interpretation

The benchmark supports several limited conclusions:

1. Humal demonstrated very low median compilation latency on the tested workloads.
2. Its advantage over the other tested compilers remained visible as the generated programs grew from a few lines to 5,000 functions.
3. Humal default remained substantially faster than the tested TypeScript transpilation, Imba, CoffeeScript, and Civet configurations in these measurements.
4. Humal core and Humal default showed similar compilation times overall. At Scale 1,000, Humal default was approximately 9.2% faster than Humal core (3.5555 ms versus 3.9162 ms). This difference warrants further investigation. This suggests that measurement variability and benchmark configuration should be investigated further.

The results do **not** establish that Humal is faster for every program, that its generated JavaScript executes faster, or that it is a better programming language overall.

The workload consists primarily of simple, repetitive function declarations. Different results may occur with complex expressions, nested control flow, modules, asynchronous functions, type checking, browser applications, or production bundling.

## Limitations

1. **Synthetic workload:** Thousands of similar functions do not fully represent real-world applications.
2. **Different source sizes:** The languages do not receive byte-for-byte identical source code.
3. **TypeScript configuration:** The test measures transpilation without a full type check.
4. **Compiler configuration:** Each compiler performs its own parsing and transformation work. The benchmark does not normalize all compiler features to an identical pipeline.
5. **Environment sensitivity:** WSL2 scheduling, CPU load, JIT warm-up, and system activity can affect results.
6. **Variation:** Some results, notably Imba's p95 for the largest test, show considerable variability and warrant repeated measurement.
7. **No runtime benchmark:** Generated JavaScript execution speed and browser performance are outside the scope of this test.

```bash
npm ci
```

```bash
python3 generate-cases.py
```

```bash
node bench.cjs
```