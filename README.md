# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kainze29/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kainze29/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar: a dashboard that ranks pre-token DeFi protocols by implied launch value and tells you exactly how to farm each one. It reads a frozen DefiLlama snapshot, calibrates every category's FDV/TVL multiple from the snapshot's own live-token protocols, and ranks the 198 farmable pre-token protocols (all 40 watchlist protocols included) by implied value. Each protocol gets a six-step farm plan with concrete costs and times. Re-running the program on a new snapshot rebuilds the whole board from that snapshot's own numbers, so it finds future airdrops early.

## Run it

```sh
node main.ts /path/to/snapshot.json /path/to/output
```

With no arguments it reads `/input/snapshot.json` and writes to `/output` (the grader layout). Node 22, standard library only. Output is deterministic: two runs on the same snapshot write byte-identical files.

---

<sub>Entered on [make.fun](https://make.fun/?ref=tcwrfz5a&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
