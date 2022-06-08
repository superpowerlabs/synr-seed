const {expect} = require("chai");
const {BN, DAY} = require("./helpers/utils");
const {boostRewards, calculateUntaxedRewards} = require("./helpers/sidePoolViews");
const {getStakedAndLockedAmount} = require("./helpers/sidePool");

const {initEthers, tokenTypes, getTimestamp, getInt} = require("../test/helpers");
const {upgrades} = require("hardhat");

describe("#SidePoolViews", function () {
  let SidePoolViews, sidePoolViews;

  let deployer, fundOwner, superAdmin, operator, validator, bob, alice, mark, treasury, frank, fred;

  before(async function () {
    initEthers(ethers);
    [deployer, fundOwner, superAdmin, operator, validator, bob, alice, mark, treasury, frank, fred] = await ethers.getSigners();

    SidePoolViews = await ethers.getContractFactory("SidePoolViews");
  });

  beforeEach(async function () {
    sidePoolViews = await upgrades.deployProxy(SidePoolViews, []);
    await sidePoolViews.deployed();
  });

  const extraConf = {
    sPSynrEquivalent: 100000,
    sPBoostFactor: 12000, // 20%
    sPBoostLimit: 200000,
    bPSynrEquivalent: 3000,
    bPBoostFactor: 11000, // 10%
    bPBoostLimit: 6000,
    priceRatio: 1000,
    blueprintAmount: 0,
    extra: 0,
  };

  it("should verify that the functions in solidity and JS produce same results", async function () {
    {
      let rewards = BN(3000000, 18);
      let stakedAmount = BN(100000, 18);
      let passAmountForBoost = BN(2);
      let blueprintAmountForBoost = BN(12);

      let rewards2 = boostRewards(extraConf, rewards, stakedAmount, passAmountForBoost, blueprintAmountForBoost);
      let rewards3 = await sidePoolViews.boostRewards(
        extraConf,
        rewards,
        stakedAmount,
        passAmountForBoost,
        blueprintAmountForBoost
      );
      expect(rewards2).equal(rewards3);
    }

    {
      let rewards = BN(10000000, 18);
      let stakedAmount = BN(1000000, 18);
      let passAmountForBoost = BN(2);
      let blueprintAmountForBoost = BN(12);

      let rewards2 = boostRewards(extraConf, rewards, stakedAmount, passAmountForBoost, blueprintAmountForBoost);

      let rewards3 = await sidePoolViews.boostRewards(
        extraConf,
        rewards,
        stakedAmount,
        passAmountForBoost,
        blueprintAmountForBoost
      );
      expect(rewards2).equal(rewards3);
    }

    {
      let rewards = BN(10000000, 18);
      let stakedAmount = BN(2000000, 18);
      let passAmountForBoost = BN(0);
      let blueprintAmountForBoost = BN(20);

      let rewards2 = boostRewards(extraConf, rewards, stakedAmount, passAmountForBoost, blueprintAmountForBoost);

      let rewards3 = await sidePoolViews.boostRewards(
        extraConf,
        rewards,
        stakedAmount,
        passAmountForBoost,
        blueprintAmountForBoost
      );
      expect(rewards2).equal(rewards3);
    }
  });

  it("should verify that boost is correct if only 1 pass", async function () {
    let rewards = BN(10000000, 18);
    let stakedAmount = BN(1000000, 18);
    let passAmountForBoost = BN(1);
    let blueprintAmountForBoost = BN();

    let boostedRewards = await sidePoolViews.boostRewards(
      extraConf,
      rewards,
      stakedAmount,
      passAmountForBoost,
      blueprintAmountForBoost
    );

    // verify that solidity and javascript produce the same result
    // boostableAmount 200000
    // percentage 20
    // rewards 10000000
    // boostableRewards 2000000
    // rewards 8000000
    // boosted 2400000
    // total  10400000
    expect(boostedRewards).equal("10400000000000000000000000");
  });

  it("should verify that boost is correct if many pass and BP", async function () {
    let rewards = BN(10000000, 18);
    let stakedAmount = BN(1000000, 18);
    let passAmountForBoost = BN(2);
    let blueprintAmountForBoost = BN(5);

    let boostedRewards = await sidePoolViews.boostRewards(
      extraConf,
      rewards,
      stakedAmount,
      passAmountForBoost,
      blueprintAmountForBoost
    );
    expect(boostedRewards).equal("10818000000000000000000000");
  });

  it("should verify that boost is fully boosted despite the excess", async function () {
    {
      let rewards = BN(10000000, 18);
      let stakedAmount = BN(200000, 18);
      let passAmountForBoost = BN(2);
      let blueprintAmountForBoost = BN(12);

      let boostedRewards = await sidePoolViews.boostRewards(
        extraConf,
        rewards,
        stakedAmount,
        passAmountForBoost,
        blueprintAmountForBoost
      );
      expect(boostedRewards).equal("12000000000000000000000000");
    }
    {
      let rewards = BN(10000000, 18);
      let stakedAmount = BN(200000, 18);
      let passAmountForBoost = BN();
      let blueprintAmountForBoost = BN(12);

      let boostedRewards = await sidePoolViews.boostRewards(
        extraConf,
        rewards,
        stakedAmount,
        passAmountForBoost,
        blueprintAmountForBoost
      );
      expect(boostedRewards).equal("10360000000000000000000000");
    }

    {
      let rewards = BN(10000000, 18);
      let stakedAmount = BN(200000, 18);
      let passAmountForBoost = BN();
      let blueprintAmountForBoost = BN();

      let boostedRewards = await sidePoolViews.boostRewards(
        extraConf,
        rewards,
        stakedAmount,
        passAmountForBoost,
        blueprintAmountForBoost
      );
      expect(boostedRewards).equal("10000000000000000000000000");
    }

    {
      let rewards = BN(10000000, 18);
      let stakedAmount = BN(3000000, 18);
      let passAmountForBoost = BN(6);
      let blueprintAmountForBoost = BN(12);

      let boostedRewards = await sidePoolViews.boostRewards(
        extraConf,
        rewards,
        stakedAmount,
        passAmountForBoost,
        blueprintAmountForBoost
      );
      expect(boostedRewards).equal("10814400000000000000000000");
    }
  });

  function getConf() {
    return {
      rewardsFactor: 17000,
      decayInterval: 604800,
      decayFactor: 9900,
      minimumLockupTime: 112,
      maximumLockupTime: 365,
      poolInitAt: 1654720653,
      lastRatioUpdateAt: 1654720653,
      swapFactor: 2000,
      stakeFactor: 530,
      taxPoints: 800,
      coolDownDays: 14,
      status: 1,
      blueprintAmount: 0,
      sPSynrEquivalent: 100000,
      sPBoostFactor: 13220,
      sPBoostLimit: 200000,
      bPSynrEquivalent: 3000,
      bPBoostFactor: 13220,
      bPBoostLimit: 6000,
      priceRatio: 10000,
    };
  }

  function getDeposit(tokenType, lockedFrom, lockedUntil, stakedAmount) {
    const conf = getConf();
    return {
      tokenType,
      lockedFrom,
      lockedUntil,
      stakedAmount: BN(stakedAmount),
      tokenID: 0,
      unlockedAt: 0,
      mainIndex: 0,
      generator: getStakedAndLockedAmount(conf, conf, tokenType, stakedAmount),
      rewardsFactor: 17000,
      extra1: 0,
      extra2: 0,
      extra3: 0,
      extra4: 0,
    };
  }

  it("should verify that the rewards are correct", async function () {
    let conf = getConf();
    let amount = BN(100000, 18);
    const expected = [
      361292, 68, 389513, 73, 418397, 78, 447912, 84, 478122, 90, 508995, 96, 540532, 101, 572692, 108, 605554, 114, 639080,
      120, 673269, 127, 708122, 133, 743590, 140, 779768, 147, 816609, 154, 854114, 161, 892227, 168, 931058, 175, 970552, 183,
      1010709, 190, 1051530, 198, 1092951, 206, 1135097, 214, 1177907, 222, 1221380, 230, 1265517, 238, 1310245, 247, 1355707,
      255, 1401833, 264, 1448622, 273, 1495996, 282, 1544110, 291, 1592889, 300, 1642330, 309, 1692435, 319, 1743116, 328,
      1794547, 338,
    ];

    let timestamp = await getTimestamp();

    for (let i = conf.minimumLockupTime, j = 0; i < conf.maximumLockupTime; i += 7, j += 2) {
      let deposit = getDeposit(tokenTypes.SYNR_STAKE, timestamp, timestamp + i * DAY, amount);
      let rewards = calculateUntaxedRewards(conf, deposit, timestamp + i * DAY, timestamp);
      expect(getInt(rewards)).equal(expected[j]);
      let ratio = parseInt((100 * getInt(rewards)) / getInt(deposit.generator));
      expect(ratio).equal(expected[j + 1]);
    }

    // now with rewards after 2 years. Results should not change
    for (let i = conf.minimumLockupTime, j = 0; i < conf.maximumLockupTime; i += 7, j += 2) {
      let deposit = getDeposit(tokenTypes.SYNR_STAKE, timestamp, timestamp + i * DAY, amount);
      let rewards = calculateUntaxedRewards(conf, deposit, timestamp + 666 * DAY, timestamp);
      expect(getInt(rewards)).equal(expected[j]);
      let ratio = parseInt((100 * getInt(rewards)) / getInt(deposit.generator));
      expect(ratio).equal(expected[j + 1]);
    }

    // now checking that rewards after lockupTime are zero
    for (let i = conf.minimumLockupTime, j = 0; i < conf.maximumLockupTime; i += 7, j += 2) {
      let deposit = getDeposit(tokenTypes.SYNR_STAKE, timestamp, timestamp + i * DAY, amount);
      let rewards = calculateUntaxedRewards(conf, deposit, timestamp + i * DAY, timestamp + i * DAY);
      expect(getInt(rewards)).equal(0);
    }
  });
});
