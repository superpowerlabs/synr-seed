const {ethers} = require("ethers");
const {tokenTypes} = require(".");

const DAY = 24 * 3600;

const BN = (s, zeros = 0) => {
  return ethers.BigNumber.from((s || 0).toString() + "0".repeat(zeros));
};

function boostRewards(extraConf, rewards, stakedAmount, passAmountForBoost, blueprintAmountForBoost) {
  if (extraConf.sPBoostFactor > extraConf.bPBoostFactor) {
    return boostRewardsByBestBooster(
      rewards,
      stakedAmount,
      passAmountForBoost,
      extraConf.sPBoostFactor,
      extraConf.sPBoostLimit,
      blueprintAmountForBoost,
      extraConf.bPBoostFactor,
      extraConf.bPBoostLimit
    );
  } else {
    return boostRewardsByBestBooster(
      rewards,
      stakedAmount,
      blueprintAmountForBoost,
      extraConf.bPBoostFactor,
      extraConf.bPBoostLimit,
      passAmountForBoost,
      extraConf.sPBoostFactor,
      extraConf.sPBoostLimit
    );
  }
}

function boostRewardsByBestBooster(rewards, stakedAmount, amount1, boost1, limit1, amount2, boost2, limit2) {
  let boostableAmount = BN();
  let boosted = BN();
  if (amount1 > 0) {
    boostableAmount = BN(amount1).mul(limit1).mul(BN(1, 18));
    if (stakedAmount.lt(boostableAmount)) {
      boostableAmount = stakedAmount;
    }
    let boostableRewards = rewards.mul(boostableAmount).div(stakedAmount);
    rewards = rewards.sub(boostableRewards);
    boosted = boostableRewards.mul(boost1).div(10000);
  }
  if (amount2 > 0 && stakedAmount.sub(boostableAmount).gt(0)) {
    if (stakedAmount.sub(boostableAmount).lt(BN(amount2).mul(limit2).mul(BN(1, 18)))) {
      boostableAmount = stakedAmount.sub(boostableAmount);
    } else {
      boostableAmount = BN(amount2).mul(limit2).mul(BN(1, 18));
    }
    let boostableRewards = rewards.mul(boostableAmount).div(stakedAmount);
    if (boostableRewards.gt(rewards)) {
      boostableRewards = rewards;
    }
    rewards = rewards.sub(boostableRewards);
    boosted = boosted.add(boostableRewards.mul(boost2).div(10000));
  }
  return rewards.add(boosted);
}

function yieldWeight(conf = {maximumLockupTime: 365}, deposit) {
  return BN(10000).add(getLockupTime(deposit).mul(10000).div(conf.maximumLockupTime).div(DAY));
}

function getLockupTime(deposit) {
  return BN(deposit.lockedUntil).sub(BN(deposit.lockedFrom));
}

function calculateUntaxedRewards(conf, deposit, timestamp, lastRewardsAt) {
  if (deposit.generator === 0 || deposit.tokenType === tokenTypes.S_SYNR_SWAP || deposit.unlockedAt !== 0) {
    return 0;
  }
  return BN(deposit.generator)
    .mul(deposit.rewardsFactor)
    .div(10000)
    .mul(yieldWeight(conf, deposit))
    .div(10000)
    .mul(BN(timestamp).sub(lastRewardsAt))
    .div(365 * DAY);
}

function calculateTaxOnRewards(conf, rewards) {
  return rewards.mul(conf.taxPoints).div(10000);
}

function getVestedPercentage(when, lockedFrom, lockedUntil) {
  if (BN(lockedUntil).eq(0)) {
    return 10000;
  }
  let lockupTime = lockedUntil.sub(lockedFrom);
  if (BN(lockupTime).eq(0)) {
    return 10000;
  }
  let vestedTime = when.sub(lockedFrom);
  return vestedTime.mul(10000).div(lockupTime);
}

module.exports = {
  getVestedPercentage,
  calculateTaxOnRewards,
  yieldWeight,
  getLockupTime,
  calculateUntaxedRewards,
  BN,
  boostRewards,
};
