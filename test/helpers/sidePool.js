const {ethers} = require("ethers");
const {tokenTypes} = require(".");

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
} = require("../fixtures/parameters");

const DAY = 24 * 3600;

const BN = (s, zeros = 0) => {
  return ethers.BigNumber.from((s || 0).toString() + "0".repeat(zeros));
};

const {calculateTaxOnRewards, calculateUntaxedRewards, boostRewards} = require("./sidePoolViews");

function pendingRewards(extraConf, user, blockTimestamp) {
  let rewards = untaxedPendingRewards(extraConf, user, blockTimestamp);
  if (rewards > 0) {
    let tax = calculateTaxOnRewards(extraConf, rewards);
    rewards = rewards.sub(tax);
  }
  return rewards;
}

function untaxedPendingRewards(extraConf, user, timestamp) {
  let rewards = BN();
  for (let i = 0; i < user.deposits.length; i++) {
    rewards = rewards.add(calculateUntaxedRewards(extraConf, user.deposits[i], timestamp, user.lastRewardsAt));
  }
  if (rewards > 0) {
    rewards = boostRewards(extraConf, rewards, user.stakedAmount, user.passAmountForBoost, user.blueprintAmountForBoost);
  }
  return rewards;
}

function canUnstakeWithoutTax(deposit, blockTimestamp) {
  return deposit.lockedUntil > 0 && blockTimestamp > deposit.lockedUntil;
}

function calculateTokenAmount(conf, extraConf, amount, tokenType) {
  return BN(amount)
    .mul(tokenType === tokenTypes.S_SYNR_SWAP ? conf.swapFactor : conf.stakeFactor)
    .mul(extraConf.priceRatio)
    .div(1000000);
}

function getStakedAndLockedAmount(conf, extraConf, tokenType, tokenAmountOrID) {
  let stakedAmount = BN();
  let generator = BN();
  if (tokenType === tokenTypes.S_SYNR_SWAP) {
    generator = calculateTokenAmount(conf, extraConf, tokenAmountOrID, tokenType);
  } else if (tokenType === tokenTypes.SYNR_STAKE) {
    generator = calculateTokenAmount(conf, extraConf, tokenAmountOrID, tokenType);
    stakedAmount = BN(tokenAmountOrID);
  } else if (tokenType === tokenTypes.SYNR_PASS_STAKE_FOR_SEEDS) {
    stakedAmount = BN(extraConf.sPSynrEquivalent).mul(1e18);
    generator = calculateTokenAmount(conf, extraConf, stakedAmount, tokenType);
  } else if (tokenType === tokenTypes.BLUEPRINT_STAKE_FOR_SEEDS) {
    stakedAmount = BN(extraConf.bPSynrEquivalent).mul(1e18);
    generator = calculateTokenAmount(conf, extraConf, stakedAmount, tokenType);
  }
  return stakedAmount, generator;
}

function getGenerator(synrAmount) {}

module.exports = {
  pendingRewards,
  untaxedPendingRewards,
  canUnstakeWithoutTax,
  getStakedAndLockedAmount,
  calculateTokenAmount,
};
