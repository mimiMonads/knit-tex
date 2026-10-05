pride-and-prejudice.tex: 216 pages, 2118 paragraphs, 8639 lines; median of 5 warm runs; 4 cores

| configuration | cold run | warm run | speedup | paragraphs | pages | CPU per run | longest main-thread stall | p99 stall | same bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| main thread | 847 ms | 621 ms | 1.00x | 335 ms | 194 ms | 741 ms | 621.8 ms | 621.8 ms | yes |
| knitting x1 | 1187 ms | 775 ms | 0.80x | 442 ms | 251 ms | 1117 ms | 77.0 ms | 7.3 ms | yes |
| knitting x2 | 794 ms | 486 ms | 1.28x | 266 ms | 138 ms | 1113 ms | 77.5 ms | 6.5 ms | yes |
| knitting x3 | 799 ms | 368 ms | 1.69x | 199 ms | 97 ms | 1087 ms | 72.4 ms | 26.6 ms | yes |
| piscina x3 | 911 ms | 547 ms | 1.14x | 296 ms | 151 ms | 1342 ms | 82.4 ms | 4.7 ms | yes |
| piscina x3, 32/worker | 719 ms | 468 ms | 1.33x | 206 ms | 156 ms | 1337 ms | 88.9 ms | 81.2 ms | yes |
