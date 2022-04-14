const {expect, assert, use} = require("chai");

const {initEthers, assertThrowsMessage, getTimestamp, increaseBlockTimestampBy, bytes32Address, BNMulBy} = require("./helpers");
const {upgrades} = require("hardhat");

// tests to be fixed

function normalize(val, n = 18) {
  return "" + val + "0".repeat(n);
}

// test unit coming soon

describe("#PayloadUtils", function () {
  let PayloadUtils, payloadUtils;

  let deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury;

  before(async function () {
    initEthers(ethers);
    [deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury] = await ethers.getSigners();
    PayloadUtils = await ethers.getContractFactory("PayloadUtilsMock");
  });

  async function initAndDeploy() {
    payloadUtils = await PayloadUtils.deploy();
    await payloadUtils.deployed();
  }

  describe("#serializeInput", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should serialize input", async function () {
      const amount = ethers.utils.parseEther("10000");

      const payload = await payloadUtils.serializeInput(
        1, // SYNR
        365, // 1 year
        amount
      );

      expect(payload).equal("1000000000000000000000036501");
    });

    it("should throw invalid token", async function () {
      const amount = ethers.utils.parseEther("10000");

      expect(payloadUtils.serializeInput(4, 365, amount)).revertedWith("PayloadUtils: invalid token type");
    });

    it("should throw not a mobland pass", async function () {
      const amount = ethers.utils.parseEther("10000");
      payloadUtils.serializeInput;
      expect(payloadUtils.serializeInput(2, 365, amount)).revertedWith("PayloadUtils: Not a Mobland SYNR Pass token ID");
    });

    it("should throw amount of range", async function () {
      const amount = ethers.utils.parseEther("1000000000000");

      expect(payloadUtils.serializeInput(1, 365, amount)).revertedWith("PayloadUtils: tokenAmountOrID out of range");
    });

    it("should throw lockedTime out of range", async function () {
      const amount = ethers.utils.parseEther("10000");

      expect(payloadUtils.serializeInput(1, 1e5, amount)).revertedWith("PayloadUtils: lockedTime out of range");
    });
  });

  describe("#deserializeInput", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should deserialize", async function () {
      const amount = ethers.utils.parseEther("10000");

      const payload = await payloadUtils.serializeInput(
        2, // SYNR
        365, // 1 year
        200
      );
      const deserialize = await payloadUtils.deserializeInput(payload);

      expect(parseInt(deserialize)).equal(2, 365, amount);
    });

    // TODO add a fake payload and verify if it fails
  });

  describe("#deserializeDeposit", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should deserialize deposit", async function () {
      const deposit = {
        tokenType: 2,
        lockedFrom: await getTimestamp(),
        lockedUntil: (await getTimestamp()) + 3600000,
        tokenAmountOrID: ethers.utils.parseEther("1000"),
        mainIndex: 0,
      };

      const payload = await payloadUtils.fromDepositToTransferPayload(deposit);
      const [tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID] = await payloadUtils.deserializeDeposit(payload);

      expect(tokenType).equal(deposit.tokenType);
      expect(lockedFrom).equal(deposit.lockedFrom);
      expect(lockedUntil).equal(deposit.lockedUntil);
      expect(mainIndex).equal(deposit.mainIndex);
      expect(tokenAmountOrID).equal(deposit.tokenAmountOrID);
    });
  });
});
