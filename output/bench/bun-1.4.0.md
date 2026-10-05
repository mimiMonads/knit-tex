pride-and-prejudice.tex: 216 pages, 2118 paragraphs, 8639 lines; median of 5 warm runs; 8 cores

| configuration | cold run | warm run | speedup | paragraphs | pages | CPU per run | CPU use | longest main-thread stall | p99 stall | same bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| main thread | 580 ms | 449 ms | 1.00x | 242 ms | 146 ms | 607 ms | 136.2% | 450.0 ms | 450.0 ms | yes |
| knitting x1 | 690 ms | 459 ms | 0.98x | 264 ms | 140 ms | 649 ms | 140.1% | 52.4 ms | 2.5 ms | yes |
| knitting x2 | 543 ms | 312 ms | 1.44x | 155 ms | 83 ms | 842 ms | 265.4% | 56.8 ms | 4.3 ms | yes |
| knitting x3 | 546 ms | 267 ms | 1.68x | 147 ms | 66 ms | 957 ms | 353.5% | 53.4 ms | 6.2 ms | yes |
| knitting x4 | 593 ms | 254 ms | 1.77x | 147 ms | 58 ms | 1266 ms | 476.0% | 52.4 ms | 8.0 ms | yes |
| piscina x1 | 894 ms | 682 ms | 0.66x | 408 ms | 228 ms | 854 ms | 123.5% | 48.3 ms | 1.4 ms | yes |
| piscina x2 | 631 ms | 446 ms | 1.01x | 253 ms | 131 ms | 1000 ms | 216.8% | 63.8 ms | 2.6 ms | yes |
| piscina x3 | 586 ms | 387 ms | 1.16x | 218 ms | 108 ms | 1164 ms | 300.1% | 62.7 ms | 3.7 ms | yes |
| piscina x4 | 631 ms | 362 ms | 1.24x | 195 ms | 100 ms | 1416 ms | 390.3% | 64.1 ms | 6.4 ms | yes |
| piscina x4, 32/worker | 608 ms | 343 ms | 1.31x | 177 ms | 103 ms | 1497 ms | 441.9% | 85.6 ms | 74.4 ms | yes |
