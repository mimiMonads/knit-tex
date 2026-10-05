pride-and-prejudice.tex: cold CLI, a fresh process per run, median of 5; bun 1.4.0; 8 cores

| mode | executor | typeset total | process wall time |
|---|---|---:|---:|
| --host | main thread | 586 ms | 632 ms |
| --threads 2 | knitting x2 | 566 ms | 630 ms |
| --threads 4 | knitting x4 | 622 ms | 710 ms |
| --threads auto | knitting x7 | 789 ms | 980 ms |
