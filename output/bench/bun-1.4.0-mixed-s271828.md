mixed paragraph batch: 2115 tasks, seed 271828, median of 5 warm runs; 8 available CPUs
Pride and Prejudice: 1692 tasks (80.0%); Tom Sawyer: 423 tasks (20.0%)
paragraph text length: p50 175 chars, p99 1666 chars, max 14053 chars

| configuration | cold run | warm batch | speedup | CPU per batch | CPU use | longest stall | p99 stall | same results |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| knitting x1, stealing on | 574 ms | 244 ms | 1.00x | 359 ms | 149.4% | 2.9 ms | 1.3 ms | yes |
| knitting x1, stealing off | 517 ms | 248 ms | 0.98x | 367 ms | 147.8% | 2.2 ms | 1.3 ms | yes |
| knitting x2, stealing on | 468 ms | 178 ms | 1.37x | 477 ms | 277.6% | 4.6 ms | 2.4 ms | yes |
| knitting x2, stealing off | 498 ms | 157 ms | 1.55x | 440 ms | 280.3% | 3.6 ms | 2.3 ms | yes |
| knitting x3, stealing on | 487 ms | 150 ms | 1.62x | 676 ms | 449.3% | 4.0 ms | 2.3 ms | yes |
| knitting x3, stealing off | 504 ms | 153 ms | 1.59x | 686 ms | 430.3% | 5.2 ms | 3.9 ms | yes |
| knitting x4, stealing on | 578 ms | 157 ms | 1.56x | 876 ms | 559.3% | 5.9 ms | 4.1 ms | yes |
| knitting x4, stealing off | 584 ms | 148 ms | 1.64x | 759 ms | 545.7% | 3.4 ms | 2.7 ms | yes |
