const {expect, assert} = require("chai")

const {initEthers, assertThrowsMessage, getTimestamp, increaseBlockTimestampBy} = require('./helpers')

// tests to be fixed

function normalize(val, n = 18) {
  return '' + val + '0'.repeat(n)
}

// test unit coming soon

describe.skip("Integration test", function () {

  let SyndicateERC20, synr
  let SyntheticSyndicateERC20, sSynr
  let InputPool, inputPool
  let OutPull, outputPool
  let SeedToken, seed

  let deployer, fundOwner, superAdmin, operator, user1, user2, marketplace, treasury

  before(async function () {
    initEthers(ethers)
    ;[deployer, fundOwner, superAdmin, operator, user1, user2, marketplace, treasury] = await ethers.getSigners()
    SyndicateERC20 = await ethers.getContractFactory("SyndicateERC20");
    SyntheticSyndicateERC20 = await ethers.getContractFactory("SyntheticSyndicateERC20");
    InputPool = await ethers.getContractFactory("InputPool");
    OutPull = await ethers.getContractFactory("OutputPool");
    SeedToken = await ethers.getContractFactory("SeedToken");
  })

  async function initAndDeploy() {
    const maxTotalSupply = 10000000000; // 10 billions
    synr = await SyndicateERC20.deploy(fundOwner.address, maxTotalSupply, superAdmin.address);
    await synr.deployed()
    let features = (await synr.FEATURE_TRANSFERS_ON_BEHALF()) +
        (await synr.FEATURE_TRANSFERS()) +
        (await synr.FEATURE_UNSAFE_TRANSFERS()) +
        (await synr.FEATURE_DELEGATIONS()) +
        (await synr.FEATURE_DELEGATIONS_ON_BEHALF());
    await synr.updateFeatures(features)
    sSynr = await SyntheticSyndicateERC20.deploy(superAdmin.address);
    await sSynr.deployed()

    seed = await upgrades.deployProxy(SeedToken, []);
    await seed.deployed()

    outputPool = await upgrades.deployProxy(OutPull, [synr.address, sSynr.address, seed.address]);
    await outputPool.deployed()

    seed = await SeedToken.deploy(superAdmin.address, synr.address, sSynr.address);

  }

  async function configure() {
  }

  describe('integrations test', async function () {

    beforeEach(async function () {
      await initAndDeploy()
    })


    it("should manage the entire flow", async function () {


    })


  })


})
