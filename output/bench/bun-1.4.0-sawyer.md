tom-sawyer.tex: 130 pages, 1898 paragraphs, 5311 lines; median of 5 warm runs; 8 cores

| configuration | cold run | warm run | speedup | paragraphs | pages | CPU per run | CPU use | longest main-thread stall | p99 stall | same bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| knitting x1 | 562 ms | 280 ms | 1.00x | 160 ms | 83 ms | 443 ms | 161.1% | 33.9 ms | 2.4 ms | yes |
| knitting x2 | 438 ms | 219 ms | 1.28x | 118 ms | 54 ms | 641 ms | 266.0% | 37.3 ms | 4.9 ms | yes |
| knitting x3 | 449 ms | 194 ms | 1.44x | 109 ms | 46 ms | 808 ms | 372.0% | 41.5 ms | 4.6 ms | yes |
| knitting x4 | 515 ms | 194 ms | 1.44x | 110 ms | 46 ms | 977 ms | 502.3% | 44.2 ms | 6.0 ms | yes |
