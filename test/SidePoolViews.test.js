const {expect} = require("chai");
const {BN} = require("./helpers/utils");
const {boostRewards} = require("./helpers/sidePoolViews");

const {initEthers} = require("../test/helpers");
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
});
