pride-and-prejudice.tex: 216 pages, 2118 paragraphs, 8639 lines; median of 5 warm runs; 8 cores

| configuration | cold run | warm run | speedup | paragraphs | pages | CPU per run | CPU use | longest main-thread stall | p99 stall | same bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| main thread | 606 ms | 427 ms | 1.00x | 229 ms | 134 ms | 509 ms | 117.8% | 427.2 ms | 427.2 ms | yes |
| knitting x1 | 760 ms | 448 ms | 0.95x | 258 ms | 138 ms | 578 ms | 128.6% | 51.3 ms | 2.6 ms | yes |
| knitting x2 | 588 ms | 307 ms | 1.39x | 159 ms | 94 ms | 678 ms | 228.6% | 55.4 ms | 4.2 ms | yes |
| knitting x3 | 549 ms | 250 ms | 1.71x | 125 ms | 60 ms | 755 ms | 301.5% | 59.4 ms | 7.9 ms | yes |
| knitting x4 | 632 ms | 229 ms | 1.86x | 119 ms | 51 ms | 871 ms | 383.9% | 60.7 ms | 7.9 ms | yes |
| piscina x1 | 869 ms | 654 ms | 0.65x | 332 ms | 268 ms | 775 ms | 119.2% | 62.2 ms | 2.7 ms | yes |
| piscina x2 | 608 ms | 432 ms | 0.99x | 216 ms | 149 ms | 878 ms | 206.2% | 66.0 ms | 2.7 ms | yes |
| piscina x3 | 593 ms | 376 ms | 1.13x | 183 ms | 125 ms | 1029 ms | 279.0% | 61.3 ms | 3.6 ms | yes |
| piscina x4 | 652 ms | 345 ms | 1.24x | 169 ms | 109 ms | 1204 ms | 349.2% | 68.9 ms | 4.5 ms | yes |
| piscina x4, 32/worker | 598 ms | 317 ms | 1.34x | 140 ms | 118 ms | 1209 ms | 375.1% | 97.5 ms | 87.6 ms | yes |
