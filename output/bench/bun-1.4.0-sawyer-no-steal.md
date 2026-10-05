tom-sawyer.tex: 130 pages, 1898 paragraphs, 5311 lines; median of 5 warm runs; 8 cores

| configuration | cold run | warm run | speedup | paragraphs | pages | CPU per run | CPU use | longest main-thread stall | p99 stall | same bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| knitting x1 | 531 ms | 273 ms | 1.00x | 158 ms | 83 ms | 435 ms | 160.8% | 35.2 ms | 1.9 ms | yes |
| knitting x2 | 419 ms | 202 ms | 1.35x | 112 ms | 58 ms | 578 ms | 270.7% | 36.4 ms | 6.1 ms | yes |
| knitting x3 | 474 ms | 193 ms | 1.41x | 111 ms | 48 ms | 771 ms | 341.5% | 42.1 ms | 7.4 ms | yes |
| knitting x4 | 518 ms | 173 ms | 1.58x | 91 ms | 42 ms | 779 ms | 449.0% | 43.4 ms | 8.4 ms | yes |
