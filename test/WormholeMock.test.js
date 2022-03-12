const {expect, assert} = require("chai")

const {initEthers, assertThrowsMessage, getTimestamp, increaseBlockTimestampBy,
  bytes32Address} = require('./helpers')

// tests to be fixed

function normalize(val, n = 18) {
  return '' + val + '0'.repeat(n)
}

// test unit coming soon

describe.only("#WormholeMock", function () {

  let WormholeMock, wormhole
  let SyndicateERC20, synr
  let SyntheticSyndicateERC20, sSynr
  let InputPool, inputPool
  let OutputPull, outputPool
  let SeedToken, seed

  let deployer, fundOwner, superAdmin, operator, user1, user2, marketplace, treasury

  before(async function () {
    initEthers(ethers)
    ;[deployer, fundOwner, superAdmin, operator, user1, user2, marketplace, treasury] = await ethers.getSigners()
    SyndicateERC20 = await ethers.getContractFactory("SyndicateERC20");
    SyntheticSyndicateERC20 = await ethers.getContractFactory("SyntheticSyndicateERC20");
    InputPool = await ethers.getContractFactory("InputPool");
    OutputPull = await ethers.getContractFactory("OutputPool");
    SeedToken = await ethers.getContractFactory("SeedToken");
    WormholeMock = await ethers.getContractFactory("WormholeMock");
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

    inputPool = await upgrades.deployProxy(InputPool, [synr.address, sSynr.address]);
    await inputPool.deployed()

    await sSynr.updateRole(inputPool.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER());

    seed = await upgrades.deployProxy(SeedToken, []);
    await seed.deployed()

    outputPool = await upgrades.deployProxy(OutputPull, [seed.address]);
    await outputPool.deployed()

    await seed.setManager(outputPool.address)

    wormhole = await WormholeMock.deploy()
    await wormhole.deployed()

    await inputPool.wormholeInit(2, wormhole.address)
    await inputPool.wormholeRegisterContract(
        4,
        bytes32Address(outputPool.address)
    )
    await inputPool.initPool(30)

    await outputPool.wormholeInit(4, wormhole.address)
    await outputPool.wormholeRegisterContract(
        2,
        bytes32Address(inputPool.address)
    )
  }

  async function configure() {
  }

  describe('integrations test', async function () {

    beforeEach(async function () {
      await initAndDeploy()
    })


    it("should manage the entire flow", async function () {

      // stake SYNR in the InputPool
      const payload = await inputPool.serializeInputPayload(
          0, // SYNR
          365, // 1 year
          ethers.utils.parseEther('10000') // 10,000 SYNR
      )

      await synr.connect(fundOwner).approve(inputPool.address, ethers.utils.parseEther('10000'))

      await inputPool.connect(fundOwner).wormholeTransfer(
          payload,
          4, // BSC
          bytes32Address(fundOwner.address),
          1
      )




    })


  })


})
