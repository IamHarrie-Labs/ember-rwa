# Ember — Demo Day runbook

5 minutes total, up to 1 for questions. Mapped directly to the four things the judges
were told to look for. Don't open with slides — open with the live dashboard already on
screen.

## 0. Before you go on stage

- [ ] `https://ember-rwa.vercel.app/dashboard` open in a tab, both assets showing BRIGHT
- [ ] `https://ember-rwa.vercel.app/asset/<usebeni-id>` open in a second tab
- [ ] Your DNS registrar console open in a third tab, logged in, TXT record for
      `usebeni.xyz` visible and ready to delete
- [ ] Wallet extension has `0xF6491745Be58d39594484AEfC209b79d037Bb2FB` imported and
      connected to BOT Chain mainnet
- [ ] Run the balance check below — top up the relayer if it's under ~0.01 BOT so it
      doesn't starve mid-demo:
      ```bash
      cd agent && node -e "require('dotenv').config({path:'../.env'});const{ethers}=require('ethers');(async()=>{const p=new ethers.JsonRpcProvider('https://rpc.botchain.ai',undefined,{staticNetwork:true});console.log(ethers.formatEther(await p.getBalance(new ethers.Wallet(process.env.VERIFIER_KEY).address)))})()"
      ```

## 1. Core use case and target users — 45s

Say this, don't read a slide:

> "Every tokenized real-world asset today is a photograph of a verification that happened
> once, at mint. The domain expires, the revenue stream dies, the registry entry gets
> revoked — the token keeps trading like nothing changed, because nobody's watching.
> Ember makes that impossible. An asset's evidence has to stay fresh or the token stops
> trading on its own — no admin, no committee, no one to notice. We built it for domains
> first because ownership there is provable in seconds by anyone with `dig`, but the same
> primitive works for any asset with continuously checkable evidence — merchant revenue,
> leases, anything."

Target users named explicitly: **issuers who want their asset's trustworthiness to be
continuously provable, not a one-time claim** — and **holders who want to know an asset
is still real right now, not "was real when someone checked."**

## 2. Live demo of core product flow — 2m30s

This is the section that has to actually work. Two moves, both on real mainnet:

**Move 1 — show the mechanism (45s).** Point at the dashboard: two assets, different
grades, different burn times, counting down live. Click into `usebeni.xyz`. Point at
`GOES OUT IN` and say: *"This isn't a number we calculate and publish — it's read straight
off the contract. Anyone in this room can pull up scan.botchain.ai right now and check the
same thing themselves."*

**Move 2 — the kill sequence, live, for real (1m45s).** This is the moment that proves the
claim. Say it plainly first:

> "There is no simulate button here. I'm going to delete this domain's DNS record right
> now, live, and we watch the chain react — because the entire claim is that nobody,
> including us, can freeze or fake this."

Switch to the registrar tab, delete the TXT record for `usebeni.xyz`, switch back to the
dashboard. Narrate while it counts down: *"Next verification pass finds nothing to prove —
nothing gets written. In under two minutes this asset dims, then goes out — transfers
revert, revenue escrows, redemption opens. Nobody decided that in the moment; it was set
the day the asset was admitted."*

If it hasn't flipped by the time you need to move on, that's fine — say so and point at the
countdown: *"It'll finish in the next minute — you can watch scan.botchain.ai after this."*
Never fake it. **Re-publish the TXT record after the demo** so the asset recovers for the
next presenter's audience browsing the site.

## 3. How BOT Chain Mainnet is integrated — 45s

Have the contract addresses page (`/docs#contract` or the footer) visible for a second.

> "Every contract you just saw is deployed on BOT Chain mainnet, chain 677 — not testnet,
> mainnet, right now. We chose BOT Chain specifically because our safety model depends on
> writing a proof on a predictable schedule, and BOT Chain has a flat 20 gwei fee with zero
> base fee — no auction to lose, which would look identical to an asset actually going bad.
> 0.75-second blocks mean an asset goes out within one block of its actual deadline, not
> rounded to some slower chain's block time."

## 4. Key AI-native / RWA capabilities — 45s

> "AI's job here is narrow and specific: it reads deterministic evidence — DNS, RDAP, HTTP
> — and grades the asset A through E, which sets how long a single proof carries it. A
> clean, decade-old domain earns hours before it needs to be re-checked. A brand-new one
> gets ninety seconds. A second model then argues the grade *down* and is never allowed to
> argue it up — dissent can only shorten the leash, never lengthen it. The model never
> writes a number to the chain, only a letter from a fixed public table anyone can read.
> That's the difference between AI setting a business parameter and an LLM just putting an
> arbitrary number on-chain."

## Fallback if live internet/DNS is unreliable at the venue

Skip the live delete. Instead:
1. Show the dashboard and the asset page exactly as above.
2. Open `/docs#kill-sequence` and walk through the second-by-second timeline table —
   it's the same real behavior, pre-narrated.
3. Say explicitly: *"I'm not simulating this live given the venue wifi — here's the exact
   second-by-second sequence from a real run, and you can trigger it yourself after this
   from the dashboard."*

Never fake a live delete that didn't happen. Honesty about the fallback is worth more than
a smooth fake.

## Answering the 1-minute question window

Likely questions and the honest answer:

- **"What happens if your relayer goes offline?"** → Anyone can relay a valid signed proof
  and claim a reward from the funded pool — permissionless, not just theoretically.
- **"Is this audited?"** → No. Domain assets are low-stakes enough to demo unaudited;
  that's explicitly the next step before real value moves through it, not a gap we're
  hiding.
- **"Who can freeze an asset?"** → Nobody. Say it exactly that flatly — it's the whole
  point.
- **"What's next?"** → DNSSEC on-chain verification to remove the relayer from the
  liveness path entirely, and merchant revenue as the second asset class.
