const {assert, expect} = require("chai");
const ethers = require("ethers");
const {hexZeroPad} = require("@ethersproject/bytes");

const Helpers = {
  initEthers(ethers0) {
    this.ethers = ethers0;
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

  async increaseBlockTimestampBy(offset) {
    await this.ethers.provider.send("evm_increaseTime", [offset]);
    await this.ethers.provider.send("evm_mine");
  },

  bytes32Address(address) {
    return hexZeroPad(address, 32);
  },

  mockEncodedVm(addr, payload) {
    addr = addr.substring(2);
    payload = hexZeroPad(this.ethers.BigNumber.from(payload).toHexString(), 32).substring(2);
    let vaaBytes = [];
    for (let k = 0; k < addr.length; k += 2) {
      vaaBytes.push(parseInt(addr.substring(k, k + 2), 16));
    }
    for (let k = 0; k < payload.length; k += 2) {
      vaaBytes.push(parseInt(payload.substring(k, k + 2), 16));
    }
    return new Int32Array(vaaBytes);
  },

  BN(s, zeros = 0) {
    return ethers.BigNumber.from((s || 0).toString() + "0".repeat(zeros));
  },

  async sleep(millis) {
    // eslint-disable-next-line no-undef
    return new Promise((resolve) => setTimeout(resolve, millis));
  },

  expectEqualAsEther(a, b) {
    a = ethers.utils.formatEther(a.toString()).split(".")[0];
    b = ethers.utils.formatEther(b.toString()).split(".")[0];
    expect(a).equal(b);
  },
};

Helpers.tokenTypes = {
  S_SYNR_SWAP: 1,
  SYNR_STAKE: 2,
  SYNR_PASS_STAKE_FOR_BOOST: 3,
  SYNR_PASS_STAKE_FOR_SEEDS: 4,
  BLUEPRINT_STAKE_FOR_BOOST: 5,
  BLUEPRINT_STAKE_FOR_SEEDS: 6,
  SEED_SWAP: 7,
};

// for compatibility with previous tests
for (let key in Helpers.tokenTypes) {
  Helpers[key] = Helpers.tokenTypes[key];
}

module.exports = Helpers;
