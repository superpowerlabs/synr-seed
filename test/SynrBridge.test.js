const {expect, assert} = require("chai");

const {initEthers, assertThrowsMessage, getTimestamp, increaseBlockTimestampBy, bytes32Address, BNMulBy} = require("./helpers");
const {upgrades} = require("hardhat");

// tests to be fixed

function normalize(val, n = 18) {
  return "" + val + "0".repeat(n);
}

// test unit coming soon

describe("#SynrBridge", function () {
  let WormholeMock, wormhole;
  let SyndicateERC20, synr;
  let SyntheticSyndicateERC20, sSynr;
  let SynrBridge, synrBridge;
  let SynrBridgeV2;
  let SeedFarm, seedFarm;
  let SideToken, seed;
  let SynCityPasses, pass;
  let SynCityCouponsSimplified, blueprint;

  const BN = ethers.BigNumber.from;

  let deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury;

  before(async function () {
    initEthers(ethers);
    [deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury] = await ethers.getSigners();
    SyndicateERC20 = await ethers.getContractFactory("SyndicateERC20");
    SyntheticSyndicateERC20 = await ethers.getContractFactory("SyntheticSyndicateERC20");
    SynrBridge = await ethers.getContractFactory("SynrBridgeMock");
    SynrBridgeV2 = await ethers.getContractFactory("SynrBridgeV2Mock");
    SeedFarm = await ethers.getContractFactory("SeedFarmMock");
    SideToken = await ethers.getContractFactory("SideToken");
    WormholeMock = await ethers.getContractFactory("WormholeMock");
    SynCityPasses = await ethers.getContractFactory("SynCityPasses");
    SynCityCouponsSimplified = await ethers.getContractFactory("SynCityCouponsSimplified");
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

    synrBridge = await upgrades.deployProxy(SynrBridge, [synr.address, sSynr.address, pass.address]);
    await synrBridge.deployed();

    await sSynr.updateRole(synrBridge.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER());

    seed = await upgrades.deployProxy(SideToken, ["Mobland SEED Token", "SEED"]);
    await seed.deployed();

    blueprint = await SynCityCouponsSimplified.deploy(8000);
    await blueprint.deployed()

    seedFarm = await upgrades.deployProxy(SeedFarm, [seed.address, blueprint.address]);
    await seedFarm.deployed();
    await seedFarm.initPool(1000, 7 * 24 * 3600, 9800, 1000, 100, 800);
    await seedFarm.updateNftConf(100000, 1500, 120000, 150, 1000);

    await seed.grantRole(await seed.MINTER_ROLE(), seedFarm.address);

    wormhole = await WormholeMock.deploy();
    await synrBridge.wormholeInit(2, wormhole.address);
    await wormhole.deployed();

    await synrBridge.wormholeRegisterContract(4, bytes32Address(seedFarm.address));
    await synrBridge.initPool(7, 4000);

    await seedFarm.wormholeInit(4, wormhole.address);
    await seedFarm.wormholeRegisterContract(2, bytes32Address(synrBridge.address));
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
      const payload = await synrBridge.serializeInput(
        1, // SYNR
        365, // 1 year
        amount
      );
      expect(payload).equal("100000000000000000000003651");
      await synr.connect(user1).approve(synrBridge.address, ethers.utils.parseEther("10000"));
      expect(
        await synrBridge.connect(user1).wormholeTransfer(
          payload,
          4, // BSC
          bytes32Address(user1.address),
          1
        )
      )
        .emit(synrBridge, "DepositSaved")
        .withArgs(user1.address, 0);
      await increaseBlockTimestampBy(182.5 * 24 * 3600);
      const deposit = await synrBridge.getDepositByIndex(user1.address, 0);
      // console.log(deposit.lockedFrom, deposit.lockedUntil);
      const vestedPercentage = await synrBridge.getVestedPercentage(getTimestamp(), deposit.lockedFrom, deposit.lockedUntil)
      expect(vestedPercentage).equal(50);
      const unvested = ethers.BigNumber.from(deposit.tokenAmountOrID.toString()).mul(100 - vestedPercentage).div(100);
      const percentage = (await synrBridge.conf()).earlyUnstakePenalty / 100;
      const unvestedPenalty = unvested.mul(percentage).div(100);
      expect(await synrBridge.calculatePenaltyForEarlyUnstake(getTimestamp(), deposit)).equal(unvestedPenalty);
    });
  });

  describe("#Deposit", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should return length of deposits", async function () {
      const amount = ethers.utils.parseEther("10000");
      await synr.connect(fundOwner).transferFrom(fundOwner.address, user1.address, amount);
      const payload = "100000000000000000000003651"
      await synr.connect(user1).approve(synrBridge.address, ethers.utils.parseEther("10000"));
      expect(
          await synrBridge.connect(user1).wormholeTransfer(
              payload,
              4, // BSC
              bytes32Address(user1.address),
              1
          )
      )
          .emit(synrBridge, "DepositSaved")
          .withArgs(user1.address, 0);
      const lenght = await synrBridge.getDepositsLength(user1.address);
      expect(parseInt(lenght)).equal(1);
    });

    it("should return deposit by index", async function () {
      const amount = ethers.utils.parseEther("10000");
      await synr.connect(fundOwner).transferFrom(fundOwner.address, user1.address, amount);
      const payload = "100000000000000000000003651"
      await synr.connect(user1).approve(synrBridge.address, ethers.utils.parseEther("10000"));
      expect(
          await synrBridge.connect(user1).wormholeTransfer(
              payload,
              4, // BSC
              bytes32Address(user1.address),
              1
          )
      )
          .emit(synrBridge, "DepositSaved")
          .withArgs(user1.address, 0);
      const deposit = await synrBridge.getDepositByIndex(user1.address, 0);
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
      const payload = await synrBridge.fromDepositToTransferPayload(deposit);
      expect(payload).equal(expected)
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
      expect(synrBridge.fromDepositToTransferPayload(deposit)).revertedWith("PayloadUtils: invalid token type")
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
      expect(synrBridge.fromDepositToTransferPayload(deposit)).revertedWith("PayloadUtils: invalid interval")
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
      expect(synrBridge.fromDepositToTransferPayload(deposit)).revertedWith("PayloadUtils: tokenAmountOrID out of range")
    });
  });

  describe("#_updateUserAndAddDeposit", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should return updated user", async function () {
      const amount = ethers.utils.parseEther("10000");
      await synr.connect(fundOwner).transferFrom(fundOwner.address, user1.address, amount);
      const payload = "100000000000000000000003651"
      await synr.connect(user1).approve(synrBridge.address, ethers.utils.parseEther("10000"));
      expect(
          await synrBridge.connect(user1).wormholeTransfer(
              payload,
              4, // BSC
              bytes32Address(user1.address),
              1
          )
      )
          .emit(synrBridge, "DepositSaved")
          .withArgs(user1.address, 0);
      await increaseBlockTimestampBy(182.5 * 24 * 3600);
      await synrBridge.updateUserAndAddDeposit(user1.address, 1, 1000000000, 3000000000, amount, 44, 0);
      //Update user pushes new deposit, it therefore changes the index of the intended new update deposite to the last one in the list.
      //unsure if that is the intended behavior of UPDATE USER
      const depositAfter = await synrBridge.getDepositByIndex(user1.address, 1);
      expect(depositAfter.tokenType, depositAfter.lockedFrom, depositAfter.lockedUntil, depositAfter.otherChain).equal(
          1,
          1000000000,
          3000000000,
          44
      );
    });
  });
});
