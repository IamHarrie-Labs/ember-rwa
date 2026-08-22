const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const KIND = ethers.keccak256(ethers.toUtf8Bytes("domain"));
const IDENTIFIER = ethers.keccak256(ethers.toUtf8Bytes("example.com"));
const BURN_TIME = 90n;
const ID = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [KIND, IDENTIFIER]);

describe("asset, bond and escrow", function () {
  let registry, verifier, token, bond, escrow;
  let owner, underwriter, proposer, arbiter, issuer, buyer, signer;

  beforeEach(async function () {
    [owner, underwriter, proposer, arbiter, issuer, buyer, signer] = await ethers.getSigners();

    verifier = await (
      await ethers.getContractFactory("SignedAttestationVerifier")
    ).deploy(signer.address);
    registry = await (
      await ethers.getContractFactory("EmberRegistry")
    ).deploy(underwriter.address, proposer.address, arbiter.address);
    token = await (
      await ethers.getContractFactory("AssetToken")
    ).deploy(await registry.getAddress());
    bond = await (
      await ethers.getContractFactory("IssuerBond")
    ).deploy(await registry.getAddress(), await token.getAddress());
    escrow = await (
      await ethers.getContractFactory("RevenueEscrow")
    ).deploy(await registry.getAddress(), await token.getAddress());

    await registry.connect(issuer).register(KIND, IDENTIFIER, "ipfs://pending");
  });

  async function admit() {
    await registry
      .connect(underwriter)
      .admit(ID, await verifier.getAddress(), BURN_TIME, "ipfs://memo");
  }

  async function breakAsset() {
    await registry.connect(proposer).proposeBreak(ID, ethers.ZeroHash);
    await time.increase(3601);
    await registry.finalizeBreak(ID);
  }

  it("cannot mint before the underwriter admits the asset", async function () {
    await expect(token.connect(issuer).mint(ID)).to.be.revertedWithCustomError(
      token,
      "NotAdmitted"
    );
  });

  it("only the issuer can mint", async function () {
    await admit();
    await expect(token.connect(buyer).mint(ID)).to.be.revertedWithCustomError(token, "NotIssuer");
  });

  it("transfers while evidence is fresh, and stops when it lapses", async function () {
    await admit();
    await token.connect(issuer).mint(ID);
    await token.connect(issuer).transferFrom(issuer.address, buyer.address, uint(ID));
    expect(await token.ownerOf(uint(ID))).to.equal(buyer.address);

    // Nobody sends a transaction. The decay window simply closes.
    await time.increase(Number(BURN_TIME) * 2 + 5);
    await expect(
      token.connect(buyer).transferFrom(buyer.address, issuer.address, uint(ID))
    ).to.be.revertedWithCustomError(token, "EvidenceNotFresh");
  });

  it("slashes the bond to the holder when the asset breaks, callable by anyone", async function () {
    await admit();
    await bond.connect(issuer).postBond(ID, { value: ethers.parseEther("1") });
    await token.connect(issuer).mint(ID);
    await token.connect(issuer).transferFrom(issuer.address, buyer.address, uint(ID));

    await breakAsset();

    const before = await ethers.provider.getBalance(buyer.address);
    await bond.connect(owner).slash(ID); // not the holder, not the issuer
    const after = await ethers.provider.getBalance(buyer.address);

    expect(after - before).to.equal(ethers.parseEther("1"));
    expect(await bond.bondOf(ID)).to.equal(0n);
  });

  it("blocks the issuer from recovering a bond while an outside holder is exposed", async function () {
    await admit();
    await bond.connect(issuer).postBond(ID, { value: ethers.parseEther("1") });
    await token.connect(issuer).mint(ID);
    await token.connect(issuer).transferFrom(issuer.address, buyer.address, uint(ID));

    await expect(bond.connect(issuer).releaseBond(ID)).to.be.revertedWithCustomError(
      bond,
      "HolderAtRisk"
    );
  });

  it("escrows revenue once evidence lapses and releases it on redemption", async function () {
    await admit();
    await token.connect(issuer).mint(ID);
    await token.connect(issuer).transferFrom(issuer.address, buyer.address, uint(ID));
    await escrow.deposit(ID, { value: ethers.parseEther("2") });

    // Fresh: the holder can take it.
    await escrow.connect(buyer).claim(ID);
    expect(await escrow.accrued(ID)).to.equal(0n);

    await escrow.deposit(ID, { value: ethers.parseEther("3") });
    await time.increase(Number(BURN_TIME) * 2 + 5);

    await expect(escrow.connect(buyer).claim(ID)).to.be.revertedWithCustomError(
      escrow,
      "EvidenceNotFresh"
    );

    await registry.connect(issuer).markRedeemable(ID);
    const before = await ethers.provider.getBalance(buyer.address);
    const tx = await escrow.connect(buyer).release(ID);
    const receipt = await tx.wait();
    const after = await ethers.provider.getBalance(buyer.address);

    expect(after - before + receipt.gasUsed * receipt.gasPrice).to.equal(ethers.parseEther("3"));
  });

  it("burns on redemption", async function () {
    await admit();
    await token.connect(issuer).mint(ID);
    await time.increase(Number(BURN_TIME) * 3);
    await registry.connect(issuer).markRedeemable(ID);

    await token.connect(issuer).redeem(ID);
    await expect(token.ownerOf(uint(ID))).to.be.reverted;
  });
});

function uint(bytes32) {
  return BigInt(bytes32);
}
