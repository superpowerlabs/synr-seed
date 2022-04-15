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

  async validateInput(tokenType, lockupTime, tokenAmountOrID) {
    if (tokenType > 99) return "PayloadUtils: invalid token type";
    if (tokenType === SYNR_PASS_STAKE_FOR_BOOST || tokenType === SYNR_PASS_STAKE_FOR_SEEDS) {
      if (tokenAmountOrID > 888) return "PayloadUtils: Not a Mobland SYNR Pass token ID";
    } else if (tokenType === BLUEPRINT_STAKE_FOR_BOOST) {
      if (tokenAmountOrID > 8000) return "PayloadUtils: Not a Blueprint token ID";
    } else if (tokenAmountOrID > 1e28 - 1) return "PayloadUtils: tokenAmountOrID out of range";

    if (lockupTime > 1e3 - 1) return "PayloadUtils: lockedTime out of range";
  },
  //   // can be called by tests and web2 app
  //   function serializeInput(
  //       uint256 tokenType, // 2 digit
  //   uint256 lockupTime, // 3 digits
  //   uint256 tokenAmountOrID
  // ) external pure override returns (uint256 payload) {
  //   validateInput(tokenType, lockupTime, tokenAmountOrID);
  //   payload = tokenType.add(lockupTime.mul(100)).add(tokenAmountOrID.mul(1e5));
  // }
  //
  // function validateInput(
  //     uint256 tokenType,
  //     uint256 lockupTime,
  //     uint256 tokenAmountOrID
  // ) public pure override returns (bool) {

  //   return true;
  // }
};

module.exports = PayloadUtils;
