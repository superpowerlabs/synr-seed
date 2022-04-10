const {expect, assert} = require("chai");

const {
  initEthers,
  assertThrowsMessage,
  getTimestamp,
  increaseBlockTimestampBy,
  bytes32Address,
  SEED_STAKE,
} = require("./helpers");
const {upgrades} = require("hardhat");

// tests to be fixed

function normalize(val, n = 18) {
  return "" + val + "0".repeat(n);
}

// test unit coming soon

describe("#FarmingPool", function () {
  let SeedToken, seed;
  let WeedToken, weed;
  let coupon;
  let FarmingPool, pool;
  let SynCityCouponsSimplified, blueprint;
  let week = 7 * 24 * 3600;

  let user0sSeeds = "250000000";

  let deployer, user0, user1, user2, marketplace, treasury;

  before(async function () {
    initEthers(ethers);
    [deployer, user0, user1, user2, marketplace, treasury] = await ethers.getSigners();
    SeedToken = await ethers.getContractFactory("SeedToken");
    WeedToken = await ethers.getContractFactory("WeedToken");
    FarmingPool = await ethers.getContractFactory("FarmingPool");
    SynCityCouponsSimplified = await ethers.getContractFactory("SynCityCouponsSimplified");
  });

  async function initAndDeploy(initPool) {
    seed = await SeedToken.deploy();
    await seed.deployed();

    weed = await WeedToken.deploy()
    await weed.deployed();

    blueprint = await SynCityCouponsSimplified.deploy(8000);
    await blueprint.deployed();

    pool = await upgrades.deployProxy(FarmingPool, [seed.address, weed.address, blueprint.address]);
    await pool.deployed();

    if (initPool) {
      await pool.initPool(1000, week, 9800, 1000, 100, 800);
      await pool.updateNftConf(
        0,
        0,
        0, // << those are ignored
        150,
        1000
      );
    }

    await seed.grantRole(await seed.MINTER_ROLE(), deployer.address);
    await seed.mint(user0.address, ethers.utils.parseEther(user0sSeeds));

    await weed.grantRole(await weed.MINTER_ROLE(), pool.address);
  }

  let deposit;

  describe("#initPool", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should revert if already initiated", async function () {
      await pool.initPool(1000, week, 9800, 1000, 100, 800);
      expect(pool.initPool(1000, week, 9800, 1000, 100, 1000)).revertedWith("SidePool: already initiated");
    });

    it("should revert if wrong parameters", async function () {
      await assertThrowsMessage(pool.initPool(1000, week, 129800, 1000, 100, 800), "value out-of-bounds");
      await assertThrowsMessage(pool.initPool(1000, 1e12, 9800, 1000, 100, 800), "value out-of-bounds");
      await assertThrowsMessage(pool.initPool(1e10, week, 9800, 1000, 100, 800), "value out-of-bounds");
    });
  });

  describe("#getLockupTime", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
      //
      const amount = ethers.utils.parseEther("9650");
      const lockedFrom = await getTimestamp();
      const lockedUntil = lockedFrom + 3600 * 24 * 180;
      deposit = {
        tokenType: SEED_STAKE,
        lockedFrom,
        lockedUntil,
        tokenAmountOrID: amount,
        tokenAmount: amount.mul(100),
        unstakedAt: 0,
        mainIndex: 0,
        lastRewardsAt: lockedFrom,
        rewardsFactor: 1000,
      };
    });

    it("should calculate the yield weight", async function () {
      expect(await pool.getLockupTime(deposit)).equal(180);
    });
  });

  describe("#yieldWeight", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should calculate the yield weight", async function () {
      // 14962 means a weight of 1.4962
      expect(await pool.yieldWeight(deposit)).equal(14931);
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

  describe("#calculateUntaxedRewards", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
      const amount = ethers.utils.parseEther("9650");
      const lockedFrom = await getTimestamp();
      const lockedUntil = lockedFrom + 3600 * 24 * 180;
      deposit = {
        tokenType: SEED_STAKE,
        lockedFrom,
        lockedUntil,
        tokenAmountOrID: amount,
        unstakedAt: 0,
        mainIndex: 0,
        tokenAmount: amount.mul(100),
        lastRewardsAt: lockedFrom,
        rewardsFactor: 1000,
      };
    });

    it("should calculate the rewards", async function () {
      await increaseBlockTimestampBy(21 * 24 * 3600);
      expect(await pool.calculateUntaxedRewards(deposit, await getTimestamp())).equal("1680981749999999999999999");
    });
  });

  describe("#updateRatio", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should update rewardsFactor", async function () {
      await increaseBlockTimestampBy(23 * 24 * 3600);
      await pool.updateRatio();
      const conf = await pool.conf();
      expect(conf.rewardsFactor).equal(940);
      expect(conf.lastRatioUpdateAt).equal(await getTimestamp());
      expect(await pool.shouldUpdateRatio()).equal(false);
    });

    it("should not update rewardsFactor", async function () {
      await increaseBlockTimestampBy(13 * 24 * 3600);
      await pool.updateRatio();
      let conf = await pool.conf();
      expect(conf.rewardsFactor).equal(980);
      await pool.updateRatio();
      conf = await pool.conf();
      expect(conf.rewardsFactor).equal(980);
    });
  });

  describe("#stake", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should stake some seed", async function () {
      const amount = ethers.utils.parseEther("1500000");
      await seed.connect(user0).approve(pool.address, amount);
      const balanceBefore = await seed.balanceOf(user0.address);
      expect(balanceBefore).equal(normalize(user0sSeeds));

      const lockedUntil = (await getTimestamp()) + 1 + 24 * 3600 * 365;
      expect(await pool.connect(user0).stake(SEED_STAKE, 365, amount))
        .emit(pool, "DepositSaved")
        .withArgs(user0.address, 0);

      let deposit = await pool.getDepositByIndex(user0.address, 0);
      expect(deposit.tokenAmountOrID).equal(amount);
      expect(deposit.tokenType).equal(SEED_STAKE);
      expect(deposit.lockedUntil).equal(lockedUntil);
    });
  });
});