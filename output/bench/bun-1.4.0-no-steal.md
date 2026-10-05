pride-and-prejudice.tex: 216 pages, 2118 paragraphs, 8639 lines; median of 5 warm runs; 8 cores

| configuration | cold run | warm run | speedup | paragraphs | pages | CPU per run | CPU use | longest main-thread stall | p99 stall | same bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| knitting x1 | 757 ms | 436 ms | 1.00x | 248 ms | 134 ms | 639 ms | 149.1% | 57.7 ms | 2.5 ms | yes |
| knitting x2 | 541 ms | 308 ms | 1.42x | 157 ms | 87 ms | 777 ms | 252.3% | 59.4 ms | 3.0 ms | yes |
| knitting x3 | 609 ms | 273 ms | 1.60x | 136 ms | 76 ms | 936 ms | 342.5% | 64.2 ms | 7.5 ms | yes |
| knitting x4 | 677 ms | 289 ms | 1.51x | 142 ms | 70 ms | 1210 ms | 426.0% | 74.0 ms | 10.3 ms | yes |
