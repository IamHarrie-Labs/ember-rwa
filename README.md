# Ember

**An ember dies unless it is fed.**

A verification primitive for real-world assets on BOT Chain. Every tokenized asset burns
for a set time on one proof. Feed it fresh evidence and it keeps burning. Stop, and it
goes out — not because an administrator froze it, but because the state that permits
trading is derived from evidence freshness and simply stops being true.

Track: **RWA Applications**. AI is the origination and risk-parameterization engine, not
a chatbot bolted onto the front end.

[**Live site**](https://ember-rwa.vercel.app) · [Dashboard](https://ember-rwa.vercel.app/dashboard) · [Docs](https://ember-rwa.vercel.app/docs) · [List an asset](https://ember-rwa.vercel.app/list) · [Explorer](https://scan.botchain.ai)

---

## The invariant

> **No asset may trade unless its supporting evidence is still fresh.**

Contracts, state machine, proof cycle, AI, revenue, redemption — everything in this
repository is a consequence of that one line.

## The problem

Every RWA token in existence is a photograph of a verification that happened once. An
issuer checks a deed, an invoice, a registry entry — once, at mint — then mints a token
asserting "this is real." From that moment the token is a claim about the past. The
domain expires. The revenue stream dies. The registry entry is revoked. The token keeps
trading, still asserting a fact that stopped being true months ago.

The industry's answer is a quarterly PDF from an auditor and an admin key that can freeze
things if somebody notices. That is not verification — it is trust with a longer feedback
loop. Ember asks a different question: not "was this asset ever real?" but **"is it still
real right now, and what happens the moment it isn't?"**

## How it works

State is a pure function of time since the last valid proof. There is no flag to flip:

```
state(asset) =
    if   redeemable                      -> Redeemable
    elif broken                          -> Broken
    elif age <= burnTime                 -> Live
    elif age <= 2 * burnTime             -> Degraded
    else                                 -> Stale

where age = block.timestamp - lastAttestedAt
```

`burnTime` is how long a single proof carries the asset, set once at admission by an AI
underwriter reading deterministic evidence. Past it, the asset trades flagged. Past twice
it, transfers revert, revenue escrows, and redemption opens — with nobody deciding that in
the moment.

1. **Prove ownership** — the owner signs `ember:<domain>:<issuer>` and publishes it as a
   DNS TXT record. Verifiable by anyone with `dig` and `ethers.verifyMessage`, no software
   of ours required.
2. **Underwrite** — two AI models run in sequence: one grades the evidence A–E, the other
   argues the grade down and can never argue it up. The grade sets the burn time from a
   fixed public table.
3. **Verify on schedule** — a background process rechecks the record and writes proof
   on-chain. Submission is permissionless and rewarded, so the protocol does not brick if
   one relayer goes offline.
4. **Let time do the rest** — no proof, no state to maintain. The asset stops trading on
   its own.

Full architecture, the facts-vs-judgment separation, verifier design, and the economic
backstop are written up in [`PROJECT.md`](PROJECT.md).

## Deployed on BOT Chain Mainnet

| Contract | Address |
|---|---|
| EmberRegistry | [`0x743ecCd95655b42756bB66bE30F5d07c46349936`](https://scan.botchain.ai/address/0x743ecCd95655b42756bB66bE30F5d07c46349936) |
| AssetToken | [`0xBAd328f91418E7725084Ab0D026F4D91800cA989`](https://scan.botchain.ai/address/0xBAd328f91418E7725084Ab0D026F4D91800cA989) |
| SignedAttestationVerifier | [`0x0E8B4F9670fA4942382C77ADD76d9A97840ba6f9`](https://scan.botchain.ai/address/0x0E8B4F9670fA4942382C77ADD76d9A97840ba6f9) |
| IssuerBond | [`0x80B4a168913A4Df539D01496601E1Febb6593FCe`](https://scan.botchain.ai/address/0x80B4a168913A4Df539D01496601E1Febb6593FCe) |
| RevenueEscrow | [`0xE99f93a33B2457690262Dc04ea9964C82AC10C36`](https://scan.botchain.ai/address/0xE99f93a33B2457690262Dc04ea9964C82AC10C36) |

Chain ID `677`, RPC `https://rpc.botchain.ai`. Nothing above is a placeholder — every
address is live and every function callable exactly as shown on the block explorer.

## Grading table

| Grade | Burn time | Reading |
|---|---|---|
| A | 6 hours | long history, registry-locked, stable operation |
| B | 3 hours | established, minor weaknesses |
| C | 1 hour | ordinary, unremarkable evidence |
| D | 15 minutes | thin history or a missing lock |
| E | 90 seconds | no history, or evidence about to lapse |

The model never writes a number to the chain — it picks a letter from five, and the
mapping from letter to seconds is code anyone can read.

## Self-serve listing

Listing an asset does not require us. At [`/list`](https://ember-rwa.vercel.app/list),
any wallet can:

1. Sign the control message and get the exact DNS TXT record to publish.
2. Register the domain directly on-chain (`EmberRegistry.register`, permissionless).
3. Wait for the next scheduled underwriting pass to pick it up automatically — the agent
   polls the registry for unadmitted assets rather than working off a hardcoded list.

Nobody holding this repository's keys has to act for a new asset to reach the chain.

## What this does not do

- **No registrar integration.** A token is a claim on a continuously monitored asset, not
  automated transfer of the domain itself. An issuer bond is the economic substitute.
- **Verifiers are allowlisted for now.** Submission is permissionless; signing is not. A
  staked, open verifier set is on the roadmap.
- **One arbiter decides contested breaks today.** The one remaining trusted role, named
  rather than hidden. A staked jury is planned.
- **No secondary marketplace.** Assets transfer directly; there is no listing contract yet.
- **Model output is an estimate, not an appraisal.** Every memo cites the evidence it
  relied on so a reader can check it and disagree.
- **DNS is the root of trust.** A compromised registrar account is reported, not prevented.

The full list, with reasoning for each limit, is on the [docs page](https://ember-rwa.vercel.app/docs).

## Repository layout

```
contracts/       EmberRegistry, AssetToken, IssuerBond, RevenueEscrow, verifiers
agent/           proof cycle, underwriter, evidence collection, chain plumbing
  lib/           evidence.js, grading.js, model.js, chain.js, canonical.js, publish.js
scripts/         deploy.js, keys.js, gas.js
test/            47 tests: contracts, evidence, grading, underwriting, full e2e harness
web/             Next.js frontend — landing page, dashboard, asset detail, self-serve /list, /docs
deployments/     addresses written by scripts/deploy.js, one file per network
PROJECT.md       full architecture writeup
```

## Running it locally

Requires Node 18+.

```bash
npm install
cp .env.example .env        # fill in DEPLOYER_KEY, VERIFIER_KEY at minimum
npm test                    # 47 tests: contracts, agent, full e2e harness
```

**Deploy to a local Hardhat network:**

```bash
npm run deploy:local
```

**Deploy to BOT Chain mainnet** (requires a funded `DEPLOYER_KEY`):

```bash
npm run deploy:botchain
```

**List and verify a real domain from the CLI:**

```bash
npm run prove -- example.com          # prints the TXT record to publish
npm run underwrite -- example.com     # grades it and admits it on-chain
```

**Run the proof cycle:**

```bash
npm run cycle              # continuous
npm run cycle:once --dry   # one pass, no transaction
```

**Run the frontend:**

```bash
cd web
npm install
npm run dev
```

## Measured, not asserted

Every number below is reproducible from `scripts/gas.js` or a live read against the
deployed contracts — none of it is a projection.

| | |
|---|---|
| Gas per attestation | 79,660 (0.0016 BOT at 20 gwei) |
| Batched, 3 assets | 33.7% cheaper per asset |
| Block time | 0.75s, measured over 20 blocks |
| Tests | 47, all passing — contracts, agent, and full end-to-end |
| Admin functions that can pause, freeze, or extend an asset's clock | 0 |

## License

MIT — see [`LICENSE`](LICENSE).
