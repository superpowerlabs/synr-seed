const {expect, assert} = require("chai");

const {
  initEthers,
  assertThrowsMessage,
  getTimestamp,
  increaseBlockTimestampBy,
  bytes32Address,
  BLUEPRINT_STAKE_FOR_BOOST,
  BLUEPRINT_STAKE_FOR_SEEDS,
  SEED_SWAP,
  SYNR_STAKE,
} = require("./helpers");
const {upgrades} = require("hardhat");

// tests to be fixed

function normalize(val, n = 18) {
  return "" + val + "0".repeat(n);
}

const {
  rewardsFactor,
  decayInterval,
  decayFactor,
  swapFactor,
  stakeFactor,
  taxPoints,
  coolDownDays,
  minimumLockupTime,
  earlyUnstakePenalty,
  sPSynrEquivalent,
  sPBoostFactor,
  sPBoostLimit,
  bPSynrEquivalent,
  bPBoostFactor,
  bPBoostLimit,
  priceRatio,
} = require("./fixtures/parameters");

const {generator, getFullConf, getUser, getDeposit, getMainTvl, getSeedTvl} = require("./helpers/utils");

describe("#SeedPool", function () {
  let SeedToken, seed;
  let WeedToken, weed;
  let coupon;
  let SeedPool, pool;
  let SynCityCoupons, blueprint;
  let SidePoolViews, sidePoolViews;
  let week = 7 * 24 * 3600;

  let user0sSeeds = "250000000";
  let user0sBlueprint = "25";

  let deployer, user0, user1, user2, bridge;

  before(async function () {
    initEthers(ethers);
    [deployer, user0, user1, user2, bridge] = await ethers.getSigners();
    SeedToken = await ethers.getContractFactory("SeedTokenMock");
    WeedToken = await ethers.getContractFactory("WeedToken");
    SeedPool = await ethers.getContractFactory("SeedPoolMock");
    SynCityCoupons = await ethers.getContractFactory("SynCityCoupons");
    SidePoolViews = await ethers.getContractFactory("SidePoolViews");
  });

  async function initAndDeploy(initPool) {
    seed = await upgrades.deployProxy(SeedToken, []);
    await seed.deployed();

    weed = await WeedToken.deploy();
    await weed.deployed();

    blueprint = await SynCityCoupons.deploy(8000);
    await blueprint.deployed();

    sidePoolViews = await upgrades.deployProxy(SidePoolViews, []);
    pool = await upgrades.deployProxy(SeedPool, [seed.address, blueprint.address, sidePoolViews.address]);
    await pool.deployed();

    if (initPool) {
      await pool.initPool(rewardsFactor, decayInterval, decayFactor, swapFactor, stakeFactor, taxPoints, coolDownDays);
      await pool.updateExtraConf(sPSynrEquivalent, sPBoostFactor, sPBoostLimit, bPSynrEquivalent, bPBoostFactor, bPBoostLimit);
    }

    // await seed.setMinter(pool.address, true);

    await seed.setMinter(deployer.address, true);
    await seed.mint(user0.address, ethers.utils.parseEther(user0sSeeds));
    await blueprint.mint(user0.address, user0sBlueprint);
  }

  let deposit;

  describe("#initPool", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should revert if already initiated", async function () {
      await pool.initPool(rewardsFactor, decayInterval, decayFactor, swapFactor, stakeFactor, taxPoints, coolDownDays);
      await expect(
        pool.initPool(rewardsFactor, decayInterval, decayFactor, swapFactor, stakeFactor, taxPoints, coolDownDays)
      ).revertedWith("SidePool: already initiated");
    });

    it("should revert if wrong parameters", async function () {
      await assertThrowsMessage(pool.initPool(1000, week, 129800, 1000, 100, 800, 10), "value out-of-bounds");
      await assertThrowsMessage(pool.initPool(1000, 1e12, 9800, 1000, 100, 800, 10), "value out-of-bounds");
      await assertThrowsMessage(pool.initPool(1e10, week, 9800, 1000, 100, 800, 10), "value out-of-bounds");
    });
  });

  describe("#shouldUpdateRatio", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should be updated", async function () {
      await increaseBlockTimestampBy(23 * 24 * 3600);
      expect(await pool.shouldUpdateRatio()).equal(true);
    });

    it("should not be updated", async function () {
      await increaseBlockTimestampBy(3 * 24 * 3600);
      expect(await pool.shouldUpdateRatio()).equal(false);
    });
  });

  describe("#stake", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should stake blueprint", async function () {
      await blueprint.connect(user0).approve(pool.address, 4);
      expect(await pool.connect(user0).stake(BLUEPRINT_STAKE_FOR_BOOST, 0, 4))
        .emit(pool, "DepositSaved")
        .withArgs(user0.address, 0);

      const lockedUntil = await getTimestamp();
      let deposit = await pool.getDepositByIndex(user0.address, 0);
      expect(deposit.tokenID).equal(4);
      expect(deposit.tokenType).equal(BLUEPRINT_STAKE_FOR_BOOST);
      expect(deposit.lockedUntil).equal(lockedUntil);
    });

    it("should revert unsupported token", async function () {
      const amount = ethers.utils.parseEther("1500000");
      await seed.connect(user0).approve(pool.address, amount);
      const balanceBefore = await seed.balanceOf(user0.address);
      expect(balanceBefore).equal(normalize(user0sSeeds));

      expect(pool.connect(user0).stake(SEED_SWAP, 0, amount)).revertedWith("SeedPool: unsupported token");
    });
  });

  describe("#stakeViaBridge", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should not stake blueprint via bridge", async function () {
      const amount = ethers.utils.parseEther("1500000");
      await blueprint.connect(user0).approve(pool.address, 4);

      const lockedFrom = await getTimestamp();

      expect(
        pool.connect(user0).stakeViaBridge(user0.address, BLUEPRINT_STAKE_FOR_BOOST, lockedFrom, 0, 0, amount)
      ).revertedWith("SeedPool: forbidden");

      await pool.setBridge(bridge.address, true);

      expect(
        pool.connect(user0).stakeViaBridge(user0.address, BLUEPRINT_STAKE_FOR_BOOST, lockedFrom, 0, 0, amount)
      ).revertedWith("SeedPool: unsupported token");
    });
  });

  describe("#unstakeViaBridge", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should unstake blueprint via bridge", async function () {
      const amount = ethers.utils.parseEther("1500000");
      await blueprint.connect(user0).approve(pool.address, 4);

      expect(await pool.connect(user0).stake(BLUEPRINT_STAKE_FOR_BOOST, 0, 4))
        .emit(pool, "DepositSaved")
        .withArgs(user0.address, 0);
      const lockedFrom = await getTimestamp();
      expect(
        pool.connect(user0).unstakeViaBridge(user0.address, BLUEPRINT_STAKE_FOR_BOOST, lockedFrom, 0, 0, amount)
      ).revertedWith("SeedPool: forbidden");
    });
  });

  describe("#unstake", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should unstake 3 blueprints", async function () {
      await blueprint.mint(user0.address, 4);
      await blueprint.mint(user0.address, 5);
      await blueprint.mint(user0.address, 6);
      await blueprint.connect(user0).approve(pool.address, 4);
      await blueprint.connect(user0).approve(pool.address, 5);
      await blueprint.connect(user0).approve(pool.address, 6);
      await pool.connect(user0).stake(BLUEPRINT_STAKE_FOR_BOOST, 0, 4);
      await pool.connect(user0).stake(BLUEPRINT_STAKE_FOR_BOOST, 0, 5);
      await pool.connect(user0).stake(BLUEPRINT_STAKE_FOR_SEEDS, 0, 6);
      let deposit = await pool.getDepositByIndex(user0.address, 0);

      await assertThrowsMessage(pool.connect(user0).unstake(deposit), "SideToken: not a minter");
      await seed.setMinter(pool.address, true);

      expect(await pool.connect(user0).unstake(deposit))
        .emit(pool, "DepositUnlocked")
        .withArgs(user0.address, 0);
      deposit = await pool.getDepositByIndex(user0.address, 1);
      expect(await pool.connect(user0).unstake(deposit))
        .emit(pool, "DepositUnlocked")
        .withArgs(user0.address, 1);
      deposit = await pool.getDepositByIndex(user0.address, 2);
      expect(await pool.connect(user0).unstake(deposit))
        .emit(pool, "DepositUnlocked")
        .withArgs(user0.address, 2);
    });
  });
});
