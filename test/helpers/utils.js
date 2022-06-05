const {ethers} = require("ethers");
const {tokenTypes} = require(".");
const _ = require("lodash");

const DAY = 24 * 3600;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;

const BN = (s, zeros = 0) => {
  return ethers.BigNumber.from((s || 0).toString() + "0".repeat(zeros));
};

function BNMulBy(param, num = 1, repeat = 0) {
  const n = param instanceof ethers.BigNumber ? param : BN(param.toString());
  if (repeat) {
    return n.mul(BN(num, repeat));
  }
  return n.mul(num);
}

function fromDepositToTransferPayload(deposit) {
  try {
    let {tokenAmountOrID} = deposit;
    if (!tokenAmountOrID) {
      tokenAmountOrID = deposit.tokenType < tokenTypes.SYNR_PASS_STAKE_FOR_BOOST ? deposit.stakedAmount : deposit.tokenID;
    }
    return BN(deposit.tokenType)
      .add(BNMulBy(deposit.lockedFrom, 100))
      .add(BNMulBy(deposit.lockedUntil, 1, 12))
      .add(BNMulBy(deposit.mainIndex, 1, 22))
      .add(BNMulBy(tokenAmountOrID, 1, 27));
  } catch (e) {
    // return undefined if the deposit is malformed
  }
}

function serializeInput(tokenType, lockupTime, tokenAmountOrID) {
  return BN(tokenType).add(BNMulBy(lockupTime, 100)).add(BNMulBy(tokenAmountOrID, 1, 5));
}

function deserializeInputPayload(payload) {
  payload = BN(payload);
  return {
    tokenType: payload.mod(100).toNumber(),
    lockupTime: payload.div(100).mod(1e5).toNumber(),
    amount: payload.div(1e5),
  };
}

function normalize(val, decimals) {
  return val + "0".repeat(decimals);
}

function deserializeTransferPayload(payload) {
  console.log(payload.toString());
  payload = BN(payload);
  console.log(payload.toString());
  return {
    tokenType: payload.mod(100).toNumber(),
    lockedFrom: payload.div(100).mod(1e10).toNumber(),
    lockedUntil: payload.div(1e12).mod(1e10).toNumber(),
    mainIndex: payload.div(normalize(1, 22)).mod(1e5).toNumber(),
    tokenAmountOrID: payload.div(normalize(1, 27)),
  };
}

function timestamp(date = new Date()) {
  return parseInt((date.getTime() / 1000).toString());
}

function generator(conf, amount, tokenType) {
  return amount
    .mul(tokenType === tokenTypes.S_SYNR_SWAP ? conf.swapFactor : conf.stakeFactor)
    .div(100)
    .mul(conf.priceRatio)
    .div(10000);
}

async function getFullConf(seedPool) {
  return Object.assign(await getConf(seedPool), await getExtraConf(seedPool));
}

async function getConf(seedPool) {
  return _.pick(await seedPool.conf(), [
    "rewardsFactor",
    "decayInterval",
    "decayFactor",
    "maximumLockupTime",
    "poolInitAt",
    "lastRatioUpdateAt",
    "swapFactor",
    "stakeFactor",
    "taxPoints",
    "coolDownDays",
    "status",
  ]);
}

async function getExtraConf(seedPool) {
  return _.pick(await seedPool.extraConf(), [
    "blueprintAmount",
    "sPSynrEquivalent",
    "sPBoostFactor",
    "sPBoostLimit",
    "bPSynrEquivalent",
    "bPBoostFactor",
    "bPBoostLimit",
    "burnRatio",
    "priceRatio",
  ]);
}

async function getUser(seedPool, address) {
  let user = _.pick(await seedPool.users(address), [
    "passAmount",
    "passAmountForBoost",
    "blueprintAmount",
    "blueprintAmountForBoost",
    "stakedAmount",
    "generator",
    "lastRewardsAt",
  ]);
  user.deposits = [];
  let len = await seedPool.getDepositsLength(address);
  for (let i = 0; i < len; i++) {
    user.deposits.push(await getDeposit(seedPool, address, i));
  }
  return user;
}

async function getDeposit(pool, address, index) {
  return _.pick(await pool.getDepositByIndex(address, index), [
    "tokenType",
    "lockedFrom",
    "lockedUntil",
    "tokenAmountOrID",
    "otherChain",
    "stakedAmount",
    "tokenID",
    "unlockedAt",
    "mainIndex",
    "generator",
    "rewardsFactor",
    "extra",
    "extra1",
    "extra2",
    "extra3",
    "extra4",
  ]);
}

async function getMainTvl(mainPool) {
  return _.pick(await mainPool.conf(), ["synrAmount", "passAmount"]);
}

async function getSeedTvl(seedPool) {
  return _.pick(await seedPool.conf(), ["blueprintAmount"]);
}

module.exports = {
  fromDepositToTransferPayload,
  serializeInput,
  deserializeInputPayload,
  getMainTvl,
  getUser,
  getDeposit,
  timestamp,
  getFullConf,
  getSeedTvl,
  getConf,
  getExtraConf,
  deserializeTransferPayload,
  normalize,
  generator,
  BN,
  DAY,
  WEEK,
  YEAR,
};
