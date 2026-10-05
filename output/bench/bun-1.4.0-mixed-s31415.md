mixed paragraph batch: 2115 tasks, seed 31415, median of 5 warm runs; 8 available CPUs
Pride and Prejudice: 1692 tasks (80.0%); Tom Sawyer: 423 tasks (20.0%)
paragraph text length: p50 177 chars, p99 1573 chars, max 9597 chars

| configuration | cold run | warm batch | speedup | CPU per batch | CPU use | longest stall | p99 stall | same results |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| knitting x1, stealing on | 496 ms | 222 ms | 1.00x | 339 ms | 155.3% | 2.0 ms | 1.2 ms | yes |
| knitting x1, stealing off | 526 ms | 231 ms | 0.96x | 343 ms | 150.8% | 2.1 ms | 1.1 ms | yes |
| knitting x2, stealing on | 478 ms | 174 ms | 1.28x | 499 ms | 275.6% | 2.5 ms | 1.6 ms | yes |
| knitting x2, stealing off | 517 ms | 178 ms | 1.25x | 458 ms | 277.3% | 5.1 ms | 2.2 ms | yes |
| knitting x3, stealing on | 486 ms | 160 ms | 1.39x | 762 ms | 467.9% | 2.8 ms | 2.8 ms | yes |
| knitting x3, stealing off | 544 ms | 131 ms | 1.70x | 565 ms | 448.2% | 3.8 ms | 2.0 ms | yes |
| knitting x4, stealing on | 567 ms | 134 ms | 1.66x | 721 ms | 539.3% | 5.8 ms | 4.6 ms | yes |
| knitting x4, stealing off | 658 ms | 162 ms | 1.37x | 852 ms | 529.8% | 8.4 ms | 3.0 ms | yes |
