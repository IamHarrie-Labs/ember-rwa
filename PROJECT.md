# Ember

**An ember dies unless it is fed.**

A verification primitive for real-world assets on BOT Chain. Each tokenized asset burns
for a set time on one proof. Feed it fresh evidence and it keeps burning. Stop, and it
goes out — not because an administrator froze it, but because the state that permits
trading is derived from evidence freshness and simply stops being true.

Track: RWA Applications. AI is the origination and risk-parameterization engine.

---

## The invariant

> **No asset may trade unless its supporting evidence is still fresh.**

Contracts, state machine, proof cycle, AI, revenue, redemption — everything below is a
consequence of that one line.

## The problem

Every RWA token in existence is a photograph of a verification that happened once.

An issuer checks a deed, an invoice, a registry entry — once, at mint — then mints a
token asserting "this is real." From that moment the token is a claim about the past.
The domain expires. The revenue stream dies. The registry entry is revoked. The token
keeps trading, still asserting a fact that stopped being true months ago.

The industry's answer is a quarterly PDF from an auditor and an admin key that can
freeze things if somebody notices. That is not verification. That is trust with a
longer feedback loop.

The interesting failure is not "was this asset ever real?" It is **"is it still real
right now, and what happens the moment it isn't?"**

## Proof decay

Claims decay unless continuously renewed by evidence.

Ember never asks "is this token allowed to transfer?" and consults a flag. There is no
flag. State is a pure function of time since the last valid proof:

```
state(asset) =
    if   redeemable                      -> Redeemable
    elif broken                          -> Broken
    elif age <= burnTime                 -> Live
    elif age <= 2 * burnTime             -> Degraded
    else                                 -> Stale

where age = block.timestamp - lastAttestedAt
```

`burnTime` is how long a single proof carries the asset. Past it, the ember is dimming
but still alive — the asset trades, flagged. Past twice it, the ember is out and the
asset does not trade, because the state that would permit the transfer does not exist.

**Going out is the default. Staying lit is what costs effort.** Nobody has to act to
kill an asset, and nobody can prevent it.

The contract keeps functional state names so the code stays boring and auditable. The
interface speaks the other language: bright, dimming, out.

### Why derived state matters

The conventional design:

```
admin  ->  setFrozen(true)  ->  transfer blocked
```

A mutable boolean, a privileged caller, a transaction that may never be sent, and a
human who has to notice first.

Ember:

```
evidence  ->  timestamp  ->  derived state  ->  transfer()
```

No mutable flag. No freeze transaction. No emergency switch. No one to pressure and no
one to trust. The impossible state — *expired domain, tradable token* — has no
representation in the system.

## Layers

```
Evidence        raw DNS / RDAP / HTTP responses, hashed
    |
Verifier        IEvidenceVerifier: is this proof valid for this asset?
    |
Registry        derives state from freshness and verdict
    |
Token           ERC-721 whose transfer hook reads the registry
```

Asset classes plug in at the verifier layer. Domains are the first instance, not the
product. Deeds, invoices, carbon serials and merchant revenue become *evidence
providers* rather than special cases.

## Why domains first

Domains are the only RWA class where ownership is provable for free, in seconds, by
anyone, with no custodian and no lawyer. Expiry and transfer status are public via RDAP,
and control can be re-verified continuously, which is exactly what a proof cycle needs.

**The control record.** The issuer's wallet signs the message `ember:<domain>:<issuer>`
and publishes the signature as a TXT record at the domain apex:

```
ember=0x<signature>
```

Publishing it proves the same party controls both the wallet and the zone. Verification
needs nothing from us — recover the signer from the message and compare:

```
dig +short TXT example.com
ethers.verifyMessage("ember:example.com:0xIssuer", signature)
```

Two commands, no software of ours in the loop, no account to create. That is what
"authenticity a stranger can check" means in practice.

## Facts and judgments are separated

This separation is the core of the design, and it is what keeps degradation
non-discretionary.

**Deterministic facts drive `Stale`.** TXT record present, RDAP expiry, HTTP status,
nameserver match. No model, no judgment, no discretion. A machine either produced a
valid proof inside the window or it did not.

