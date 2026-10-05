pride-and-prejudice.tex: 216 pages, 2118 paragraphs, 8639 lines; median of 5 warm runs; 8 cores

| configuration | cold run | warm run | speedup | paragraphs | pages | CPU per run | CPU use | longest main-thread stall | p99 stall | same bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| knitting x1 | 804 ms | 476 ms | 1.00x | 271 ms | 145 ms | 658 ms | 138.2% | 58.8 ms | 2.4 ms | yes |
| knitting x2 | 596 ms | 302 ms | 1.58x | 167 ms | 83 ms | 698 ms | 222.1% | 58.8 ms | 5.0 ms | yes |
| knitting x3 | 581 ms | 259 ms | 1.84x | 134 ms | 65 ms | 741 ms | 288.3% | 64.9 ms | 9.7 ms | yes |
| knitting x4 | 683 ms | 248 ms | 1.92x | 126 ms | 56 ms | 791 ms | 350.5% | 60.0 ms | 9.7 ms | yes |
