mixed paragraph batch: 2115 tasks, seed 1729, median of 5 warm runs; 8 available CPUs
Pride and Prejudice: 1692 tasks (80.0%); Tom Sawyer: 423 tasks (20.0%)
paragraph text length: p50 181 chars, p99 1621 chars, max 14053 chars

| configuration | cold run | warm batch | speedup | CPU per batch | CPU use | longest stall | p99 stall | same results |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| knitting x1, stealing on | 676 ms | 264 ms | 1.00x | 351 ms | 130.4% | 1.9 ms | 1.8 ms | yes |
| knitting x1, stealing off | 598 ms | 257 ms | 1.03x | 365 ms | 135.3% | 2.4 ms | 1.9 ms | yes |
| piscina x1, shared FIFO queue | 562 ms | 326 ms | 0.81x | 384 ms | 119.6% | 9.3 ms | 1.9 ms | yes |
| knitting x2, stealing on | 470 ms | 151 ms | 1.75x | 391 ms | 252.7% | 1.7 ms | 1.7 ms | yes |
| knitting x2, stealing off | 545 ms | 159 ms | 1.66x | 404 ms | 253.5% | 4.8 ms | 2.6 ms | yes |
| piscina x2, shared FIFO queue | 435 ms | 211 ms | 1.25x | 459 ms | 217.2% | 4.8 ms | 1.9 ms | yes |
| knitting x3, stealing on | 522 ms | 134 ms | 1.97x | 516 ms | 385.5% | 4.2 ms | 1.4 ms | yes |
| knitting x3, stealing off | 514 ms | 131 ms | 2.01x | 416 ms | 346.8% | 4.4 ms | 2.7 ms | yes |
| piscina x3, shared FIFO queue | 437 ms | 176 ms | 1.50x | 555 ms | 314.5% | 5.0 ms | 1.9 ms | yes |
| knitting x4, stealing on | 581 ms | 108 ms | 2.44x | 527 ms | 483.7% | 2.5 ms | 2.3 ms | yes |
| knitting x4, stealing off | 585 ms | 141 ms | 1.87x | 601 ms | 431.0% | 4.6 ms | 2.4 ms | yes |
| piscina x4, shared FIFO queue | 489 ms | 163 ms | 1.62x | 696 ms | 417.2% | 5.0 ms | 2.9 ms | yes |
