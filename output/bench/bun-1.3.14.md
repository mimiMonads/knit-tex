pride-and-prejudice.tex: 216 pages, 2118 paragraphs, 8639 lines; median of 5 warm runs; 4 cores

| configuration | cold run | warm run | speedup | paragraphs | pages | CPU per run | longest main-thread stall | p99 stall | same bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| main thread | 1045 ms | 777 ms | 1.00x | 421 ms | 275 ms | 975 ms | 778.4 ms | 778.4 ms | yes |
| knitting x1 | 1358 ms | 885 ms | 0.88x | 473 ms | 334 ms | 1414 ms | 78.9 ms | 5.1 ms | yes |
| knitting x2 | 880 ms | 494 ms | 1.57x | 247 ms | 170 ms | 1258 ms | 71.8 ms | 8.3 ms | yes |
| knitting x3 | 1001 ms | 506 ms | 1.54x | 296 ms | 136 ms | 1424 ms | 69.9 ms | 18.5 ms | yes |
| piscina x3 (close() did not settle within 5 s) | 1048 ms | 684 ms | 1.14x | 448 ms | 169 ms | 1722 ms | 70.1 ms | 4.9 ms | yes |
| piscina x3, 32/worker (close() did not settle within 5 s) | 964 ms | 512 ms | 1.52x | 311 ms | 127 ms | 1545 ms | 79.3 ms | 77.5 ms | yes |