**AI judgment drives `Broken`** — a separate, slower path with a challenge window. The
model can propose that a claim is materially invalidated (nameservers moved, pending
transfer, site turned into a parked page or a scam redirect, category shifted enough to
void the underwriting comparables). The issuer can contest inside the window. A fresh
proof dismisses the proposal automatically, because the evidence answered it. An LLM can
never instantly freeze an asset.

**And the AI's primary on-chain act is setting the burn time.** At admission the
underwriter grades the asset and writes how long one proof will carry it. A clean, aged,
stable domain earns hours. A thin or volatile one burns fast and must be fed constantly.
That is model judgment written directly into a business parameter governing the asset
for its entire life — deterministic once written, and visible as two assets of different
quality decaying at visibly different rates on the same screen.

**The model grades; a fixed public table converts the grade to seconds.**

| Grade | Burn time | Reading |
|---|---|---|
| A | 6 hours | long history, registry-locked, stable operation |
| B | 3 hours | established, minor weaknesses |
| C | 1 hour | ordinary, unremarkable evidence |
| D | 15 minutes | thin history or a missing lock |
| E | 90 seconds | no history, or evidence about to lapse |

The model never writes a number. It picks a letter from five, and the mapping is code
anyone can read. That is the difference between "AI sets the burn time" and "an LLM can
put an arbitrary value on-chain."

**Dissent can only shorten the leash.** Two models run at admission: an underwriter that
argues for the asset with cited evidence, and an adversary that argues against it. The
adversary may recommend a worse grade and may never recommend a better one, so the
protocol takes the more conservative of the two. A dissent that could raise the grade
would be a second opinion; a dissent that can only lower it is a safety property.

The protocol survives without AI. Replace the underwriter with a human committee or a
rule engine and everything still functions. AI is the best available evidence
interpreter, not the moat.

## Verifiers

`IEvidenceVerifier.verify(assetId, identifier, proof) -> (ok, observedAt, evidenceHash)`

**SignedAttestationVerifier** (v1 baseline). EIP-712 signed observations from an
allowlisted key. Submission is **permissionless** — anyone can relay a valid signed proof
and claim a reward from the on-chain pool, so the protocol does not brick if the primary
relayer dies. Signatures also carry a hard maximum age, so a stockpiled signature cannot
revive a dead asset.

**DnssecVerifier** (contingent upgrade). Verifies DNSSEC RRSIG chains on-chain against
the root anchor — no relayer, no trusted party, pure cryptography. Two properties make it
fit here:

- On-chain DNSSEC verification is gas-expensive, which is why almost nobody does it. On a
  sub-second, near-zero-fee chain it is affordable. Another structural argument for BOT
  Chain.
- Proving a record was *deleted* requires NSEC denial-of-existence proofs, the ugliest
  corner of DNSSEC. Ember never needs them: absence of a fresh positive proof *is* the
  failure. Decay-by-default only ever needs the easy half of DNSSEC.

Shipping even one mainnet asset under `DnssecVerifier`, with the rest on signed
attestation, proves the architecture. It is an upgrade path, not a dependency.

## Evidence bundles

Every attestation hashes the **raw** upstream responses — full DNS answer, full RDAP
JSON, HTTP response headers — not just the parsed conclusion. Bundles are published and
content-addressed, so any third party can re-verify exactly what the verifier saw rather
than taking its word for the summary.

Underwriting memos publish the exact prompt, model ID, input bundle and output, all
hashed on-chain. Anyone can re-run the inference and compare. Reproducible rather than
attested-by-hardware, and honest about which it is.

## Economic enforcement

Verification detects that an asset went bad. It cannot by itself make a holder whole.

**Issuer bond.** The issuer stakes collateral at admission. If the asset is finalized
`Broken`, anyone can slash the bond to the current holder — permissionless and
mechanical, so nobody has to be persuaded. The issuer can only recover a bond while no
outside holder is exposed. Without this, an issuer could sell, keep the proceeds, and
still control the domain at the registrar.

**Revenue.** Lease or parking revenue accrues to the holder, claimable only while the
evidence is fresh, escrowed when it lapses, released on redemption to the holder who
carried the failure.

## States

