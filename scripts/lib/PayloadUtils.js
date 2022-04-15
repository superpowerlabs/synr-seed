const ethers = require("ethers");

const BN = ethers.BigNumber.from;
async function BNMulBy(param, num = 1, repeat = 0) {
  if (repeat) {
    return BN(param.toString()).mul(BN(num + "0".repeat(repeat)));
  }
  return BN(param.toString()).mul(num);
}

const S_SYNR_SWAP = 0;
const SYNR_STAKE = 1;
const SYNR_PASS_STAKE_FOR_BOOST = 2;
const SYNR_PASS_STAKE_FOR_SEEDS = 3;
const BLUEPRINT_STAKE_FOR_BOOST = 4;
const SEED_SWAP = 5;

const PayloadUtils = {
  async fromDepositToTransferPayload(deposit) {
    return BN(deposit.tokenType)
      .add(await BNMulBy(deposit.lockedFrom, 100))
      .add(await BNMulBy(deposit.lockedUntil, 1, 12))
      .add(await BNMulBy(deposit.mainIndex, 1, 22))
      .add(await BNMulBy(deposit.tokenAmountOrID, 1, 27));
  },

  async serializeInput(tokenType, lockupTime, tokenAmountOrID) {
    return BN(tokenType)
      .add(await BNMulBy(lockupTime, 100))
      .add(await BNMulBy(tokenAmountOrID, 1, 5));
  },
};

module.exports = PayloadUtils;
