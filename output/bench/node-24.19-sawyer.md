tom-sawyer.tex: 130 pages, 1898 paragraphs, 5311 lines; median of 5 warm runs; 8 cores

| configuration | cold run | warm run | speedup | paragraphs | pages | CPU per run | CPU use | longest main-thread stall | p99 stall | same bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| knitting x1 | 614 ms | 281 ms | 1.00x | 159 ms | 87 ms | 391 ms | 139.7% | 36.4 ms | 2.5 ms | yes |
| knitting x2 | 460 ms | 177 ms | 1.59x | 95 ms | 47 ms | 411 ms | 232.4% | 34.3 ms | 5.2 ms | yes |
| knitting x3 | 462 ms | 158 ms | 1.78x | 79 ms | 41 ms | 505 ms | 323.2% | 35.8 ms | 7.6 ms | yes |
| knitting x4 | 521 ms | 145 ms | 1.95x | 78 ms | 33 ms | 567 ms | 395.9% | 34.1 ms | 6.6 ms | yes |