| State | Interface | Transfers | Revenue | Meaning |
|---|---|---|---|---|
| Pending | unlit | blocked | — | registered, not yet underwritten |
| Live | bright | allowed | claimable | evidence fresh |
| Degraded | dimming | allowed, flagged | claimable | past one burn time |
| Stale | out | blocked | escrowed | past twice the burn time |
| Broken | out | blocked | escrowed | claim finalized invalid; bond slashed |
| Redeemable | ash | burn only | released | wind-down |

Burn time is per-asset, set by the underwriter, and the portfolio runs at two tiers that
reflect genuine differences in risk rather than demo convenience:

- **Aged domains with real history** carry a 6-hour burn time on a 3-hour cycle. Their
  evidence does not change minute to minute, and pretending otherwise would be theatre.
- **Fresh throwaway domains** carry a 90-second burn time on a 60-second cycle. No
  history, no track record, so nothing about them is trusted for long.

The two decay at visibly different rates on the same screen, which is the clearest
available demonstration that the underwriter is doing something. It also means a failure
resolves inside a live presentation without every asset needing minute-level cost.

## Contracts

- **EmberRegistry** — asset records, `stateOf()` as a pure derivation, permissionless
  attestation intake, reward pool, break proposal and challenge window. Contains no
  function that pauses, freezes, or extends an asset's clock, and a test asserts that
  against the ABI.
- **IEvidenceVerifier / SignedAttestationVerifier / DnssecVerifier** — pluggable proof
  validation per asset class.
- **AssetToken** — ERC-721 where `tokenId` *is* the registry `assetId`, so the token and
  the claim share one identifier and cannot drift apart. The transfer hook is the entire
  enforcement surface.
- **IssuerBond** — stake at admission, permissionlessly slashed to the holder on a
  finalized break.
- **RevenueEscrow** — accrual with a freshness condition. Whole-asset ownership means a
  single holder, so this is an escrow rather than a pro-rata split; pro-rata arrives with
  fractionalization.

Whole-asset ERC-721 rather than fractional in v1: fractionalized yield is a textbook
securities question, and defending it under time pressure is not the fight worth picking.
Fractionalization is a later layer on the same rail.

## Business loop

1. **Issue** — owner submits a domain, proves control via a signed DNS TXT nonce.
2. **Underwrite** — AI grades the asset, publishes a cited memo plus an adversarial
   critique, writes the burn time on-chain, issuer posts bond.
3. **Verify** — the proof cycle feeds the ember continuously; permissionless relay; live
   countdown on the asset page.
4. **Distribute** — fixed-price listing, wallet connect, whole-asset transfer.
5. **Yield** — lease or parking revenue accrues to the holder, claimable while fresh.
6. **Degrade** — evidence lapses, transfers halt, escrow holds, redemption opens, bond
   slashes on a finalized break.

Every step is on-chain and independently verifiable by a stranger.

## Why BOT Chain, structurally

Measured against mainnet on 2026-08-16, not assumed:

| Property | Measured | Why it matters here |
|---|---|---|
| Block time | **0.75s** over 20 blocks | An asset goes out within a block of the deadline. Decay is observable in real time rather than on the next block-time boundary. |
| Base fee | **0** | No EIP-1559 base fee to spike. Cycle cost is flat and can be budgeted a week ahead. |
| Priority fee | flat **20 gwei**, blocks empty | No fee auction to lose. A cycle scheduled for 14:00 costs the same as one at 03:00. |
| Chain ID | 677 (0x2a5), EVM | Parlia consensus, EIP-4844 supported. |

Continuous verification needs *predictable* cost far more than it needs cheap cost: a
protocol whose safety depends on writing on schedule cannot be exposed to a fee auction,
because losing one is indistinguishable from an asset going bad. A flat fee floor over
empty blocks is exactly that guarantee. On-chain DNSSEC verification, normally priced out
by RSA gas costs, is affordable for the same reason.

Measured cost of the proof cycle (`scripts/gas.js`, reproducible):

| Operation | Gas | Cost @ 20 gwei |
|---|---|---|
| `attest`, single asset | 79,660 | 0.001593 BOT |
| `attestMany`, 3 assets | 158,560 | 0.003171 BOT |
| per asset, batched | 52,853 | 0.001057 BOT |

Batching saves **33.7%** per asset. On the 1 BOT ecosystem grant that is 39 days of
continuous verification for three assets on a 3-hour cycle, or 5.3 hours on a 60-second
one — which is why burn time is per-asset rather than global.

