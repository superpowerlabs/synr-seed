const {expect, assert} = require("chai");

const {initEthers, assertThrowsMessage, getTimestamp, increaseBlockTimestampBy, bytes32Address, BNMulBy} = require("./helpers");
const {upgrades} = require("hardhat");

// tests to be fixed

function normalize(val, n = 18) {
  return "" + val + "0".repeat(n);
}

// test unit coming soon

describe("#MainPool", function () {
  let SyndicateERC20, synr;
  let SyntheticSyndicateERC20, sSynr;
  let MainPool, mainPool;
  let SynCityPasses, pass;

  const BN = ethers.BigNumber.from;

  let deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury;

  before(async function () {
    initEthers(ethers);
    [deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury] = await ethers.getSigners();
    SyndicateERC20 = await ethers.getContractFactory("SyndicateERC20");
    SyntheticSyndicateERC20 = await ethers.getContractFactory("SyntheticSyndicateERC20");
    MainPool = await ethers.getContractFactory("MainPoolMock");
    SynCityPasses = await ethers.getContractFactory("SynCityPasses");
  });

  async function initAndDeploy() {
    const maxTotalSupply = 10000000000; // 10 billions
    synr = await SyndicateERC20.deploy(fundOwner.address, maxTotalSupply, superAdmin.address);
    await synr.deployed();
    let features =
      (await synr.FEATURE_TRANSFERS_ON_BEHALF()) +
      (await synr.FEATURE_TRANSFERS()) +
      (await synr.FEATURE_UNSAFE_TRANSFERS()) +
      (await synr.FEATURE_DELEGATIONS()) +
      (await synr.FEATURE_DELEGATIONS_ON_BEHALF());
    await synr.updateFeatures(features);

    sSynr = await SyntheticSyndicateERC20.deploy(superAdmin.address);
    await sSynr.deployed();

    pass = await SynCityPasses.deploy(validator.address);
    await pass.deployed();

    mainPool = await upgrades.deployProxy(MainPool, [synr.address, sSynr.address, pass.address]);
    await mainPool.deployed();

    await sSynr.updateRole(mainPool.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER());
    await mainPool.initPool(7, 4000);
  }

  async function configure() {}

  describe("#calculatePenaltyForEarlyUnstake", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should calculate taxes properly", async function () {
      // console.log(await synr.balanceOf(user1.address))
      const amount = ethers.utils.parseEther("10000");
      await synr.connect(fundOwner).transferFrom(fundOwner.address, user1.address, amount);
      const payload = await mainPool.serializeInput(
        1, // SYNR
        365, // 1 year
        amount
      );
      expect(payload).equal("100000000000000000000003651");
      await synr.connect(user1).approve(mainPool.address, ethers.utils.parseEther("10000"));
      expect(await mainPool.connect(user1).stake(user1.address, payload, 4))
        .emit(mainPool, "DepositSaved")
        .withArgs(user1.address, 0);
      await increaseBlockTimestampBy(182.5 * 24 * 3600);
      const deposit = await mainPool.getDepositByIndex(user1.address, 0);
      // console.log(deposit.lockedFrom, deposit.lockedUntil);
      const vestedPercentage = await mainPool.getVestedPercentage(getTimestamp(), deposit.lockedFrom, deposit.lockedUntil);
      expect(vestedPercentage).equal(5000);
      const unvested = ethers.BigNumber.from(deposit.tokenAmountOrID.toString())
        .mul(10000 - vestedPercentage)
        .div(10000);
      const percentage = (await mainPool.conf()).earlyUnstakePenalty / 100;
      const unvestedPenalty = unvested.mul(percentage).div(100);
      expect(await mainPool.calculatePenaltyForEarlyUnstake(getTimestamp(), deposit)).equal(unvestedPenalty);
    });
  });

  describe("#Deposit", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should return length of deposits", async function () {
      const amount = ethers.utils.parseEther("10000");
      await synr.connect(fundOwner).transferFrom(fundOwner.address, user1.address, amount);
      const payload = "100000000000000000000003651";
      await synr.connect(user1).approve(mainPool.address, ethers.utils.parseEther("10000"));
      expect(await mainPool.connect(user1).stake(user1.address, payload, 4))
        .emit(mainPool, "DepositSaved")
        .withArgs(user1.address, 0);
      const lenght = await mainPool.getDepositsLength(user1.address);
      expect(parseInt(lenght)).equal(1);
    });

    it("should return deposit by index", async function () {
      const amount = ethers.utils.parseEther("10000");
      await synr.connect(fundOwner).transferFrom(fundOwner.address, user1.address, amount);
      const payload = "100000000000000000000003651";
      await synr.connect(user1).approve(mainPool.address, ethers.utils.parseEther("10000"));
      expect(await mainPool.connect(user1).stake(user1.address, payload, 4))
        .emit(mainPool, "DepositSaved")
        .withArgs(user1.address, 0);
      const deposit = await mainPool.getDepositByIndex(user1.address, 0);
      expect(parseInt(deposit)).equal(1, deposit.lockedFrom, deposit.lockedUntil, 0, amount);
    });
  });

  describe("#fromDepositToTransferPayload", async function () {
    it("should from deposit to transfer payload", async function () {
      const amount = ethers.utils.parseEther("10000");
      const lockedFrom = await getTimestamp();
      const lockedUntil = lockedFrom + 3600 * 24 * 180;
      const deposit = {
        tokenType: 1,
        lockedFrom,
        lockedUntil,
        tokenAmountOrID: amount,
        unstakedAt: 0,
        otherChain: 4,
        mainIndex: 0,
      };

      const expected = BN(1)
        .add(await BNMulBy(lockedFrom, 10))
        .add(await BNMulBy(lockedUntil, 1, 11))
        .add(await BNMulBy(0, 1, 21))
        .add(await BNMulBy(amount, 1, 26));
      const payload = await mainPool.fromDepositToTransferPayload(deposit);
      expect(payload).equal(expected);
    });

    it("should throw for invalid token type", async function () {
      const amount = ethers.utils.parseEther("10000");
      const lockedFrom = await getTimestamp();
      const lockedUntil = lockedFrom + 3600 * 24 * 180;
      const deposit = {
        tokenType: 7,
        lockedFrom,
        lockedUntil,
        tokenAmountOrID: amount,
        unstakedAt: 0,
        otherChain: 4,
        mainIndex: 0,
      };
      expect(mainPool.fromDepositToTransferPayload(deposit)).revertedWith("PayloadUtils: invalid token type");
    });

    it("should throw invalid interval", async function () {
      const amount = ethers.utils.parseEther("10000");
      const lockedFrom = await getTimestamp();
      const lockedUntil = 1;
      const deposit = {
        tokenType: 1,
        lockedFrom,
        lockedUntil,
        tokenAmountOrID: amount,
        unstakedAt: 0,
        otherChain: 4,
        mainIndex: 0,
      };
      expect(mainPool.fromDepositToTransferPayload(deposit)).revertedWith("PayloadUtils: invalid interval");
    });

    it("should throw tokenAmount out of range", async function () {
      const amount = ethers.utils.parseEther("10000000000");
      const lockedFrom = await getTimestamp();
      const lockedUntil = lockedFrom + 3600 * 24 * 180;
      const deposit = {
        tokenType: 1,
        lockedFrom,
        lockedUntil,
        tokenAmountOrID: amount,
        unstakedAt: 0,
        otherChain: 4,
        mainIndex: 0,
      };
      expect(mainPool.fromDepositToTransferPayload(deposit)).revertedWith("PayloadUtils: tokenAmountOrID out of range");
    });
  });
});
