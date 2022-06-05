const {expect, assert} = require("chai");

const {
  initEthers,
  SYNR_STAKE,
  S_SYNR_SWAP,
  assertThrowsMessage,
  getTimestamp,
  increaseBlockTimestampBy,
  bytes32Address,
  BLUEPRINT_STAKE_FOR_BOOST,
} = require("./helpers");
const {upgrades} = require("hardhat");
const PayloadUtils = require("../scripts/lib/PayloadUtils");

const {
  rewardsFactor,
  decayInterval,
  decayFactor,
  swapFactor,
  stakeFactor,
  taxPoints,
  burnRatio,
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

const {generator, getFullConf, getUser, getDeposit, getMainTvl, getSeedTvl, getConf, getExtraConf} = require("./helpers/utils");

// tests to be fixed

function normalize(val, n = 18) {
  return "" + val + "0".repeat(n);
}

const DAY = 24 * 3600;
const WEEK = DAY * 7;
const YEAR = 365 * DAY;

// test unit coming soon

describe("#SidePool", function () {
  let SeedToken, seed;
  let SidePool, sidePool;
  let SynCityCoupons, blueprint;
  let SidePoolViews, sidePoolViews;

  let deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury;

  before(async function () {
    initEthers(ethers);
    [deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury] = await ethers.getSigners();
    SeedToken = await ethers.getContractFactory("SeedToken");
    SidePool = await ethers.getContractFactory("SidePoolMock");
    SynCityCoupons = await ethers.getContractFactory("SynCityCoupons");
    SidePoolViews = await ethers.getContractFactory("SidePoolViews");
  });

  async function initAndDeploy(initPool) {
    seed = await SeedToken.deploy();
    await seed.deployed();

    blueprint = await SynCityCoupons.deploy(8000);
    await blueprint.deployed();

    sidePoolViews = await upgrades.deployProxy(SidePoolViews, []);

    sidePool = await upgrades.deployProxy(SidePool, [seed.address, seed.address, blueprint.address, sidePoolViews.address]);
    await sidePool.deployed();

    if (initPool) {
      await sidePool.initPool(rewardsFactor, decayInterval, decayFactor, swapFactor, stakeFactor, taxPoints, coolDownDays);
      await sidePool.updateExtraConf(
        sPSynrEquivalent,
        sPBoostFactor,
        sPBoostLimit,
        bPSynrEquivalent,
        bPBoostFactor,
        bPBoostLimit,
        burnRatio
      );
    }
  }

  let deposit;

  describe("#initPool", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should revert if already initiated", async function () {
      await sidePool.initPool(1000, WEEK, 9800, 1000, 100, 800, 10);
      expect(sidePool.initPool(1000, WEEK, 9800, 1000, 100, 1000, 10)).revertedWith("SidePool: already initiated");
    });

    it("should revert if wrong parameters", async function () {
      await assertThrowsMessage(sidePool.initPool(1000, WEEK, 129800, 1000, 100, 800, 10), "value out-of-bounds");
      await assertThrowsMessage(sidePool.initPool(1000, 1e12, 9800, 1000, 100, 800, 10), "value out-of-bounds");
      await assertThrowsMessage(sidePool.initPool(1e10, WEEK, 9800, 1000, 100, 800, 10), "value out-of-bounds");
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
        tokenType: SYNR_STAKE,
        lockedFrom,
        lockedUntil,
        stakedAmount: amount,
        generator: amount.mul(100),
        tokenID: 0,
        unlockedAt: 0,
        mainIndex: 0,
        lastRewardsAt: lockedFrom,
        rewardsFactor: 1000,
        extra1: 0,
        extra2: 0,
        extra3: 0,
        extra4: 0,
      };
    });

    it("should calculate the yield weight", async function () {
      expect(await sidePoolViews.getLockupTime(deposit)).equal(15552000);
    });
  });

  describe("#yieldWeight", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
      //
      const amount = ethers.utils.parseEther("9650");
      const lockedFrom = await getTimestamp();
      const lockedUntil = lockedFrom + 3600 * 24 * 180;
      deposit = {
        tokenType: SYNR_STAKE,
        lockedFrom,
        lockedUntil,
        stakedAmount: amount,
        generator: amount.mul(100),
        tokenID: 0,
        unlockedAt: 0,
        mainIndex: 0,
        lastRewardsAt: lockedFrom,
        rewardsFactor: 1000,
        extra1: 0,
        extra2: 0,
        extra3: 0,
        extra4: 0,
      };
    });

    it("should calculate the yield weight", async function () {
      // 14962 means a weight of 1.4962

      expect(await sidePoolViews.yieldWeight(await getFullConf(sidePool), deposit)).equal(14931);
    });
  });

  describe("#updateConf", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should be updated", async function () {
      await assertThrowsMessage(sidePool.updateConf(11, 22, 33, 44, 55, 66, 77), "too many arguments");

      await sidePool.updateConf(11, 22, 33, 44, 55, 66);

      const updated = await getConf(sidePool);
      //console.log(updated)
      expect(updated.decayInterval).equal(11);
    });
  });

  describe("#updateOracle", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });
    it("should update oracle", async function () {
      await sidePool.updateOracle(operator.address);
      expect(await sidePool.oracle()).equal(operator.address);
    });
  });

  describe("#updatePriceRatio", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });
    it("should revert if not oracle", async function () {
      await assertThrowsMessage(sidePool.connect(user1).updatePriceRatio(0), "SidePool: not owner nor oracle");
    });

    it("should update the Price Ratio", async function () {
      const ratio = 11111;
      await sidePool.updateOracle(operator.address);
      await sidePool.connect(operator).updatePriceRatio(ratio);
      const updated = await getExtraConf(sidePool);
      //console.log(updated[10])
      expect(updated.priceRatio).equal(ratio);
    });
  });

  describe("#updateExtraConf", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });
    it("should update the NFT conf", async function () {
      await assertThrowsMessage(sidePool.updateExtraConf(11, 22, 33, 44, 55, 66, 77, 2), "too many arguments");

      await assertThrowsMessage(sidePool.updateExtraConf(11, 22, 33, 44, 55, 66, 77), "SidePool: negative boost not allowed");

      await assertThrowsMessage(sidePool.updateExtraConf(1000, 22000, 33, 44, 55, 66, 77), "SidePool: invalid boost limit");

      await assertThrowsMessage(
        sidePool.updateExtraConf(1000, 12000, 2000, 44, 55, 66, 77),
        "SidePool: negative boost not allowed"
      );

      await assertThrowsMessage(sidePool.updateExtraConf(1000, 22000, 2000, 44, 15500, 1, 77), "SidePool: invalid boost limit");

      await sidePool.updateExtraConf(1000, 22000, 2000, 44, 15500, 100, 77);
      const updated = await getExtraConf(sidePool);

      expect(updated.sPBoostLimit).equal(2000);
      expect(updated.bPBoostFactor).equal(15500);
    });
  });

  describe("#pausePool", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });
    it("should Pause the Pool", async function () {
      await sidePool.pausePool(false);
      let updated = await getConf(sidePool);
      expect(updated.status).equal(1);
      await sidePool.pausePool(true);
      updated = await getConf(sidePool);
      expect(updated.status).equal(2);
      await sidePool.pausePool(false);
      updated = await getConf(sidePool);
      expect(updated.status).equal(1);
    });
  });

  describe("#shouldUpdateRatio", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should be updated", async function () {
      await increaseBlockTimestampBy(23 * DAY);
      expect(await sidePool.shouldUpdateRatio()).equal(true);
    });

    it("should not be updated", async function () {
      await increaseBlockTimestampBy(3 * DAY);
      expect(await sidePool.shouldUpdateRatio()).equal(false);
    });
  });

  describe("#updateRatio", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should update rewardsFactor", async function () {
      await increaseBlockTimestampBy(23 * DAY);
      await sidePool.updateRatio();
      const conf = await sidePool.conf();
      expect(conf.rewardsFactor).equal(16494);
      expect(conf.lastRatioUpdateAt).equal(await getTimestamp());
      expect(await sidePool.shouldUpdateRatio()).equal(false);
    });

    it("should not update rewardsFactor", async function () {
      await increaseBlockTimestampBy(13 * DAY);
      await sidePool.updateRatio();
      let conf = await sidePool.conf();
      expect(conf.rewardsFactor).equal(16830);
      await sidePool.updateRatio();
      conf = await sidePool.conf();
      expect(conf.rewardsFactor).equal(16830);
    });
  });

  describe("#stake", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should stake blueprints", async function () {
      let id = 2;
      await blueprint.mint(user1.address, 5);
      await blueprint.connect(user1).approve(sidePool.address, id);

      expect(await sidePool.connect(user1).stake(BLUEPRINT_STAKE_FOR_BOOST, 0, id))
        .emit(sidePool, "DepositSaved")
        .withArgs(user1.address, 0);

      //const lockedUntil = (await getTimestamp());
      let deposit = await sidePool.getDepositByIndex(user1.address, 0);
      expect(deposit.tokenID).equal(id);
      expect(deposit.tokenType).equal(BLUEPRINT_STAKE_FOR_BOOST);
      //expect(deposit.lockedUntil).equal(lockedUntil);
    });

    it("should throw payload already used", async function () {
      let id = 2;
      await blueprint.mint(user1.address, 5);
      await blueprint.connect(user1).approve(sidePool.address, id);

      expect(await sidePool.connect(user1).stake(BLUEPRINT_STAKE_FOR_BOOST, 0, id))
        .emit(sidePool, "DepositSaved")
        .withArgs(user1.address, 0);

      await assertThrowsMessage(
        sidePool.connect(user1).stake(BLUEPRINT_STAKE_FOR_BOOST, 0, id),
        "SidePool: payload already used"
      );
    });

    it("should throw not a blueprint", async function () {
      let id = 2;
      await blueprint.mint(user1.address, 5);
      await blueprint.connect(user1).approve(sidePool.address, id);

      await assertThrowsMessage(sidePool.connect(user1).stake(SYNR_STAKE, 0, id), "SidePool: stake not allowed");
    });
  });

  describe("#unstake", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should unstake", async function () {
      let id = 2;
      await blueprint.mint(user1.address, 5);
      await blueprint.connect(user1).approve(sidePool.address, id);

      expect(await sidePool.connect(user1).stake(BLUEPRINT_STAKE_FOR_BOOST, 0, id))
        .emit(sidePool, "DepositSaved")
        .withArgs(user1.address, 0);

      let deposit = await sidePool.getDepositByIndex(user1.address, 0);

      expect(await sidePool.connect(user1).unstake(deposit))
        .emit(sidePool, "DepositUnlocked")
        .withArgs(user1.address, 0);
    });
  });
});
