const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const KIND = ethers.keccak256(ethers.toUtf8Bytes("domain"));
const IDENTIFIER = ethers.keccak256(ethers.toUtf8Bytes("example.com"));
const BURN_TIME = 90n;
const ID = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [KIND, IDENTIFIER]);
const uint = (id) => BigInt(id);

describe("RevenueEscrowV2 — self-funding reward pool", function () {
  let registry, verifier, token, escrow;
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
    escrow = await (
      await ethers.getContractFactory("RevenueEscrowV2")
    ).deploy(await registry.getAddress(), await token.getAddress());

    await registry.connect(issuer).register(KIND, IDENTIFIER, "ipfs://pending");
    await registry
      .connect(underwriter)
      .admit(ID, await verifier.getAddress(), BURN_TIME, "ipfs://memo");
    await token.connect(issuer).mint(ID);
    await token.connect(issuer).transferFrom(issuer.address, buyer.address, uint(ID));
  });

  it("routes the default 5% fee into the registry's reward pool and accrues the rest", async function () {
    await escrow.deposit(ID, { value: ethers.parseEther("1") });

    expect(await registry.rewardPool()).to.equal(ethers.parseEther("0.05"));
    expect(await escrow.accrued(ID)).to.equal(ethers.parseEther("0.95"));
  });

  it("pays the holder exactly the net amount, fee already routed away", async function () {
    await escrow.deposit(ID, { value: ethers.parseEther("2") });

    const before = await ethers.provider.getBalance(buyer.address);
    const tx = await escrow.connect(buyer).claim(ID);
    const receipt = await tx.wait();
    const after = await ethers.provider.getBalance(buyer.address);

    expect(after - before + receipt.gasUsed * receipt.gasPrice).to.equal(ethers.parseEther("1.9"));
  });

  it("lets the owner tune the fee within the cap", async function () {
    await escrow.connect(owner).setFeeBps(1000); // 10%
    await escrow.deposit(ID, { value: ethers.parseEther("1") });
    expect(await registry.rewardPool()).to.equal(ethers.parseEther("0.1"));
  });

  it("refuses a fee above the hard ceiling, even for the owner", async function () {
    await expect(escrow.connect(owner).setFeeBps(2001)).to.be.revertedWithCustomError(
      escrow,
      "FeeTooHigh"
    );
  });

  it("refuses to let anyone but the owner change the fee", async function () {
    await expect(escrow.connect(buyer).setFeeBps(0)).to.be.revertedWithCustomError(
      escrow,
      "OwnableUnauthorizedAccount"
    );
  });

  it("still escrows and releases on redemption exactly like V1", async function () {
    await escrow.deposit(ID, { value: ethers.parseEther("1") }); // 0.95 net accrues
    await time.increase(Number(BURN_TIME) * 2 + 5);
    await registry.connect(issuer).markRedeemable(ID);

    const before = await ethers.provider.getBalance(buyer.address);
    const tx = await escrow.connect(buyer).release(ID);
    const receipt = await tx.wait();
    const after = await ethers.provider.getBalance(buyer.address);

    expect(after - before + receipt.gasUsed * receipt.gasPrice).to.equal(ethers.parseEther("0.95"));
  });
});
