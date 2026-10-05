mixed paragraph batch: 2115 tasks, seed 271828, median of 5 warm runs; 8 available CPUs
Pride and Prejudice: 1692 tasks (80.0%); Tom Sawyer: 423 tasks (20.0%)
paragraph text length: p50 175 chars, p99 1666 chars, max 14053 chars

| configuration | cold run | warm batch | speedup | CPU per batch | CPU use | longest stall | p99 stall | same results |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| knitting x1, stealing on | 623 ms | 273 ms | 1.00x | 356 ms | 130.0% | 2.1 ms | 1.8 ms | yes |
| knitting x1, stealing off | 566 ms | 265 ms | 1.03x | 355 ms | 138.0% | 2.8 ms | 1.8 ms | yes |
| piscina x1, shared FIFO queue | 582 ms | 340 ms | 0.80x | 418 ms | 123.1% | 8.6 ms | 1.9 ms | yes |
| knitting x2, stealing on | 496 ms | 152 ms | 1.80x | 387 ms | 256.7% | 3.1 ms | 1.8 ms | yes |
| knitting x2, stealing off | 499 ms | 159 ms | 1.71x | 393 ms | 247.5% | 4.9 ms | 1.8 ms | yes |
| piscina x2, shared FIFO queue | 446 ms | 206 ms | 1.33x | 453 ms | 214.9% | 5.1 ms | 2.0 ms | yes |
| knitting x3, stealing on | 529 ms | 124 ms | 2.20x | 494 ms | 389.7% | 2.7 ms | 1.4 ms | yes |
| knitting x3, stealing off | 525 ms | 128 ms | 2.13x | 445 ms | 336.5% | 3.6 ms | 2.2 ms | yes |
| piscina x3, shared FIFO queue | 478 ms | 174 ms | 1.57x | 557 ms | 308.4% | 5.4 ms | 2.1 ms | yes |
| knitting x4, stealing on | 598 ms | 119 ms | 2.29x | 609 ms | 518.8% | 3.5 ms | 3.5 ms | yes |
| knitting x4, stealing off | 585 ms | 145 ms | 1.88x | 614 ms | 441.6% | 7.3 ms | 3.8 ms | yes |
| piscina x4, shared FIFO queue | 504 ms | 166 ms | 1.64x | 706 ms | 424.5% | 4.9 ms | 2.4 ms | yes |
