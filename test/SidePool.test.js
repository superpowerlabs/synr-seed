const {expect, assert} = require("chai");

const {initEthers, assertThrowsMessage, getTimestamp, increaseBlockTimestampBy, bytes32Address} = require("./helpers");
const {upgrades} = require("hardhat");

// tests to be fixed

function normalize(val, n = 18) {
  return "" + val + "0".repeat(n);
}

// test unit coming soon

describe("#SidePool", function () {
  let WormholeMock, wormhole;
  let SideToken, seed;
  let coupon
  let SidePool, sidePool;
  let SynCityCouponsSimplified, blueprint;
  let week = 7 * 24 * 3600;

  let deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury;

  before(async function () {
    initEthers(ethers);
    [deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury] = await ethers.getSigners();
    SideToken = await ethers.getContractFactory("SideToken");
    SidePool  = await ethers.getContractFactory("SidePoolMock");
    SynCityCouponsSimplified = await ethers.getContractFactory("SynCityCouponsSimplified");  });

  async function initAndDeploy(initPool) {
    seed = await upgrades.deployProxy(SideToken, ["Mobland SEED Token", "SEED"]);
    await seed.deployed();

    blueprint = await SynCityCouponsSimplified.deploy(8000);
    await blueprint.deployed()

    sidePool = await upgrades.deployProxy(SidePool, [seed.address, blueprint.address]);
    await sidePool.deployed();

    if (initPool) {
      await sidePool.initPool(1000, week, 9800, 1000, 100, 800);
      await sidePool.updateNftConf(100000, 1500, 120000, 150, 1000);
    }
  }

  let deposit

  describe("#initPool", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should revert if already initiated", async function () {
      await sidePool.initPool(1000, week, 9800, 1000, 100, 800);
      expect(sidePool.initPool(1000, week, 9800, 1000, 100, 1000)).revertedWith('SidePool: already initiated')
    });

    it("should revert if wrong parameters", async function () {
      await assertThrowsMessage(sidePool.initPool(1000, week, 129800, 1000, 100, 800),
          "value out-of-bounds")
      await assertThrowsMessage(sidePool.initPool(1000, 1e12, 9800, 1000, 100, 800),
          "value out-of-bounds")
      await assertThrowsMessage(sidePool.initPool(1e10, week, 9800, 1000, 100, 800),
          "value out-of-bounds")
    });
  });

  describe("#lockupTime", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
      //
      const amount = ethers.utils.parseEther("9650");
      const lockedFrom = await getTimestamp();
      const lockedUntil = lockedFrom + 3600 * 24 * 180;
      deposit = {
        tokenType: 1,
        lockedFrom,
        lockedUntil,
        tokenAmountOrID: amount,
        tokenAmount: amount.mul(100),
        unstakedAt: 0,
        mainIndex: 0,
        lastRewardsAt: lockedFrom,
        rewardsFactor: 1000
      };
    });

    it("should calculate the yield weight", async function () {
      expect(await sidePool.lockupTime(deposit)).equal(180);
    });
  });

  describe("#yieldWeight", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should calculate the yield weight", async function () {
      // 1496 means a weight of 1.496
      expect(await sidePool.yieldWeight(deposit)).equal(1493);
    });
  });

  describe("#shouldUpdateRatio", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should be updated", async function () {
      await increaseBlockTimestampBy(23 * 24 * 3600);
      expect(await sidePool.shouldUpdateRatio()).equal(true);
    });

    it("should not be updated", async function () {
      await increaseBlockTimestampBy(3 * 24 * 3600);
      expect(await sidePool.shouldUpdateRatio()).equal(false);
    });
  });

  describe("#calculateUntaxedRewards", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
      const amount = ethers.utils.parseEther("9650");
      const lockedFrom = await getTimestamp();
      const lockedUntil = lockedFrom + 3600 * 24 * 180;
      deposit = {
        tokenType: 1,
        lockedFrom,
        lockedUntil,
        tokenAmountOrID: amount,
        tokenAmount: amount.mul(100),
        unstakedAt: 0,
        mainIndex: 0,
        lastRewardsAt: lockedFrom,
        rewardsFactor: 1000
      };

    });

    it("should calculate the rewards", async function () {
      await increaseBlockTimestampBy(23 * 24 * 3600);
      expect(await sidePool.calculateUntaxedRewards(deposit))
          .equal("1840951944444444444444443");
    });

  });

  describe("#updateRatio", async function () {
    beforeEach(async function () {
      await initAndDeploy(true);
    });

    it("should update rewardsFactor", async function () {
      await increaseBlockTimestampBy(23 * 24 * 3600);
      await sidePool.updateRatio();
      const conf = await sidePool.conf();
      expect(conf.rewardsFactor).equal(940);
      expect(conf.lastRatioUpdateAt).equal(await getTimestamp());
      expect(await sidePool.shouldUpdateRatio()).equal(false);
    });

    it("should not update rewardsFactor", async function () {
      await increaseBlockTimestampBy(13 * 24 * 3600);
      await sidePool.updateRatio();
      let conf = await sidePool.conf();
      expect(conf.rewardsFactor).equal(980);
      await sidePool.updateRatio();
      conf = await sidePool.conf();
      expect(conf.rewardsFactor).equal(980);
    });
  });
});
