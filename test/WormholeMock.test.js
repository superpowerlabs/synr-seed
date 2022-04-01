const {expect, assert} = require("chai");

const {initEthers, assertThrowsMessage, getTimestamp, increaseBlockTimestampBy, bytes32Address} = require("./helpers");

// tests to be fixed

function normalize(val, n = 18) {
  return "" + val + "0".repeat(n);
}

// test unit coming soon

describe.only("#WormholeMock", function () {
  let WormholeMock, wormhole;
  let SyndicateERC20, synr;
  let SyntheticSyndicateERC20, sSynr;
  let SynrPool, synrPool;
  let SeedFarm, seedFarm;
  let SideToken, seed, weed;

  let deployer, fundOwner, superAdmin, operator, user1, user2, marketplace, treasury;

  before(async function () {
    initEthers(ethers);
    [deployer, fundOwner, superAdmin, operator, user1, user2, marketplace, treasury] = await ethers.getSigners();
    SyndicateERC20 = await ethers.getContractFactory("SyndicateERC20");
    SyntheticSyndicateERC20 = await ethers.getContractFactory("SyntheticSyndicateERC20");
    SynrPool = await ethers.getContractFactory("SynrPoolMock");
    SeedFarm = await ethers.getContractFactory("SeedFarmMock");
    SideToken = await ethers.getContractFactory("SideToken");
    WormholeMock = await ethers.getContractFactory("WormholeMock");
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

    synrPool = await upgrades.deployProxy(SynrPool, [synr.address, sSynr.address]);
    await synrPool.deployed();

    await sSynr.updateRole(synrPool.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER());

    seed = await upgrades.deployProxy(SideToken, ["Mobland SEED Token", "SEED"]);
    await seed.deployed();

    seedFarm = await upgrades.deployProxy(SeedFarm, [seed.address]);
    await seedFarm.deployed();

    await seed.grantRole(await seed.MINTER_ROLE(), seedFarm.address);

    wormhole = await WormholeMock.deploy();
    await synrPool.wormholeInit(2, wormhole.address);
    await wormhole.deployed();

    await synrPool.wormholeRegisterContract(4, bytes32Address(seedFarm.address));
    await synrPool.initPool(30, 40);

    await seedFarm.wormholeInit(4, wormhole.address);
    await seedFarm.wormholeRegisterContract(2, bytes32Address(synrPool.address));
  }

  async function configure() {}

  describe("integrations test", async function () {

    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should manage the entire flow", async function () {
      const amount = ethers.utils.parseEther("10000");

      // stake SYNR in the SynrPool
      const payload = await synrPool.serializeInput(
        0, // SYNR
        365, // 1 year
        amount
      );

      expect(payload).equal("1000000000000000000000003650");

      await synr.connect(fundOwner).approve(synrPool.address, ethers.utils.parseEther("10000"));

      await synrPool.connect(fundOwner).wormholeTransfer(
        payload,
        4, // BSC
        bytes32Address(fundOwner.address),
        1
      );

      let deposit = await synrPool.getDepositByIndex(fundOwner.address, 0);
      expect(deposit.tokenAmount).equal(amount);
      expect(deposit.tokenType).equal(0)
      expect(deposit.otherChain).equal(4)

      const finalPayload = await synrPool.fromDepositToTransferPayload(deposit);

      expect(await synr.balanceOf(synrPool.address)).equal(amount);

      await seedFarm.connect(fundOwner).mockWormholeCompleteTransfer(fundOwner.address, finalPayload);

      expect(await seed.balanceOf(fundOwner.address)).equal(ethers.utils.parseEther("10000"));

      await increaseBlockTimestampBy(366 * 24 * 3600);

      let seedDeposit = await seedFarm.getDepositByIndex(fundOwner.address, 0);
      expect(seedDeposit.unlockedAt).equal(0);
      const seedPayload = await seedFarm.fromDepositToTransferPayload(seedDeposit);

      const ts = await getTimestamp()

      // unstake
      await seedFarm.connect(fundOwner).wormholeTransfer(seedPayload, 2, bytes32Address(fundOwner.address), 1);
      seedDeposit = await seedFarm.getDepositByIndex(fundOwner.address, 0);

      expect(seedDeposit.unlockedAt).greaterThan(ts);

      const synrBalanceBefore = await synr.balanceOf(fundOwner.address);

      await synrPool.mockWormholeCompleteTransfer(fundOwner.address, seedPayload);
      const synrBalanceAfter = await synr.balanceOf(fundOwner.address);
      expect(synrBalanceAfter.sub(synrBalanceBefore)).equal(amount);
    });


    it("should verify early unstake", async function () {

      const amount = ethers.utils.parseEther("10000");
      await synr.connect(fundOwner).transferFrom(fundOwner.address, user1.address, amount);

      // stake SYNR in the SynrPool
      const payload = await synrPool.serializeInput(
          0, // SYNR
          300,
          amount
      );

      expect(payload).equal("1000000000000000000000003000");

      await synr.connect(user1).approve(synrPool.address, ethers.utils.parseEther("10000"));

      await synrPool.connect(user1).wormholeTransfer(
          payload,
          4, // BSC
          bytes32Address(user1.address),
          1
      );

      let deposit = await synrPool.getDepositByIndex(user1.address, 0);
      expect(deposit.tokenAmount).equal(amount);
      expect(deposit.tokenType).equal(0)
      expect(deposit.otherChain).equal(4)

      const finalPayload = await synrPool.fromDepositToTransferPayload(deposit);

      expect(await synr.balanceOf(synrPool.address)).equal(amount);

      await seedFarm.connect(user1).mockWormholeCompleteTransfer(user1.address, finalPayload);

      expect(await seed.balanceOf(user1.address)).equal(ethers.utils.parseEther("10000"));

      await increaseBlockTimestampBy(150 * 24 * 3600);

      expect(await seedFarm.canUnstakeWithoutTax(user1.address, 0)).equal(false)

      let seedDeposit = await seedFarm.getDepositByIndex(user1.address, 0);
      expect(seedDeposit.unlockedAt).equal(0);
      const seedPayload = await seedFarm.fromDepositToTransferPayload(seedDeposit);

      const ts = await getTimestamp()

      const synrBalanceBefore = await synr.balanceOf(user1.address);

      // unstake
      await seedFarm.connect(user1).wormholeTransfer(seedPayload, 2, bytes32Address(user1.address), 1);

      const tax = await synrPool.calculateTaxForEarlyUnstake(user1.address, 0);

      expect(amount.sub(tax)).equal("8000000000000000000000")
      await synrPool.mockWormholeCompleteTransfer(user1.address, seedPayload);

      const synrBalanceAfter = await synr.balanceOf(user1.address);
      expect(synrBalanceAfter.sub(synrBalanceBefore)).equal(amount.sub(tax));

      expect(await synrPool.collectedTaxes()).equal(tax);
      const synrBalanceBeforeTax = await synr.balanceOf(user2.address);
      await synrPool.withdrawTaxes(tax, user2.address)
      const synrBalanceAfterTax = await synr.balanceOf(user2.address);
      expect(await synrBalanceAfterTax).equal(synrBalanceBeforeTax + tax);


    });

    it.only("should calculate taxes properly", async function () {
      // console.log(await synr.balanceOf(user1.address))
      const amount = ethers.utils.parseEther("10000");
      await synr.connect(fundOwner).transferFrom(fundOwner.address, user1.address, amount);
      const payload = await synrPool.serializeInput(
        0, // SYNR
        365, // 1 year
        amount
      );
      expect(payload).equal("1000000000000000000000003650");
      await synr.connect(user1).approve(synrPool.address, ethers.utils.parseEther("10000"));
      await synrPool.connect(user1).wormholeTransfer(
          payload,
          4, // BSC
          bytes32Address(user1.address),
          1
      );
      await increaseBlockTimestampBy(182.5 * 24 * 3600);
       const deposit = await synrPool.getDepositByIndex(user1.address,0)
       const unvested = ((100 - await synrPool.getVestedPercentage(deposit.lockedFrom,deposit.lockedUntil))/100)*deposit.tokenAmount
       const percentage = await synrPool.earlyUnStakeTax()/100;
       const unvestedtax = unvested* percentage
       expect((await synrPool.calculateTaxForEarlyUnstake(user1.address,0))/1).equal(unvestedtax)

    });
  });
});
