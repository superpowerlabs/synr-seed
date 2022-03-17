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
  let SynrPool, synrPool
  let SeedFactory, seedFactory
  let SeedToken, seed

  let deployer, fundOwner, superAdmin, operator, user1, user2, marketplace, treasury

  before(async function () {
    initEthers(ethers)
    ;[deployer, fundOwner, superAdmin, operator, user1, user2, marketplace, treasury] = await ethers.getSigners()
    SyndicateERC20 = await ethers.getContractFactory("SyndicateERC20");
    SyntheticSyndicateERC20 = await ethers.getContractFactory("SyntheticSyndicateERC20");
    SynrPool = await ethers.getContractFactory("SynrPoolMock");
    SeedFactory = await ethers.getContractFactory("SeedFactoryMock");
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

    synrPool = await upgrades.deployProxy(SynrPool, [synr.address, sSynr.address]);
    await synrPool.deployed()

    await sSynr.updateRole(synrPool.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER());

    seed = await upgrades.deployProxy(SeedToken, []);
    await seed.deployed()

    seedFactory = await upgrades.deployProxy(SeedFactory, [seed.address]);
    await seedFactory.deployed()

    await seed.setManager(seedFactory.address)

    wormhole = await WormholeMock.deploy()
    await wormhole.deployed()

    await synrPool.wormholeInit(2, wormhole.address)
    await synrPool.wormholeRegisterContract(
        4,
        bytes32Address(seedFactory.address)
    )
    await synrPool.initPool(30)

    await seedFactory.wormholeInit(4, wormhole.address)
    await seedFactory.wormholeRegisterContract(
        2,
        bytes32Address(synrPool.address)
    )
  }

  async function configure() {
  }

  describe('integrations test', async function () {

    beforeEach(async function () {
      await initAndDeploy()
    })


    it("should manage the entire flow", async function () {
      const amount = ethers.utils.parseEther('10000')

      // stake SYNR in the SynrPool
      const payload = await synrPool.getSerializedPayload(
          0, // SYNR
          365, // 1 year
          amount
      )

      expect(payload).equal('1000000000000000000000003650')

      await synr.connect(fundOwner).approve(synrPool.address, ethers.utils.parseEther('10000'))

      await synrPool.connect(fundOwner).wormholeTransfer(
          payload,
          4, // BSC
          bytes32Address(fundOwner.address),
          1
      )

      const deposit = await synrPool.getDepositByIndex(fundOwner.address, 0)
      expect(deposit.tokenAmount).equal(amount)
      const finalPayload = await synrPool.fromDepositToTransferPayload(deposit)

      expect(await synr.balanceOf(synrPool.address)).equal(amount)

      await seedFactory.connect(fundOwner).mockWormholeCompleteTransfer(
          fundOwner.address, finalPayload
      )

      expect(await seed.balanceOf(fundOwner.address)).equal(ethers.utils.parseEther('10000'))

      await increaseBlockTimestampBy(366 * 24 * 3600)

      let seedDeposit = await seedFactory.getDepositByIndex(fundOwner.address, 0)
      expect(seedDeposit.unlocked).equal(0)
      const seedPayload = await seedFactory.fromDepositToTransferPayload(seedDeposit)

      // unstake
      await seedFactory.connect(fundOwner).wormholeTransfer(seedPayload, 2, bytes32Address(fundOwner.address), 1)
      seedDeposit = await seedFactory.getDepositByIndex(fundOwner.address, 0)
      expect(seedDeposit.unlocked).equal(1)

      const synrBalanceBefore = await synr.balanceOf(fundOwner.address)

      await synrPool.mockWormholeCompleteTransfer(fundOwner.address, seedPayload)
      const synrBalanceAfter = await synr.balanceOf(fundOwner.address)
      expect(synrBalanceAfter.sub(synrBalanceBefore)).equal(amount)

    })


  })


})
