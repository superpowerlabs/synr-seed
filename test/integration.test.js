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
  let SyndicateCorePool, corePool
  let SyndicatePoolFactory, factory
  let SynrSwapper, swapper

  let deployer, fundOwner, superAdmin, operator, user1, user2, marketplace, treasury

  before(async function () {
    initEthers(ethers)
    ;[deployer, fundOwner, superAdmin, operator, user1, user2, marketplace, treasury] = await ethers.getSigners()
    SyndicateERC20 = await ethers.getContractFactory("SyndicateERC20");
    SyntheticSyndicateERC20 = await ethers.getContractFactory("SyntheticSyndicateERC20");
    SyndicateCorePool = await ethers.getContractFactory("SyndicateCorePool");
    SyndicatePoolFactory = await ethers.getContractFactory("SyndicatePoolFactory");
    SynrSwapper = await ethers.getContractFactory("SynrSwapper");
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
    factory = await SyndicatePoolFactory.deploy(synr.address,
        sSynr.address,
        normalize(360),
        91252,
        await ethers.provider.getBlockNumber(),
        await ethers.provider.getBlockNumber() + 7120725
    );
    await factory.deployed()

    swapper = await SynrSwapper.deploy(superAdmin.address, synr.address, sSynr.address);
    await swapper.deployed()

  }

  async function configure() {
  }

  describe('integrations test', async function () {

    beforeEach(async function () {
      await initAndDeploy()
    })


    it("should manage the entire flow", async function () {

      await sSynr.connect(superAdmin).updateRole(swapper.address, await sSynr.ROLE_TOKEN_DESTROYER());
      await synr.connect(deployer).updateRole(swapper.address, await synr.ROLE_TOKEN_CREATOR());

      await synr.connect(fundOwner).transfer(user1.address, normalize(20000));
      expect((await synr.balanceOf(user1.address)) / 1e18).equal(20000);

      const createPoolTx = await factory.createPool(synr.address, await ethers.provider.getBlockNumber(), 1);
      await expect((await synr.userRoles(deployer.address)).toString()).equal('115792089237316195423570985008687907853269984665640564039457584007913129639935');
      await synr.connect(superAdmin).updateRole(deployer.address, 0);
      await expect((await synr.userRoles(deployer.address)).toString()).equal('0');

      const corePoolAddress = await factory.getPoolAddress(synr.address);
      const SyndicateCorePool = await ethers.getContractFactory("SyndicateCorePool");
      const corePool = await SyndicateCorePool.attach(corePoolAddress);

      await sSynr.connect(superAdmin).updateRole(corePoolAddress, await sSynr.ROLE_TOKEN_CREATOR()); // 9
      await synr.connect(user1).approve(corePool.address, normalize(10000));
      expect((await synr.allowance(user1.address, corePool.address)) / 1e18).equal(10000);

      expect(await sSynr.balanceOf(user1.address)).equal(0);
      await corePool.connect(user1).stake(normalize(1000),
          (await ethers.provider.getBlock()).timestamp + 365 * 24 * 3600, true);
      expect((await sSynr.balanceOf(user1.address))).equal(0);

      await corePool.connect(user1).stake(normalize(1000),
          (await ethers.provider.getBlock()).timestamp + 365 * 24 * 3600, true);
      expect(await sSynr.balanceOf(user1.address)).equal('359999999999989999960')

      expect(await corePool.pendingYieldRewards(user1.address)).equal(0);
      await network.provider.send("evm_mine");

      expect(((await corePool.pendingYieldRewards(user1.address)) / 1e18).toString()).equal('359.99999999999');
      await network.provider.send("evm_mine"); // 13
      expect(((await corePool.pendingYieldRewards(user1.address)) / 1e18).toString()).equal('719.99999999998');

      expect((await synr.balanceOf(user1.address)) / 1e18).equal(18000);
      await network.provider.send("evm_increaseTime", [366 * 24 * 3600])
      await network.provider.send("evm_mine")
      await corePool.connect(user1).processRewards(true);

      let unstakeTx = await corePool.connect(user1).unstake(0, normalize(500), true);
      expect((await synr.balanceOf(user1.address)) / 1e18).equal(18500);
      expect(((await sSynr.balanceOf(user1.address)) / 1e18).toString()).equal('2159.99999999998');

      await assertThrowsMessage(swapper.connect(user1).swap(await sSynr.balanceOf(user1.address)),
          'SYNR: not a treasury')

      await corePool.connect(user1).processRewards(true);
      await synr.connect(fundOwner).delegate(fundOwner.address);
      expect((await synr.balanceOf(fundOwner.address)) / 1e18).equal(8999980000);
      expect((await synr.getVotingPower(fundOwner.address)) / 1e18).equal(8999980000);
      expect((await synr.getVotingPower(user1.address)) / 1e18).equal(0);
      await corePool.delegate(user1.address);
      await expect((await synr.getVotingPower(user1.address)) / 1e18).equal(1500);

      await expect(sSynr.connect(user1).transfer(marketplace.address, normalize(10000))).revertedWith("sSYNR: Non Allowed Receiver");
      await sSynr.connect(superAdmin).updateRole(marketplace.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER());
      await sSynr.connect(user1).transfer(marketplace.address, normalize(1000));
      expect((await sSynr.balanceOf(marketplace.address)) / 1e18).equal(1000);

      await assertThrowsMessage(swapper.connect(marketplace).swap(await sSynr.balanceOf(marketplace.address)),
          'SYNR: not a treasury')

      features =
          (await synr.FEATURE_TRANSFERS()) + (await synr.FEATURE_UNSAFE_TRANSFERS() + (await synr.FEATURE_DELEGATIONS())
              + (await synr.FEATURE_DELEGATIONS_ON_BEHALF()) + (await synr.ROLE_TREASURY()));
      await synr.connect(superAdmin).updateFeatures(features)

      await expect(synr.connect(user1).approve(marketplace.address, normalize(5000))).revertedWith("SYNR: spender not allowed");
      await synr.connect(superAdmin).updateRole(marketplace.address, await synr.ROLE_WHITE_LISTED_SPENDER());

      await synr.connect(user1).approve(marketplace.address, normalize(5000));
      await synr.connect(marketplace).transferFrom(user1.address, user2.address, normalize(5000));
      expect((await synr.balanceOf(user2.address)) / 1e18).equal(5000);

      // allows treasury to be the receiver of the swap
      await sSynr.connect(superAdmin).updateRole(treasury.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER());

      await sSynr.connect(marketplace).transfer(treasury.address, normalize(1000));
      let ssynAmount = await sSynr.balanceOf(treasury.address)
      expect(ssynAmount/ 1e18).equal(1000);

      await synr.connect(superAdmin).updateRole(treasury.address, await synr.ROLE_TREASURY());

      await swapper.connect(treasury).swap(ssynAmount)

      expect((await sSynr.balanceOf(treasury.address)) / 1e18).equal(0);
      expect((await synr.balanceOf(treasury.address)) / 1e18).equal(1000);

      // migrate the pool

      let poolUser = await corePool.users(user1.address)
      let deposit1 = await corePool.getDeposit(user1.address, 0)
      let deposit2 = await corePool.getDeposit(user1.address, 1)
      expect(poolUser.tokenAmount).equal('1500000000000000000000')
      expect(deposit1.tokenAmount).equal('500000000000000000000')
      expect(deposit2.tokenAmount).equal('1000000000000000000000')

      let initBlockNumber = (await ethers.provider.getBlockNumber()) + 2
      const CorePoolV2 = await ethers.getContractFactory("CorePoolV2Mock");
      const corePoolV2 = await CorePoolV2.deploy(
          synr.address, sSynr.address, factory.address, synr.address, initBlockNumber, 200);

      // disable pool
      await factory.changePoolWeight(corePool.address, 0)

      expect(await corePool.weight()).equal(0)

      // set up migrator
      await corePool.setMigrator(corePoolV2.address)
      // migrate
      await corePool.connect(user1).migrate()
      // corePoolV2's SYNR balance increased
      expect(await synr.balanceOf(corePoolV2.address)).equal('1500000000000000000000')
      // no more deposits on corePool V1
      expect(await corePool.getDepositsLength(user1.address)).equal(0)
      expect((await corePool.users(user1.address)).tokenAmount).equal(0)
      // user and deposits correctly set on corePoolV2
      poolUser = await corePoolV2.users(user1.address)
      deposit1 = await corePoolV2.getDeposit(user1.address, 0)
      deposit2 = await corePoolV2.getDeposit(user1.address, 1)
      expect(poolUser.tokenAmount).equal('1500000000000000000000')
      expect(deposit1.tokenAmount).equal('500000000000000000000')
      expect(deposit2.tokenAmount).equal('1000000000000000000000')

      expect(await synr.symbol()).equal('SYNR')
      await assertThrowsMessage(synr.connect(user1).updateSymbol('SNX'), 'insufficient privileges')

      await synr.connect(superAdmin).updateSymbol('SNX')
      expect(await synr.symbol()).equal('SNX')
    })


  })


})
