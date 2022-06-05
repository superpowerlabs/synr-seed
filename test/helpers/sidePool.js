const {ethers} = require("ethers");
const {tokenTypes} = require(".");

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

module.exports = {
  pendingRewards,
  untaxedPendingRewards,
  canUnstakeWithoutTax,
};
