// Generates the wallets the agent needs and writes them into .env.
//
//   node scripts/keys.js
//
// Idempotent: an existing key is never overwritten. Only addresses are printed — the
// private keys go straight into .env (git-ignored) and are never echoed to a terminal or
// a transcript.
//
// Two wallets, deliberately:
//   DEPLOYER_KEY  owns the contracts, admits assets, signs the DNS control records, and
//                 holds the gas. Cold-ish: used by hand.
//   VERIFIER_KEY  signs evidence observations inside the proof cycle. Hot — it runs
//                 unattended on whatever host the cycle lives on. It can only sign
//                 observations; it cannot touch roles, parameters or the reward pool.
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const ENV = path.join(__dirname, "..", ".env");

/// The issuer is the deployer for this demo — the same party owns the domains and the
/// contracts — so ISSUER_KEY mirrors DEPLOYER_KEY rather than being a third wallet.
const ROLES = ["DEPLOYER_KEY", "VERIFIER_KEY"];

function main() {
  if (!fs.existsSync(ENV)) {
    console.error("no .env found — copy .env.example to .env first");
    process.exit(1);
  }

  let text = fs.readFileSync(ENV, "utf8");
  const created = [];

  for (const role of ROLES) {
    const re = new RegExp(`^${role}=(.*)$`, "m");
    const match = text.match(re);
    if (match && match[1].trim()) {
      const wallet = new ethers.Wallet(match[1].trim());
      console.log(`${role.padEnd(14)} ${wallet.address}  (already set, left alone)`);
      continue;
    }
    const wallet = ethers.Wallet.createRandom();
    text = match
      ? text.replace(re, `${role}=${wallet.privateKey}`)
      : `${text.trimEnd()}\n${role}=${wallet.privateKey}\n`;
    created.push(role);
    console.log(`${role.padEnd(14)} ${wallet.address}  (new)`);
  }

  // The issuer signs the DNS control records. Same party as the deployer here.
  const deployer = text.match(/^DEPLOYER_KEY=(.*)$/m)[1].trim();
  if (/^ISSUER_KEY=\s*$/m.test(text)) {
    text = text.replace(/^ISSUER_KEY=.*$/m, `ISSUER_KEY=${deployer}`);
  }
  if (/^UNDERWRITER_KEY=\s*$/m.test(text)) {
    text = text.replace(/^UNDERWRITER_KEY=.*$/m, `UNDERWRITER_KEY=${deployer}`);
  }

  fs.writeFileSync(ENV, text);

  const address = new ethers.Wallet(deployer).address;
  console.log(`\nISSUER_KEY and UNDERWRITER_KEY mirror the deployer.`);
  console.log(`\nFund this address with BOT for gas:\n\n  ${address}\n`);
  if (created.length === 0) console.log("Nothing new was generated.\n");
}

main();
