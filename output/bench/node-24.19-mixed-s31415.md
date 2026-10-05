mixed paragraph batch: 2115 tasks, seed 31415, median of 5 warm runs; 8 available CPUs
Pride and Prejudice: 1692 tasks (80.0%); Tom Sawyer: 423 tasks (20.0%)
paragraph text length: p50 177 chars, p99 1573 chars, max 9597 chars

| configuration | cold run | warm batch | speedup | CPU per batch | CPU use | longest stall | p99 stall | same results |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| knitting x1, stealing on | 612 ms | 254 ms | 1.00x | 331 ms | 131.6% | 2.0 ms | 1.8 ms | yes |
| knitting x1, stealing off | 551 ms | 238 ms | 1.07x | 342 ms | 138.7% | 2.2 ms | 1.8 ms | yes |
| piscina x1, shared FIFO queue | 556 ms | 316 ms | 0.81x | 387 ms | 120.7% | 9.4 ms | 1.9 ms | yes |
| knitting x2, stealing on | 486 ms | 162 ms | 1.57x | 409 ms | 252.5% | 3.2 ms | 2.7 ms | yes |
| knitting x2, stealing off | 508 ms | 149 ms | 1.71x | 376 ms | 248.3% | 4.5 ms | 2.1 ms | yes |
| piscina x2, shared FIFO queue | 417 ms | 211 ms | 1.20x | 471 ms | 220.7% | 5.0 ms | 2.0 ms | yes |
| knitting x3, stealing on | 497 ms | 118 ms | 2.16x | 465 ms | 381.3% | 3.5 ms | 1.5 ms | yes |
| knitting x3, stealing off | 511 ms | 109 ms | 2.34x | 418 ms | 341.1% | 3.6 ms | 2.6 ms | yes |
| piscina x3, shared FIFO queue | 478 ms | 157 ms | 1.62x | 506 ms | 329.2% | 5.1 ms | 2.6 ms | yes |
| knitting x4, stealing on | 575 ms | 114 ms | 2.24x | 545 ms | 490.5% | 3.4 ms | 2.1 ms | yes |
| knitting x4, stealing off | 557 ms | 126 ms | 2.02x | 618 ms | 451.0% | 4.5 ms | 3.6 ms | yes |
| piscina x4, shared FIFO queue | 487 ms | 168 ms | 1.51x | 698 ms | 427.6% | 4.9 ms | 2.6 ms | yes |
