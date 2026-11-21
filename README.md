# GERBANG TAPEOUT

A browser logic-puzzle game where you build circuits from real on-chain TapeOut
gates: every puzzle target is checked against a live TapeOut circuit on X Layer —
read-only, no wallet needed.

- **Play live:** https://gemmaworks.web.id/tapeout/
- **Demo video (2:50):** https://www.youtube.com/watch?v=CGtPf-tDohk
- **Built for:** OKX X Layer TapeOut Accelerate (Xccelerate Hackathon 2026)

## How to play

No build step, no backend, no wallet, no account. Open `index.html` in a browser,
or serve locally:

```
python3 -m http.server
```

then open http://localhost:8000.

Wire NAND gates (and a LATCH) on the canvas to match the target truth table.
10 levels: NOT, AND, OR, XOR, Half-Adder, Full-Adder, Majority 2-of-3, 2-bit Adder,
D-Latch, 4-bit Adder (35 NAND gates). Stars, coins, and a "proof panel" per level.

**SIRKUIT ONCHAIN mode:** browse all 6 real circuits — netlist rendered gate by
gate, local simulation vs. expected output per row, **live on-chain `eval()`**
verification of every row (badges COCOK / TIDAK COCOK), threshold sliders +
live eval for the ViperX risk circuits, and a "guess the output" quiz.

## TapeOut integration

6 real, verified on-chain circuits (21 Nov 2026, snapshot block 76,470,115),
on X Layer (chain ID 196):

| Circuit | Name | Processor | Gates | Verification |
|---|---|---|---|---|
| 1.268.tape | XBOT NAND-2 | XBOT (#268) | 3 | Full truth table, 4/4 live eval |
| 3.268.tape | XBOT Consensus 2-of-3 | XBOT (#268) | 8 | Full truth table, 8/8 live eval |
| 1.424.tape | ViperX #1 — leverage ≤ 2000 (20.00x) | ViperX Risk Guardian (#424) | 38 | 5 threshold spot-checks |
| 2.424.tape | ViperX #2 — *likely* slippage ≤ 100 (1%) | ViperX (#424) | 41 | 5 spot-checks |
| 3.424.tape | ViperX #3 — *likely* drawdown ≤ 156 | ViperX (#424) | 37 | 5 spot-checks |
| 4.424.tape | ViperX #4 — *likely* cooldown ≥ 5 | ViperX (#424) | 42 | 5 spot-checks |

- Processor XBOT: `0xa5fc69Ca2D3d462CCa204D894D85ac8071c4F0f0`
- Processor ViperX Risk Guardian: `0xb57b56034e2dc25161e2512CfC40b24EA3bee1Fb`
- TapeOut Factory: `0x1f09daefa827f02cbb40967cc91b259763760761` — `cpuCount()` = 438
- **Total: 124 on-chain `eval()` calls, 0 mismatches** vs. the decoded-netlist simulator.

How it works: `netlist(tokenId)` returns the raw NAND netlist; the game decodes
and renders it. `eval(tokenId, bits)` is called read-only via public X Layer RPCs
(`rpc.xlayer.tech`, `xlayerrpc.okx.com`, `xlayer.drpc.org`). Level 7's target is
the full 8-row truth table of **3.268.tape**, verified live. **No wallet, no
signature, no transaction, no gas — ever.** Works fully offline from the local
snapshot in `data/circuits.json`; live checks degrade gracefully to OFFLINE status
when RPC is unreachable.

### Honest caveats

- Both processors are **BeaconProxy contracts pointing at one shared
  UpgradeableBeacon** — upgradeable by the beacon owner. Do not claim immutability.
- The ABI was **reconstructed from deployed bytecode**. Explorer "verified source"
  status is unconfirmed.
- **ViperX #2–#4 names are "likely", not proven:** only #1 (leverage ≤ 2000) is
  strongly matched to the docs.
- No on-chain adder or latch exists among these 6 netlists — adder/latch levels
  are local compositions; this is stated in the game, not hidden.

## Files

- `index.html` — game page (Indonesian UI)
- `app.js` — game logic, on-chain live eval, circuit explorer
- `style.css` — styling
- `data/circuits.json` — local snapshot of the 6 circuits (netlists, hashes, addresses)
- `gerbang-tapeout-logo-256.png` — project logo (256×256)

## License

MIT — see `LICENSE`. Copyright (c) 2026 Gemma Hadi / GEMMA WORKS.
