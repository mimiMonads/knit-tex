mixed paragraph batch: 2115 tasks, seed 1729, median of 5 warm runs; 8 available CPUs
Pride and Prejudice: 1692 tasks (80.0%); Tom Sawyer: 423 tasks (20.0%)
paragraph text length: p50 181 chars, p99 1621 chars, max 14053 chars

| configuration | cold run | warm batch | speedup | CPU per batch | CPU use | longest stall | p99 stall | same results |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| knitting x1, stealing on | 526 ms | 239 ms | 1.00x | 360 ms | 149.7% | 2.0 ms | 1.2 ms | yes |
| knitting x1, stealing off | 490 ms | 245 ms | 0.97x | 359 ms | 147.3% | 2.7 ms | 1.6 ms | yes |
| knitting x2, stealing on | 439 ms | 160 ms | 1.49x | 433 ms | 283.0% | 3.7 ms | 1.9 ms | yes |
| knitting x2, stealing off | 507 ms | 162 ms | 1.48x | 420 ms | 279.5% | 3.0 ms | 2.5 ms | yes |
| knitting x3, stealing on | 494 ms | 156 ms | 1.53x | 731 ms | 454.1% | 3.4 ms | 2.2 ms | yes |
| knitting x3, stealing off | 501 ms | 138 ms | 1.73x | 591 ms | 397.5% | 4.2 ms | 2.9 ms | yes |
| knitting x4, stealing on | 571 ms | 142 ms | 1.68x | 821 ms | 565.5% | 5.0 ms | 2.9 ms | yes |
| knitting x4, stealing off | 579 ms | 159 ms | 1.51x | 804 ms | 506.6% | 6.9 ms | 4.0 ms | yes |
