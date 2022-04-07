const {expect, assert} = require("chai");

const {initEthers, assertThrowsMessage, getTimestamp, increaseBlockTimestampBy, bytes32Address} = require("./helpers");
const {upgrades} = require("hardhat");

// tests to be fixed

function normalize(val, n = 18) {
  return "" + val + "0".repeat(n);
}

// test unit coming soon

describe("#Integration test", function () {
  let WormholeMock, wormhole;
  let SyndicateERC20, synr;
  let SyntheticSyndicateERC20, sSynr;
  let SynrBridge, synrBridge;
  let SynrBridgeV2;
  let SeedFarm, seedFarm;
  let SideToken, seed;
  let SynCityPasses, pass;

  let deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury;

  before(async function () {
    initEthers(ethers);
    [deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury] = await ethers.getSigners();
    SyndicateERC20 = await ethers.getContractFactory("SyndicateERC20");
    SyntheticSyndicateERC20 = await ethers.getContractFactory("SyntheticSyndicateERC20");
    SynrBridge = await ethers.getContractFactory("SynrBridgeMock");
    SynrBridgeV2 = await ethers.getContractFactory("SynrBridgeV2Mock");
    SeedFarm = await ethers.getContractFactory("SeedFarmMock");
    SideToken = await ethers.getContractFactory("SideToken");
    WormholeMock = await ethers.getContractFactory("WormholeMock");
    SynCityPasses = await ethers.getContractFactory("SynCityPasses");
  });

  async function initAndDeploy() {
    const maxTotalSupply = 10000000000; // 10 billions
    synr = await SyndicateERC20.deploy(fundOwner.address, maxTotalSupply, superAdmin.address);
    await synr.deployed();
    let features =
      (await synr.FEATURE_TRANSFERS_ON_BEHALF()) +
      (await synr.FEATURE_TRANSFERS()) +
      (await synr.FEATURE_UNSAFE_TRANSFERS()) +
      (await synr.FEATURE_DELEGATIONS()) +
      (await synr.FEATURE_DELEGATIONS_ON_BEHALF());
    await synr.updateFeatures(features);

    sSynr = await SyntheticSyndicateERC20.deploy(superAdmin.address);
    await sSynr.deployed();

    pass = await SynCityPasses.deploy(validator.address);
    await pass.deployed();

    synrBridge = await upgrades.deployProxy(SynrBridge, [synr.address, sSynr.address, pass.address]);
    await synrBridge.deployed();

    await sSynr.updateRole(synrBridge.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER());

    seed = await upgrades.deployProxy(SideToken, ["Mobland SEED Token", "SEED"]);
    await seed.deployed();

    seedFarm = await upgrades.deployProxy(SeedFarm, [seed.address]);
    await seedFarm.deployed();
    await seedFarm.initPool(1000, 7 * 24 * 3600, 9800, 1000, 100);

    await seed.grantRole(await seed.MINTER_ROLE(), seedFarm.address);

    wormhole = await WormholeMock.deploy();
    await synrBridge.wormholeInit(2, wormhole.address);
    await wormhole.deployed();

    await synrBridge.wormholeRegisterContract(4, bytes32Address(seedFarm.address));
    await synrBridge.initPool(7, 4000);

    await seedFarm.wormholeInit(4, wormhole.address);
    await seedFarm.wormholeRegisterContract(2, bytes32Address(synrBridge.address));
  }

  async function configure() {}

  beforeEach(async function () {
    await initAndDeploy();
  });

  it("should manage the entire flow", async function () {
    const amount = ethers.utils.parseEther("10000");

    // stake SYNR in the SynrBridge
    const payload = await synrBridge.serializeInput(
      1, // SYNR
      365, // 1 year
      amount
    );

    expect(payload).equal("100000000000000000000003651");

    await synr.connect(fundOwner).approve(synrBridge.address, ethers.utils.parseEther("10000"));

    expect(
      await synrBridge.connect(fundOwner).wormholeTransfer(
        payload,
        4, // BSC
        bytes32Address(fundOwner.address),
        1
      )
    )
      .emit(synrBridge, "DepositSaved")
      .withArgs(fundOwner.address, 0);
    let deposit = await synrBridge.getDepositByIndex(fundOwner.address, 0);
    expect(deposit.tokenAmountOrID).equal(amount);
    expect(deposit.tokenType).equal(1);
    expect(deposit.otherChain).equal(4);

    const finalPayload = await synrBridge.fromDepositToTransferPayload(deposit);

    expect(await synr.balanceOf(synrBridge.address)).equal(amount);

    expect(await seedFarm.connect(fundOwner).mockWormholeCompleteTransfer(fundOwner.address, finalPayload))
      .emit(seedFarm, "DepositSaved")
      .withArgs(fundOwner.address, 0);

    expect(await seed.balanceOf(fundOwner.address)).equal(0);

    await increaseBlockTimestampBy(30 * 24 * 3600);

    await seedFarm.connect(fundOwner).collectRewards()
    let seedDeposit = await seedFarm.getDepositByIndex(fundOwner.address, 0);
    expect(seedDeposit.lastRewardsAt).equal(await getTimestamp());
    expect((await seed.balanceOf(fundOwner.address)).div(ethers.BigNumber.from(normalize(1, 21)))).equal("523830");

    await increaseBlockTimestampBy(336 * 24 * 3600);
    expect(seedDeposit.unlockedAt).equal(0);
    expect(seedDeposit.tokenAmount).equal(ethers.utils.parseEther("1000000"));
    const seedPayload = await seedFarm.fromDepositToTransferPayload(seedDeposit);

    const ts = await getTimestamp();

    // unstake
    expect(await seedFarm.connect(fundOwner).wormholeTransfer(seedPayload, 2, bytes32Address(fundOwner.address), 1))
      .emit(seedFarm, "DepositUnlocked")
      .withArgs(fundOwner.address, 0);

    seedDeposit = await seedFarm.getDepositByIndex(fundOwner.address, 0);
    expect(seedDeposit.unlockedAt).greaterThan(ts);

    const synrBalanceBefore = await synr.balanceOf(fundOwner.address);

    expect(await synrBridge.mockWormholeCompleteTransfer(fundOwner.address, seedPayload))
      .emit(synrBridge, "DepositUnlocked")
      .withArgs(fundOwner.address, 0);
    const synrBalanceAfter = await synr.balanceOf(fundOwner.address);
    expect(synrBalanceAfter.sub(synrBalanceBefore)).equal(amount);
  });

  it("should verify early unstake", async function () {
    const amount = ethers.utils.parseEther("10000");
    await synr.connect(fundOwner).transferFrom(fundOwner.address, user1.address, amount);

    // stake SYNR in the SynrBridge
    const payload = await synrBridge.serializeInput(
      1, // SYNR
      300,
      amount
    );

    expect(payload).equal("100000000000000000000003001");

    await synr.connect(user1).approve(synrBridge.address, ethers.utils.parseEther("10000"));

    await synrBridge.connect(user1).wormholeTransfer(
      payload,
      4, // BSC
      bytes32Address(user1.address),
      1
    );

    let deposit = await synrBridge.getDepositByIndex(user1.address, 0);
    expect(deposit.tokenAmountOrID).equal(amount);
    expect(deposit.tokenType).equal(1);
    expect(deposit.otherChain).equal(4);

    const finalPayload = await synrBridge.fromDepositToTransferPayload(deposit);

    expect(await synr.balanceOf(synrBridge.address)).equal(amount);

    await seedFarm.connect(user1).mockWormholeCompleteTransfer(user1.address, finalPayload);

    await increaseBlockTimestampBy(150 * 24 * 3600);

    expect(await seedFarm.canUnstakeWithoutTax(user1.address, 0)).equal(false);

    let seedDeposit = await seedFarm.getDepositByIndex(user1.address, 0);
    expect(seedDeposit.unlockedAt).equal(0);
    const seedPayload = await seedFarm.fromDepositToTransferPayload(seedDeposit);

    const synrBalanceBefore = await synr.balanceOf(user1.address);

    // unstake
    await seedFarm.connect(user1).wormholeTransfer(seedPayload, 2, bytes32Address(user1.address), 1);

    const ts = await getTimestamp()
    const tax = await synrBridge.calculatePenaltyForEarlyUnstake(ts, await synrBridge.getDepositByIndex(user1.address, 0));
    expect(amount.sub(tax)).equal("8000000000000000000000");

    await synrBridge.mockWormholeCompleteTransfer(user1.address, seedPayload);

    const synrBalanceAfter = await synr.balanceOf(user1.address);
    expect(synrBalanceAfter.sub(synrBalanceBefore)).equal(amount.sub(tax));

    expect(await synrBridge.collectedPenalties()).equal(tax);
    const synrBalanceBeforePenalty = await synr.balanceOf(user2.address);
    await synrBridge.withdrawPenalties(tax, user2.address);
    const synrBalanceAfterPenalty = await synr.balanceOf(user2.address);
    expect(await synrBalanceAfterPenalty).equal(synrBalanceBeforePenalty + tax);
  });

  it("should start the process, upgrade the contract and complete the flow", async function () {
    const amount = ethers.utils.parseEther("10000");

    // stake SYNR in the SynrBridge
    const payload = await synrBridge.serializeInput(
      1, // SYNR
      365, // 1 year
      amount
    );

    expect(payload).equal("100000000000000000000003651");

    await synr.connect(fundOwner).approve(synrBridge.address, ethers.utils.parseEther("10000"));

    await synrBridge.connect(fundOwner).wormholeTransfer(
      payload,
      4, // BSC
      bytes32Address(fundOwner.address),
      1
    );

    let deposit = await synrBridge.getDepositByIndex(fundOwner.address, 0);
    expect(deposit.tokenAmountOrID).equal(amount);
    expect(deposit.tokenType).equal(1);
    expect(deposit.otherChain).equal(4);

    const finalPayload = await synrBridge.fromDepositToTransferPayload(deposit);

    expect(await synr.balanceOf(synrBridge.address)).equal(amount);

    await seedFarm.connect(fundOwner).mockWormholeCompleteTransfer(fundOwner.address, finalPayload);

    await increaseBlockTimestampBy(366 * 24 * 3600);

    // upgrade contract

    expect(await synrBridge.version()).equal(1);

    synrBridge = await upgrades.upgradeProxy(synrBridge.address, SynrBridgeV2);

    expect(await synrBridge.version()).equal(2);

    let seedDeposit = await seedFarm.getDepositByIndex(fundOwner.address, 0);
    expect(seedDeposit.unlockedAt).equal(0);
    const seedPayload = await seedFarm.fromDepositToTransferPayload(seedDeposit);

    const ts = await getTimestamp();
    // unstake
    await seedFarm.connect(fundOwner).wormholeTransfer(seedPayload, 2, bytes32Address(fundOwner.address), 1);
    seedDeposit = await seedFarm.getDepositByIndex(fundOwner.address, 0);

    expect(seedDeposit.unlockedAt).greaterThan(ts);

    const synrBalanceBefore = await synr.balanceOf(fundOwner.address);

    await synrBridge.mockWormholeCompleteTransfer(fundOwner.address, seedPayload);
    const synrBalanceAfter = await synr.balanceOf(fundOwner.address);
    expect(synrBalanceAfter.sub(synrBalanceBefore)).equal(amount);
  });
});
