// Prints the DNS TXT record an owner must publish to claim a domain.
//
//   node agent/prove.js example.com
//
// The signature is produced by the issuer's wallet over the domain it is claiming.
// Publishing it proves the same party controls both the wallet and the zone, and anyone
// can check that with `dig` and ethers.verifyMessage — no trust in us required.
const { ethers } = require("ethers");
require("dotenv").config();
const { controlMessage, expectedRecord } = require("./lib/evidence");
const { assetIdOf, identifierOf } = require("./lib/chain");

async function main() {
  const domain = (process.argv[2] || "").toLowerCase().trim();
  if (!domain) {
    console.error("usage: node agent/prove.js <domain>");
    process.exit(1);
  }

  const key = process.env.ISSUER_KEY || process.env.DEPLOYER_KEY;
  if (!key) throw new Error("set ISSUER_KEY in .env");
  const wallet = new ethers.Wallet(key);

  const message = controlMessage(domain, wallet.address);
  const signature = await wallet.signMessage(message);

  console.log(`\ndomain      ${domain}`);
  console.log(`issuer      ${wallet.address}`);
  console.log(`identifier  ${identifierOf(domain)}`);
  console.log(`assetId     ${assetIdOf(domain)}`);
  console.log(`\nsigned message`);
  console.log(`  ${message}`);
  console.log(`\npublish this TXT record at the apex of ${domain}:\n`);
  console.log(`  ${expectedRecord(signature)}\n`);
  console.log(`verify it yourself once it propagates:`);
  console.log(`  dig +short TXT ${domain}\n`);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
