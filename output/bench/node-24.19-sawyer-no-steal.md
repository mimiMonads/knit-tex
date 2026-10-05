tom-sawyer.tex: 130 pages, 1898 paragraphs, 5311 lines; median of 5 warm runs; 8 cores

| configuration | cold run | warm run | speedup | paragraphs | pages | CPU per run | CPU use | longest main-thread stall | p99 stall | same bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| knitting x1 | 641 ms | 284 ms | 1.00x | 158 ms | 86 ms | 394 ms | 138.5% | 36.0 ms | 2.6 ms | yes |
| knitting x2 | 464 ms | 175 ms | 1.62x | 86 ms | 47 ms | 409 ms | 228.9% | 35.9 ms | 6.4 ms | yes |
| knitting x3 | 462 ms | 155 ms | 1.83x | 84 ms | 36 ms | 459 ms | 307.3% | 36.8 ms | 9.3 ms | yes |
| knitting x4 | 537 ms | 141 ms | 2.01x | 80 ms | 42 ms | 479 ms | 351.4% | 38.0 ms | 33.6 ms | yes |