One constraint worth recording: the public mainnet RPC serves `eth_getLogs` for spans up
to roughly 1,000 blocks and fails above that — about twelve minutes of history per call.
Current state is therefore read trustlessly from view calls (`stateOf`, `timeRemaining`,
`getAsset`), which need no logs at all, while the historical timeline is served from the
cycle's own append-only record with every row linking to the block explorer. Live state
requires trusting nobody; history is checkable against a third party.

## Failure modes

| Failure | Result |
|---|---|
| Primary relayer offline | Anyone can relay a valid proof and claim the reward. The pool is funded at deploy, so the incentive exists rather than being aspirational |
| One asset's proof is unusable | `attestMany` is atomic, so the batch reverts — then the cycle retries each asset individually. The bad asset fails alone; the rest keep their cycle |
| Agent clock drifts from chain time | Observations are timestamped from `block.timestamp`, not the local clock. Drift over 30s is logged rather than silently producing rejected proofs |
| All relayers offline | Assets go out; capital escrows; no wrong state is asserted |
| DNS resolution unavailable | No fresh proof; the ember goes out on schedule |
| Registrar account compromised | The proof cycle reports the change; it cannot prevent it |
| AI proposes a false break | Issuer contests, or a fresh proof dismisses it automatically |
| Gas pool exhausted | Same as relayer offline — going out, not false liveness |
| Chain halted | State frozen; no asset asserts freshness it does not have |

Every failure resolves toward *refusing to assert liveness*, never toward asserting it
falsely. That is the correct direction for a verification system, and it is a consequence
of decay-by-default rather than a set of handlers.

## Compliance posture

The question regulators ask is not "was it real at issuance" but "what happens when it
goes bad, and who decides." Ember's answer is that degradation is mechanical, observable
and non-discretionary: there is no one to pressure and no one to trust. The one
discretionary path — a finalized break — is time-delayed, contestable and economically
bonded.

## What this does not do

- **No registrar integration.** A token is a claim on a verified and continuously
  monitored asset, not automated transfer of the domain at the registrar. Underlying
  settlement is out of scope for v1; the issuer bond is the economic substitute.
- **Verifier allowlist in v1.** Submission is permissionless, but signing is not. Staked
  and slashable verifiers are roadmap.
- **Contested breaks resolve to an arbiter address in v1.** A staked jury is roadmap.
  This is the one remaining trusted role and it is named rather than hidden.
- **Valuations are model estimates, not appraisals.** Memos cite their evidence so a
  reader can disagree.
- **No secondary orderbook.** Fixed-price listings only.
- **DNS is the trust root.** A compromised registrar account is reported, not prevented.

## Roadmap

- **DnssecVerifier across all domain assets** — remove the relayer from the liveness path
  entirely.
- **zkTLS verifier for merchant revenue** (asset class two) — prove a Stripe or Shopify
  revenue history without surrendering credentials. This is where zkTLS is the correct
  tool; for public RDAP data it would be ceremony without gain.
- **Staked, slashable verifier set** and a staked jury for contested breaks.
- **TEE-attested inference** for underwriting, once the trust surface justifies it.
  Reproducible published inference covers most of the gap today.
- **Liveness as a composable primitive** — lending markets read `stateOf()` and decay
  loan-to-value as an asset dims, so collateral quality tracks evidence freshness
  automatically.

## Metrics to report

- gas per proof cycle, and cycles affordable per 1 BOT
- median latency from TXT deletion to on-chain `Stale`
- attestations written during the demo period
- contract test count and coverage
- live assets and mainnet contract addresses, explorer-linked

## Demo

1. Two assets side by side: one aged domain with a long burn time, one throwaway with a
   short one. Both bright, both counting down at visibly different rates.
2. Delete the throwaway's DNS TXT record — **for real**, in a DNS console or via the
   provider API. Never a simulate button. The entire credibility of the moment rests on
   there being no privileged path to freeze an asset; a faked failure would destroy the
   claim it is meant to prove.
3. State plainly: there is no admin key on this contract.
4. Watch it dim, then go out.
5. Transfers revert. Escrow holds. Redemption opens.
6. The judge confirms all of it on scan.botchain.ai from their own machine.
