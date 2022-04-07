const {expect, assert} = require("chai");

const {initEthers, assertThrowsMessage, getTimestamp, increaseBlockTimestampBy, bytes32Address} = require("./helpers");
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

    seedFarm = await upgrades.deployProxy(SeedFarm, [seed.address]);
    await seedFarm.deployed();

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
});
