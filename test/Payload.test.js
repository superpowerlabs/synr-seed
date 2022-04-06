const {expect, assert} = require("chai");

const {initEthers, assertThrowsMessage, getTimestamp, increaseBlockTimestampBy, bytes32Address} = require("./helpers");
const {upgrades} = require("hardhat");

// tests to be fixed

function normalize(val, n = 18) {
  return "" + val + "0".repeat(n);
}

// test unit coming soon

describe("#Payload", function () {
  let WormholeMock, wormhole;
  let SyndicateERC20, synr;
  let SyntheticSyndicateERC20, sSynr;
  let SynrPool, synrPool;
  let SynrPoolV2;
  let SeedFarm, seedFarm;
  let SideToken, seed;
  let SynCityPasses, pass;

  let deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury;

  before(async function () {
    initEthers(ethers);
    [deployer, fundOwner, superAdmin, operator, validator, user1, user2, marketplace, treasury] = await ethers.getSigners();
    SyndicateERC20 = await ethers.getContractFactory("SyndicateERC20");
    SyntheticSyndicateERC20 = await ethers.getContractFactory("SyntheticSyndicateERC20");
    SynrPool = await ethers.getContractFactory("SynrPoolMock");
    SynrPoolV2 = await ethers.getContractFactory("SynrPoolV2Mock");
    SeedFarm = await ethers.getContractFactory("SeedFarmMock");
    SideToken = await ethers.getContractFactory("SideToken");
    WormholeMock = await ethers.getContractFactory("WormholeMock");
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

    synrPool = await upgrades.deployProxy(SynrPool, [synr.address, sSynr.address, pass.address]);
    await synrPool.deployed();

    await sSynr.updateRole(synrPool.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER());

    seed = await upgrades.deployProxy(SideToken, ["Mobland SEED Token", "SEED"]);
    await seed.deployed();

    seedFarm = await upgrades.deployProxy(SeedFarm, [seed.address]);
    await seedFarm.deployed();

    await seed.grantRole(await seed.MINTER_ROLE(), seedFarm.address);

    wormhole = await WormholeMock.deploy();
    await synrPool.wormholeInit(2, wormhole.address);
    await wormhole.deployed();

    await synrPool.wormholeRegisterContract(4, bytes32Address(seedFarm.address));
    await synrPool.initPool(7, 365, 40);

    await seedFarm.wormholeInit(4, wormhole.address);
    await seedFarm.wormholeRegisterContract(2, bytes32Address(synrPool.address));
  }

  describe("#serializeInput", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should serialize input", async function () {
      const amount = ethers.utils.parseEther("10000");

      const payload = await synrPool.serializeInput(
        1, // SYNR
        365, // 1 year
        amount
      );

      expect(payload).equal("1000000000000000000000003651");
    });
    it("should throw invalid token", async function () {
      const amount = ethers.utils.parseEther("10000");

      expect(synrPool.serializeInput(4, 365, amount)).revertedWith("Payload: invalid token type");
    });

    it("should throw not a mobland pass", async function () {
      const amount = ethers.utils.parseEther("10000");

      expect(synrPool.serializeInput(2, 365, amount)).revertedWith("Payload: Not a Mobland SYNR Pass token ID");
    });

    it("should throw amount of range", async function () {
      const amount = ethers.utils.parseEther("1000000000000");

      expect(synrPool.serializeInput(1, 365, amount)).revertedWith("Payload: tokenAmountOrID out of range");
    });

    it("should throw lockedTime out of range", async function () {
      const amount = ethers.utils.parseEther("10000");

      expect(synrPool.serializeInput(1, 1e5, amount)).revertedWith("Payload: lockedTime out of range");
    });
  });

  describe("#deserializeInput", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should deserialize", async function () {
      const amount = ethers.utils.parseEther("10000");

      const payload = await synrPool.serializeInput(
        1, // SYNR
        365, // 1 year
        amount
      );
      const deserialize = await synrPool.deserializeInput(payload);

      expect(parseInt(deserialize)).equal(1, 365, amount);
    });

    // TODO add a fake payload and verify if it fails
  });

  describe("#Deposit", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should return length of deposits", async function () {
      const amount = ethers.utils.parseEther("10000");
      await synr.connect(fundOwner).transferFrom(fundOwner.address, user1.address, amount);
      const payload = await synrPool.serializeInput(
        1, // SYNR
        365, // 1 year
        amount
      );
      await synr.connect(user1).approve(synrPool.address, ethers.utils.parseEther("10000"));
      expect(
        await synrPool.connect(user1).wormholeTransfer(
          payload,
          4, // BSC
          bytes32Address(user1.address),
          1
        )
      )
        .emit(synrPool, "DepositSaved")
        .withArgs(user1.address, 0);
      await increaseBlockTimestampBy(182.5 * 24 * 3600);
      const lenght = await synrPool.getDepositsLength(user1.address);
      expect(parseInt(lenght)).equal(1);
    });

    it("should return deposit by index", async function () {
      const amount = ethers.utils.parseEther("10000");
      await synr.connect(fundOwner).transferFrom(fundOwner.address, user1.address, amount);
      const payload = await synrPool.serializeInput(
        1, // SYNR
        365, // 1 year
        amount
      );
      const index = synrPool.getIndexFromPayload(payload);
      await synr.connect(user1).approve(synrPool.address, ethers.utils.parseEther("10000"));
      expect(
        await synrPool.connect(user1).wormholeTransfer(
          payload,
          4, // BSC
          bytes32Address(user1.address),
          1
        )
      )
        .emit(synrPool, "DepositSaved")
        .withArgs(user1.address, 0);
      await increaseBlockTimestampBy(182.5 * 24 * 3600);
      const deposit = await synrPool.getDepositByIndex(user1.address, 0);
      expect(parseInt(deposit)).equal(1, deposit.lockedFrom, deposit.lockedUntil, index, amount);
    });
  });

  describe("#deserializeDeposit", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should deserialize deposit", async function () {
      const amount = ethers.utils.parseEther("10000");
      await synr.connect(fundOwner).transferFrom(fundOwner.address, user1.address, amount);
      const payload = await synrPool.serializeInput(
        1, // SYNR
        365, // 1 year
        amount
      );
      const index = synrPool.getIndexFromPayload(payload);
      await synr.connect(user1).approve(synrPool.address, ethers.utils.parseEther("10000"));
      expect(
        await synrPool.connect(user1).wormholeTransfer(
          payload,
          4, // BSC
          bytes32Address(user1.address),
          1
        )
      )
        .emit(synrPool, "DepositSaved")
        .withArgs(user1.address, 0);
      await increaseBlockTimestampBy(182.5 * 24 * 3600);
      const deposit = await synrPool.getDepositByIndex(user1.address, 0);
      const deserialize = await synrPool.deserializeDeposit(parseInt(deposit));
      expect(parseInt(deserialize)).equal(1, deposit.lockedFrom, deposit.lockedUntil, index, amount);
    });
  });

  describe("#_updateUserAndAddDeposit", async function () {
    beforeEach(async function () {
      await initAndDeploy();
    });

    it("should return updated user", async function () {
      const amount = ethers.utils.parseEther("10000");
      await synr.connect(fundOwner).transferFrom(fundOwner.address, user1.address, amount);
      const payload = await synrPool.serializeInput(
        1, // SYNR
        365, // 1 year
        amount
      );
      const index = synrPool.getIndexFromPayload(payload);
      await synr.connect(user1).approve(synrPool.address, ethers.utils.parseEther("10000"));
      expect(
        await synrPool.connect(user1).wormholeTransfer(
          payload,
          4, // BSC
          bytes32Address(user1.address),
          1
        )
      )
        .emit(synrPool, "DepositSaved")
        .withArgs(user1.address, 0);
      await increaseBlockTimestampBy(182.5 * 24 * 3600);
      const deposit = await synrPool.getDepositByIndex(user1.address, 0);
      await synrPool.updateUserAndAddDeposit(user1.address, 1, 1000000000, 3000000000, amount, 44, 0);
      //Update user pushes new deposit, it therefore changes the index of the intended new update deposite to the last one in the list.
      //unsure if that is the intended behavior of UPDATE USER
      const depositAfter = await synrPool.getDepositByIndex(user1.address, 1);
      expect(depositAfter.tokenType, depositAfter.lockedFrom, depositAfter.lockedUntil, depositAfter.otherChain).equal(
        1,
        1000000000,
        3000000000,
        44
      );
    });
  });
});
