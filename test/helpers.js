const {assert} = require("chai");

const Helpers = {
  initEthers(ethers) {
    this.ethers = ethers;
  },

  async assertThrowsMessage(promise, message) {
    const notThrew = "It did not throw";
    try {
      await promise;
      throw new Error(notThrew);
    } catch (e) {
      const isTrue = e.message.indexOf(message) > -1;
      if (!isTrue) {
        console.error("Expected:", message);
        console.error("Received:", e.message);
        if (e.message !== notThrew) {
          console.error();
          console.error(e);
        }
      }
      assert.isTrue(isTrue);
    }
  },

  async getTimestamp() {
    return (await this.ethers.provider.getBlock()).timestamp;
  },

  async BNMulBy(param, num = 1, repeat = 0) {
    const BN = ethers.BigNumber.from;
    if (repeat) {
      return BN(param.toString()).mul(BN(num + "0".repeat(repeat)));
    }
    return BN(param.toString()).mul(num);
  },

  async increaseBlockTimestampBy(offset) {
    await this.ethers.provider.send("evm_increaseTime", [offset]);
    await this.ethers.provider.send("evm_mine");
  },

  bytes32Address(address) {
    return "0x000000000000000000000000" + address.replace(/^0x/, "");
  },
};

Helpers.S_SYNR_SWAP = 0;
Helpers.SYNR_STAKE = 1;
Helpers.SYNR_PASS_STAKE_FOR_BOOST = 2;
Helpers.SYNR_PASS_STAKE_FOR_SEEDS = 3;
Helpers.BLUEPRINT_STAKE_FOR_BOOST = 4;
Helpers.SEED_STAKE = 5;

module.exports = Helpers;
