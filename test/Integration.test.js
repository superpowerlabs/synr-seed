const {expect, assert} = require("chai");

const {
  fromSideDepositToTransferPayload,
  fromMainDepositToTransferPayload,
  serializeInput,
} = require("../scripts/lib/PayloadUtils");

const {
  rewardsFactor,
  decayInterval,
  decayFactor,
  swapFactor,
  stakeFactor,
  taxPoints,
  coolDownDays,
  minimumLockupTime,
  earlyUnstakePenalty,
  sPSynrEquivalent,
  sPBoostFactor,
  sPBoostLimit,
  bPSynrEquivalent,
  bPBoostFactor,
  bPBoostLimit,
  priceRatio,
} = require("./fixtures/parameters");

const {
  initEthers,
  assertThrowsMessage,
  getTimestamp,
  increaseBlockTimestampBy,
  bytes32Address,
  mockEncodedVm,
  S_SYNR_SWAP,
  SYNR_STAKE,
  SYNR_PASS_STAKE_FOR_BOOST,
  SYNR_PASS_STAKE_FOR_SEEDS,
  BLUEPRINT_STAKE_FOR_BOOST,
  BN,
  expectEqualAsEther,
} = require("./helpers");

const {generator, getFullConf, getUser, getDeposit, getMainTvl, getSeedTvl} = require("./helpers/utils");
const {pendingRewards, canUnstakeWithoutTax} = require("./helpers/sidePool");

const {upgrades} = require("hardhat");

// tests to be fixed

function normalize(val, n = 18) {
  return "" + val + "0".repeat(n);
}

describe("#Integration test", function () {
  let WormholeMock, wormhole;
  let SyndicateERC20, synr;
  let SyntheticSyndicateERC20, sSynr;
  let Tesseract, mainTesseract, sideTesseract;
  let MainWormholeBridge, mainBridge;
  let SideWormholeBridge, sideBridge;
  let MainPool, mainPool;
  let TesseractV2;
  let SeedToken, seed;
  let SynCityPasses, pass;
  let SeedPool, seedPool;
  let SidePoolViews, sidePoolViews;
  let SynCityCoupons, blueprint;
  let aliceTokenID;
  let bobTokenID;
  let fundOwnerTokenID;

  let deployer, fundOwner, superAdmin, operator, validator, bob, alice, fred, treasury;

  async function stake(user, amount, index = 0, tokenType = SYNR_STAKE, k = 365) {
    await synr.connect(user).approve(mainPool.address, amount);
    let payload = await serializeInput(tokenType, k, amount);
    await mainTesseract.connect(user).crossChainTransfer(1, payload, 4, 1);
    let deposit = await getDeposit(mainPool, user.address, index);
    let finalPayload = await fromMainDepositToTransferPayload(deposit);
    await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(user.address, finalPayload));
  }

  async function stakeSYNR(user, amount, index = 0) {
    await stake(user, amount, index);
  }

  async function unstake(user, index = 0) {
    let seedDeposit = await getDeposit(seedPool, user.address, index);
    let seedPayload = await fromSideDepositToTransferPayload(seedDeposit);
    await sideTesseract.connect(user).crossChainTransfer(1, seedPayload, 2, 1);
    await mainTesseract.completeCrossChainTransfer(1, mockEncodedVm(user.address, seedPayload));
  }

  async function stakePass(user, id, forBoost, index = 0) {
    let payloadPass = await serializeInput(forBoost ? SYNR_PASS_STAKE_FOR_BOOST : SYNR_PASS_STAKE_FOR_SEEDS, 365, id);
    await pass.connect(user).approve(mainPool.address, id);
    await mainTesseract.connect(user).crossChainTransfer(1, payloadPass, 4, 1);
    let deposit = await getDeposit(mainPool, user.address, index);
    let finalPayload = await fromMainDepositToTransferPayload(deposit);
    await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(user.address, finalPayload));
  }

  function getInt(val) {
    return parseInt(ethers.utils.formatEther(val.toString()));
  }

  before(async function () {
    initEthers(ethers);
    [deployer, fundOwner, superAdmin, operator, validator, bob, alice, fred, treasury] = await ethers.getSigners();
    SyndicateERC20 = await ethers.getContractFactory("SyndicateERC20");
    SyntheticSyndicateERC20 = await ethers.getContractFactory("SyntheticSyndicateERC20");
    Tesseract = await ethers.getContractFactory("Tesseract");
    TesseractV2 = await ethers.getContractFactory("TesseractV2Mock");
    MainWormholeBridge = await ethers.getContractFactory("MainWormholeBridgeMock");
    SideWormholeBridge = await ethers.getContractFactory("SideWormholeBridgeMock");
    SeedPool = await ethers.getContractFactory("SeedPool");
    SidePoolViews = await ethers.getContractFactory("SidePoolViews");
    MainPool = await ethers.getContractFactory("MainPool");
    SeedToken = await ethers.getContractFactory("SeedToken");
    WormholeMock = await ethers.getContractFactory("WormholeMock");
    SynCityPasses = await ethers.getContractFactory("SynCityPassesMock");
    SynCityCoupons = await ethers.getContractFactory("SynCityCoupons");
  });

  async function initAndDeploy(initSeedPool = true) {
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

    synr.connect(fundOwner).transfer(bob.address, ethers.utils.parseEther("1000000000"));
    synr.connect(fundOwner).transfer(alice.address, ethers.utils.parseEther("1000000000"));
    synr.connect(fundOwner).transfer(fred.address, ethers.utils.parseEther("1000000000"));

    sSynr = await SyntheticSyndicateERC20.deploy(superAdmin.address);
    await sSynr.deployed();

    await sSynr.connect(superAdmin).mint(fundOwner.address, ethers.utils.parseEther("300000"));
    await sSynr.connect(superAdmin).mint(alice.address, ethers.utils.parseEther("200000"));

    pass = await SynCityPasses.deploy(validator.address);
    await pass.deployed();

    fundOwnerTokenID = (await pass.nextTokenId()).toNumber();
    await pass.mintToken(fundOwner.address);
    await pass.mintToken(bob.address);
    aliceTokenID = (await pass.nextTokenId()).toNumber();
    await pass.mintToken(alice.address);
    await pass.mintToken(alice.address);
    await pass.mintToken(alice.address);
    await pass.mintToken(alice.address);
    bobTokenID = (await pass.nextTokenId()).toNumber();
    await pass.mintToken(bob.address);
    await pass.mintToken(bob.address);

    mainPool = await upgrades.deployProxy(MainPool, [synr.address, sSynr.address, pass.address]);
    await mainPool.deployed();

    mainTesseract = await upgrades.deployProxy(Tesseract, []);
    await mainTesseract.deployed();

    mainBridge = await upgrades.deployProxy(MainWormholeBridge, [mainTesseract.address, mainPool.address]);
    await mainBridge.deployed();

    await sSynr.updateRole(mainPool.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER());
    await mainPool.setBridge(mainBridge.address, true);
    await mainPool.initPool(7, 4000);

    await mainTesseract.setBridge(1, mainBridge.address);

    seed = await upgrades.deployProxy(SeedToken, []);
    await seed.deployed();

    blueprint = await SynCityCoupons.deploy(8000);
    await blueprint.deployed();
    await blueprint.mint(bob.address, 2);
    await blueprint.mint(fred.address, 1);
    await blueprint.mint(fundOwner.address, 1);
    await blueprint.mint(alice.address, 10);

    sidePoolViews = await upgrades.deployProxy(SidePoolViews, []);

    seedPool = await upgrades.deployProxy(SeedPool, [seed.address, blueprint.address, sidePoolViews.address]);

    await seedPool.deployed();
    if (initSeedPool) {
      await seedPool.initPool(rewardsFactor, decayInterval, decayFactor, swapFactor, stakeFactor, taxPoints, coolDownDays);
      await seedPool.updateExtraConf(
        sPSynrEquivalent,
        sPBoostFactor,
        sPBoostLimit,
        bPSynrEquivalent,
        bPBoostFactor,
        bPBoostLimit
      );
    }

    // process.exit()

    sideTesseract = await upgrades.deployProxy(Tesseract);
    await sideTesseract.deployed();

    sideBridge = await upgrades.deployProxy(SideWormholeBridge, [sideTesseract.address, seedPool.address]);
    await sideBridge.deployed();

    await seedPool.setBridge(sideBridge.address, true);
    await sideTesseract.setBridge(1, sideBridge.address);

    await seed.setMinter(seedPool.address, true);

    wormhole = await WormholeMock.deploy();
    await mainBridge.wormholeInit(2, wormhole.address);
    await wormhole.deployed();

    await mainBridge.wormholeRegisterContract(4, bytes32Address(sideBridge.address));

    await sideBridge.wormholeInit(4, wormhole.address);
    await sideBridge.wormholeRegisterContract(2, bytes32Address(mainBridge.address));
  }

  async function configure() {}

  beforeEach(async function () {
    await initAndDeploy();
  });

  it("should manage the full flow", async function () {
    const amount = ethers.utils.parseEther("10000");
    const amount2 = ethers.utils.parseEther("20000");
    const amount3 = ethers.utils.parseEther("5000");

    // stake SYNR in the Tesseract
    let payload = await serializeInput(
      SYNR_STAKE, // SYNR
      365, // 1 year
      amount
    );
    expect(payload).equal("1000000000000000000000036502");

    let payload2 = await serializeInput(
      SYNR_STAKE, // SYNR
      150,
      amount2
    );
    expect(payload2).equal("2000000000000000000000015002");

    let payload3 = await serializeInput(
      S_SYNR_SWAP, // sSYNR
      0, // 1 year
      amount3
    );
    expect(payload3).equal("500000000000000000000000001");

    await synr.connect(fundOwner).approve(mainPool.address, ethers.utils.parseEther("35000"));

    expect(
      await mainTesseract.connect(fundOwner).crossChainTransfer(
        1,
        payload,
        4, // BSC

        1
      )
    )
      .emit(mainTesseract, "DepositSaved")
      .withArgs(fundOwner.address, 0);

    let tvl = await getMainTvl(mainPool);
    expect(tvl.synrAmount).equal(amount);

    let deposit = await getDeposit(mainPool, fundOwner.address, 0);
    expect(deposit.tokenAmountOrID).equal(amount);
    expect(deposit.tokenType).equal(SYNR_STAKE);
    expect(deposit.otherChain).equal(4);

    const finalPayload = await fromMainDepositToTransferPayload(deposit);

    await sSynr.connect(alice).approve(mainPool.address, ethers.utils.parseEther("30000"));

    expect(
      await mainTesseract.connect(alice).crossChainTransfer(
        1,
        payload3,
        4, // BSC

        1
      )
    )
      .emit(mainTesseract, "DepositSaved")
      .withArgs(alice.address, 0);

    let deposit3 = await getDeposit(mainPool, alice.address, 0);
    expect(deposit3.tokenAmountOrID).equal(amount3);
    expect(deposit3.tokenType).equal(S_SYNR_SWAP);
    expect(deposit3.otherChain).equal(4);
    const finalPayload3 = await fromMainDepositToTransferPayload(deposit3);

    expect(
      await mainTesseract.connect(fundOwner).crossChainTransfer(
        1,
        payload2,
        4, // BSC

        2
      )
    )
      .emit(mainTesseract, "DepositSaved")
      .withArgs(fundOwner.address, 1);

    tvl = await getMainTvl(mainPool);
    expect(tvl.synrAmount).equal(amount.add(amount2));

    let deposit2 = await getDeposit(mainPool, fundOwner.address, 1);
    expect(deposit2.tokenAmountOrID).equal(amount2);
    expect(deposit2.tokenType).equal(SYNR_STAKE);
    expect(deposit2.otherChain).equal(4);
    const finalPayload2 = await fromMainDepositToTransferPayload(deposit2);

    expect(await synr.balanceOf(mainPool.address)).equal(amount.add(amount2));

    expect((await mainPool.users(fundOwner.address)).synrAmount).equal("30000000000000000000000");

    //fundOnwer complete stake

    expect(await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(fundOwner.address, finalPayload)))
      .emit(sideTesseract, "DepositSaved")
      .withArgs(fundOwner.address, 0);

    let conf2 = await getFullConf(seedPool);

    expect(await seed.balanceOf(fundOwner.address)).equal(0);

    expect(await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(fundOwner.address, finalPayload2)))
      .emit(sideTesseract, "DepositSaved")
      .withArgs(fundOwner.address, 1);

    let sideDeposit = await getDeposit(seedPool, fundOwner.address, 1);

    // expect(await seed.balanceOf(fundOwner.address)).equal("964363846981227803145611364");

    await seed.unpauseAllowance();

    await seed.connect(fundOwner).approve(operator.address, ethers.utils.parseEther("10"));

    expect(await seed.allowance(fundOwner.address, operator.address)).equal(ethers.utils.parseEther("10"));

    expect(await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(alice.address, finalPayload3)))
      .emit(sideTesseract, "DepositSaved")
      .withArgs(alice.address, 0);

    await increaseBlockTimestampBy(20 * 24 * 3600);

    let ts = await getTimestamp();
    const untaxedPendingRewards = await seedPool.untaxedPendingRewards(fundOwner.address, ts + 1);

    await seedPool.connect(fundOwner).collectRewards();
    let seedDeposit = await getDeposit(seedPool, fundOwner.address, 0);
    let user = await seedPool.users(fundOwner.address);
    expect(user.lastRewardsAt).equal(await getTimestamp());

    ts = await getTimestamp();
    const untaxedPendingRewards3 = await seedPool.untaxedPendingRewards(alice.address, ts + 1);
    const tax = await sidePoolViews.calculateTaxOnRewards(await getFullConf(seedPool), untaxedPendingRewards3);
    expect(await seed.balanceOf(alice.address)).equal(0);

    await seedPool.connect(alice).collectRewards();
    expect(await seed.balanceOf(alice.address)).equal(untaxedPendingRewards3.sub(tax));

    let payload4 = await serializeInput(
      SYNR_PASS_STAKE_FOR_BOOST, // sSYNR
      0,
      9
    );
    expect(payload4).equal("900003");

    // approve the spending of the pass
    await pass.connect(fundOwner).approve(mainPool.address, 9);

    expect(
      await mainTesseract.connect(fundOwner).crossChainTransfer(
        1,
        payload4,
        4, // BSC

        3
      )
    )
      .emit(mainTesseract, "DepositSaved")
      .withArgs(fundOwner.address, 2);

    let deposit4 = await getDeposit(mainPool, fundOwner.address, 2);
    const finalPayload4 = await fromMainDepositToTransferPayload(deposit4);

    expect(await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(fundOwner.address, finalPayload4)))
      .emit(sideTesseract, "DepositSaved")
      .withArgs(fundOwner.address, 2);

    await increaseBlockTimestampBy(20 * 24 * 3600);

    ts = await getTimestamp();

    const untaxedPendingRewardsBoosted = await seedPool.untaxedPendingRewards(fundOwner.address, ts + 1);

    await increaseBlockTimestampBy(330 * 24 * 3600);

    expect(seedDeposit.unlockedAt).equal(0);
    expect(seedDeposit.generator).equal(seedDeposit.stakedAmount.mul(conf2.stakeFactor).mul(conf2.priceRatio).div(1000000));

    expect(seedDeposit.generator).equal(ethers.utils.parseEther("53000"));

    const seedPayload = await fromSideDepositToTransferPayload(seedDeposit);

    ts = await getTimestamp();
    // unstake

    expect(await sideTesseract.connect(fundOwner).crossChainTransfer(1, seedPayload, 2, 1))
      .emit(sideTesseract, "DepositUnlocked")
      .withArgs(fundOwner.address, 0);

    // unstake SEED from sSYNR

    expect(await seed.balanceOf(alice.address)).equal("0");
    deposit = await getDeposit(seedPool, alice.address, 0);

    await seedPool.connect(alice).unstake(deposit);

    expect(await seed.balanceOf(alice.address)).equal("100000000000000000000000");

    expect(seedPool.connect(alice).unstake(deposit)).revertedWith("SidePool: deposit already unlocked");

    seedDeposit = await getDeposit(seedPool, fundOwner.address, 0);
    expect(seedDeposit.stakedAmount).equal(amount);
    expect(seedDeposit.unlockedAt).equal(ts + 1);
    const synrBalanceBefore = await synr.balanceOf(fundOwner.address);

    expect(await mainTesseract.completeCrossChainTransfer(1, mockEncodedVm(fundOwner.address, seedPayload)))
      .emit(mainTesseract, "DepositUnlocked")
      .withArgs(fundOwner.address, 0);

    const synrBalanceAfter = await synr.balanceOf(fundOwner.address);
    expect(synrBalanceAfter.sub(synrBalanceBefore)).equal(amount);

    let treasuryBalanceBefore = await seed.balanceOf(treasury.address);
    await seedPool.withdrawTaxes(10, treasury.address);
    let treasuryBalanceAfter = await seed.balanceOf(treasury.address);
    expect(treasuryBalanceAfter - treasuryBalanceBefore).equal(10);
    await seedPool.withdrawTaxes(0, treasury.address);
    expect(await seedPool.taxes()).equal(0);
    await assertThrowsMessage(seedPool.withdrawTaxes(10, treasury.address), "SidePool: amount not available");
  });

  it("should verify the boost Vs equivalent", async function () {
    // like the synr equivalent
    const amount = ethers.utils.parseEther(sPSynrEquivalent.toString());

    await stakeSYNR(alice, amount);
    await stakePass(alice, aliceTokenID, true, 1);

    await stakePass(bob, bobTokenID);
    await stakePass(bob, bobTokenID + 1, true, 1);

    await increaseBlockTimestampBy(366 * 24 * 3600);

    await unstake(bob, 0);
    await unstake(bob, 1);
    await unstake(alice, 0);
    await unstake(alice, 1);

    const balanceBob = getInt(await seed.balanceOf(bob.address));
    const balanceAlice = getInt(await seed.balanceOf(alice.address));

    expect(Math.abs(balanceBob - balanceAlice)).lt(2);
  });

  it("should verify that collecting rewards by week or at the end sums almost to same amount", async function () {
    const amount = ethers.utils.parseEther("10000");

    async function setUp() {
      await initAndDeploy();
      // stake SYNR in the Tesseract
      let payload = await serializeInput(
        SYNR_STAKE, // SYNR
        365, // 1 year
        amount
      );
      expect(payload).equal("1000000000000000000000036502");

      await synr.connect(fundOwner).approve(mainPool.address, ethers.utils.parseEther("35000"));

      expect(
        await mainTesseract.connect(fundOwner).crossChainTransfer(
          1,
          payload,
          4, // BSC

          1
        )
      )
        .emit(mainTesseract, "DepositSaved")
        .withArgs(fundOwner.address, 0);

      let deposit = await getDeposit(mainPool, fundOwner.address, 0);
      const finalPayload = await fromMainDepositToTransferPayload(deposit);

      expect(await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(fundOwner.address, finalPayload)))
        .emit(sideTesseract, "DepositSaved")
        .withArgs(fundOwner.address, 0);
    }

    await setUp();

    const DAY = 3600 * 24;

    for (let i = 0; i < 54; i++) {
      await increaseBlockTimestampBy(7 * DAY);
      await seedPool.connect(fundOwner).collectRewards();
    }

    let balance0 = getInt(await seed.balanceOf(fundOwner.address));
    // console.log("balance0", getInt(balance0))

    await setUp();

    await increaseBlockTimestampBy(366 * DAY);
    await seedPool.connect(fundOwner).collectRewards();

    let balance1 = getInt(await seed.balanceOf(fundOwner.address));
    // console.log(balance1/balance0)

    expect(balance1 / balance0 > 0.968 && balance1 / balance0 < 0.97);
  });

  it("should verify early unstake", async function () {
    const amount = ethers.utils.parseEther("10000");
    await synr.connect(fundOwner).transferFrom(fundOwner.address, bob.address, amount);

    // stake SYNR in the Tesseract
    const payload = await serializeInput(
      SYNR_STAKE, // SYNR
      300,
      amount
    );

    expect(payload).equal("1000000000000000000000030002");

    await synr.connect(bob).approve(mainPool.address, ethers.utils.parseEther("10000"));

    await mainTesseract.connect(bob).crossChainTransfer(
      1,
      payload,
      4, // BSC

      1
    );

    let deposit = await getDeposit(mainPool, bob.address, 0);
    expect(deposit.tokenAmountOrID).equal(amount);
    expect(deposit.tokenType).equal(SYNR_STAKE);
    expect(deposit.otherChain).equal(4);

    const finalPayload = await fromMainDepositToTransferPayload(deposit);

    expect(await synr.balanceOf(mainPool.address)).equal(amount);

    await sideTesseract.connect(bob).completeCrossChainTransfer(1, mockEncodedVm(bob.address, finalPayload));

    await increaseBlockTimestampBy(150 * 24 * 3600);

    expect(await canUnstakeWithoutTax(await getDeposit(seedPool, bob.address, 0), await getTimestamp())).equal(false);

    let seedDeposit = await getDeposit(seedPool, bob.address, 0);
    expect(seedDeposit.unlockedAt).equal(0);
    const seedPayload = await fromSideDepositToTransferPayload(seedDeposit);

    const synrBalanceBefore = await synr.balanceOf(bob.address);

    // unstake
    await sideTesseract.connect(bob).crossChainTransfer(1, seedPayload, 2, 1);

    const ts = await getTimestamp();
    const tax = await mainPool.calculatePenaltyForEarlyUnstake(ts, await getDeposit(mainPool, bob.address, 0));
    expect(amount.sub(tax)).equal("8000000000000000000000");

    await mainTesseract.completeCrossChainTransfer(1, mockEncodedVm(bob.address, seedPayload));

    const synrBalanceAfter = await synr.balanceOf(bob.address);
    expect(synrBalanceAfter.sub(synrBalanceBefore)).equal(amount.sub(tax));

    expect(await mainPool.penalties()).equal(tax);
    const synrBalanceBeforePenalty = await synr.balanceOf(alice.address);
    await mainPool.withdrawPenalties(tax, alice.address);
    const synrBalanceAfterPenalty = await synr.balanceOf(alice.address);
    expect(await synrBalanceAfterPenalty).equal(synrBalanceBeforePenalty.add(tax));

    let treasuryBalanceBefore = await seed.balanceOf(treasury.address);
    await seedPool.withdrawTaxes(0, treasury.address);
    let treasuryBalanceAfter = await seed.balanceOf(treasury.address);
    expect(treasuryBalanceAfter.sub(treasuryBalanceBefore)).equal("5396817621900532724505");
  });

  it("should compare one deposit Vs many deposits", async function () {
    const amount = ethers.utils.parseEther("10000");

    await stakeSYNR(bob, amount.mul(10));
    for (let i = 0; i < 10; i++) {
      await stakeSYNR(fred, amount, i);
    }

    await increaseBlockTimestampBy(365 * 24 * 3600);

    await seedPool.connect(bob).collectRewards();
    await seedPool.connect(fred).collectRewards();

    const lockedSeedBob = (await seedPool.users(bob.address)).generator;
    const lockedSeedFred = (await seedPool.users(fred.address)).generator;

    expect(getInt(lockedSeedBob)).equal(530000);
    expect(getInt(lockedSeedFred)).equal(530000);

    let balanceBob = await seed.balanceOf(bob.address);
    let balanceFred = await seed.balanceOf(fred.address);

    expect(getInt(balanceBob)).equal(1657841);
    expect(getInt(balanceFred)).equal(1657840);

    await unstake(bob, 0);
    for (let i = 0; i < 10; i++) {
      await unstake(fred, i);
    }

    balanceBob = await seed.balanceOf(bob.address);
    balanceFred = await seed.balanceOf(fred.address);

    expect(getInt(balanceBob)).equal(1657841);
    // this is just 1 more that
    expect(getInt(balanceFred)).equal(1657841);
  });

  it("should verify final SEED for many lockup times", async function () {
    const amount = ethers.utils.parseEther("100000");
    const conf2 = await getFullConf(seedPool);
    let lockupTime = 7;
    expect(await seed.balanceOf(bob.address)).equal(0);
    await stake(bob, amount, 0, undefined, lockupTime);

    await increaseBlockTimestampBy(lockupTime * 24 * 3600);

    let user = await getUser(seedPool, bob.address);

    expect(getInt(user.deposits[0].generator)).equal(530000);

    let rewards0 = await pendingRewards(conf2, user, await getTimestamp());
    let rewards = await seedPool.pendingRewards(bob.address);
    expect(getInt(rewards)).equal(getInt(rewards0));

    // not unstaking will produce more rewards
    await increaseBlockTimestampBy(lockupTime * 24 * 3600);

    rewards = await seedPool.pendingRewards(bob.address);
    // const ratioRewardsGenerator =
    expect(getInt(rewards)).equal(32401);

    await unstake(bob);
    expect(getInt(await seed.balanceOf(bob.address))).equal(getInt(rewards));

    await initAndDeploy(true);

    lockupTime = 134;
    expect(await seed.balanceOf(bob.address)).equal(0);
    await stake(bob, amount, 0, undefined, lockupTime);
    await increaseBlockTimestampBy(lockupTime * 24 * 3600);
    await unstake(bob);
    expect(getInt(await seed.balanceOf(bob.address))).equal(416030);
  });

  it("should verify that it does get rewards after lockup time has passed", async function () {
    const amount = ethers.utils.parseEther("10000");

    await stakeSYNR(bob, amount.mul(10));

    await increaseBlockTimestampBy(365 * 24 * 3600);

    await seedPool.connect(bob).collectRewards();
    let balanceBob = await seed.balanceOf(bob.address);
    expect(getInt(balanceBob)).equal(1657840);

    await increaseBlockTimestampBy(365 * 24 * 3600);

    await seedPool.connect(bob).collectRewards();
    balanceBob = await seed.balanceOf(bob.address);
    expect(getInt(balanceBob)).equal(1657840 * 2);

    await initAndDeploy(true);

    balanceBob = await seed.balanceOf(bob.address);
    expect(getInt(balanceBob)).equal(0);

    await stakeSYNR(bob, amount.mul(10));

    await increaseBlockTimestampBy(30 * 24 * 3600);

    await seedPool.connect(bob).collectRewards();

    await increaseBlockTimestampBy(300 * 24 * 3600);

    await seedPool.connect(bob).collectRewards();

    await increaseBlockTimestampBy(100 * 24 * 3600);

    await seedPool.connect(bob).collectRewards();

    balanceBob = await seed.balanceOf(bob.address);

    expect(getInt(balanceBob)).equal(1953071);
  });

  it("should verify SYNR and SYNR equivalent produce same results", async function () {
    // like the synr equivalent
    const amount = ethers.utils.parseEther("100000");

    await stakeSYNR(bob, amount);
    await stakeSYNR(bob, amount, 1);
    await stakeSYNR(alice, amount);

    let payloadPass = await serializeInput(
      SYNR_PASS_STAKE_FOR_SEEDS,
      365, // 1 year
      aliceTokenID
    );
    await pass.connect(alice).approve(mainPool.address, aliceTokenID);
    await mainTesseract.connect(alice).crossChainTransfer(1, payloadPass, 4, 1);

    let deposit = await getDeposit(mainPool, alice.address, 1);
    let finalPayload = await fromMainDepositToTransferPayload(deposit);
    await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(alice.address, finalPayload));

    await increaseBlockTimestampBy(366 * 24 * 3600);

    await unstake(bob);
    await unstake(bob, 1);
    await unstake(alice);
    await unstake(alice, 1);

    await seedPool.connect(bob).collectRewards();
    await seedPool.connect(alice).collectRewards();

    let balanceBob = await seed.balanceOf(bob.address);
    let balanceAlice = await seed.balanceOf(alice.address);

    balanceBob = getInt(balanceBob);
    balanceAlice = getInt(balanceAlice);

    expect(Math.abs(balanceBob - balanceAlice)).lte(1);
  });

  it("should start the process, upgrade the contract and complete the flow", async function () {
    const amount = ethers.utils.parseEther("10000");

    expect(await mainTesseract.supportedBridgeById(1)).equal("Wormhole");
    expect(mainTesseract.supportedBridgeById(2)).revertedWith("Tesseract: unsupported bridge");

    // stake SYNR in the Tesseract
    const payload = await serializeInput(
      SYNR_STAKE, // SYNR
      365, // 1 year
      amount
    );

    expect(payload).equal("1000000000000000000000036502");

    await synr.connect(fundOwner).approve(mainPool.address, ethers.utils.parseEther("10000"));

    await mainTesseract.connect(fundOwner).crossChainTransfer(
      1,
      payload,
      4, // BSC

      1
    );

    let deposit = await getDeposit(mainPool, fundOwner.address, 0);
    expect(deposit.tokenAmountOrID).equal(amount);
    expect(deposit.tokenType).equal(SYNR_STAKE);
    expect(deposit.otherChain).equal(4);

    const finalPayload = await fromMainDepositToTransferPayload(deposit);

    expect(await synr.balanceOf(mainPool.address)).equal(amount);

    await sideTesseract.connect(fundOwner).completeCrossChainTransfer(1, mockEncodedVm(fundOwner.address, finalPayload));

    await increaseBlockTimestampBy(366 * 24 * 3600);

    // upgrade contract

    expect(await mainTesseract.version()).equal(1);

    mainTesseract = await upgrades.upgradeProxy(mainTesseract.address, TesseractV2);

    expect(await mainTesseract.version()).equal(2);
    expect(await mainTesseract.supportedBridgeById(1)).equal("Wormhole");
    expect(await mainTesseract.supportedBridgeById(2)).equal("SomeOther");

    let seedDeposit = await getDeposit(seedPool, fundOwner.address, 0);
    expect(seedDeposit.unlockedAt).equal(0);
    const seedPayload = await fromSideDepositToTransferPayload(seedDeposit);

    const ts = await getTimestamp();
    // unstake
    await sideTesseract.connect(fundOwner).crossChainTransfer(1, seedPayload, 2, 1);
    seedDeposit = await getDeposit(seedPool, fundOwner.address, 0);

    expect(seedDeposit.unlockedAt).greaterThan(ts);

    const synrBalanceBefore = await synr.balanceOf(fundOwner.address);

    await mainTesseract.completeCrossChainTransfer(1, mockEncodedVm(fundOwner.address, seedPayload));
    const synrBalanceAfter = await synr.balanceOf(fundOwner.address);
    expect(synrBalanceAfter.sub(synrBalanceBefore)).equal(amount);
  });

  it("should stake pass for boost and increase boostWeight", async function () {
    let unboosted, boosted;
    const amount = ethers.utils.parseEther("10000");

    let conf = await getFullConf(seedPool);
    await stake(fundOwner, amount);
    await increaseBlockTimestampBy(365 * 24 * 3600);

    let user = await getUser(seedPool, fundOwner.address);
    let rewards0 = await pendingRewards(conf, user, (await getTimestamp()) + 1);

    await unstake(fundOwner);

    unboosted = await seed.balanceOf(fundOwner.address);

    expect(getInt(unboosted)).equal(getInt(rewards0));

    await initAndDeploy();

    await stake(fundOwner, amount);
    await stakePass(fundOwner, fundOwnerTokenID, true, 1);
    await increaseBlockTimestampBy(365 * 24 * 3600);

    user = await getUser(seedPool, fundOwner.address);
    let rewards1 = await pendingRewards(conf, user, (await getTimestamp()) + 1);

    let diff = rewards1.sub(rewards0);

    await unstake(fundOwner);
    await unstake(fundOwner, 1);

    boosted = await seed.balanceOf(fundOwner.address);

    expectEqualAsEther(boosted.sub(unboosted), diff);
  });

  it("should stake pass for seed", async function () {
    // stake SYNR in the Tesseract
    const payload = await serializeInput(
      SYNR_PASS_STAKE_FOR_SEEDS,
      365, // 1 year
      9
    );
    expect(payload).equal("936504");
    await pass.connect(fundOwner).approve(mainPool.address, 9);
    await mainTesseract.connect(fundOwner).crossChainTransfer(
      1,
      payload,
      4, // BSC

      1
    );

    let deposit = await getDeposit(mainPool, fundOwner.address, 0);
    expect(deposit.tokenAmountOrID).equal(9);
    expect(deposit.tokenType).equal(SYNR_PASS_STAKE_FOR_SEEDS);
    expect(deposit.otherChain).equal(4);

    const finalPayload = await fromMainDepositToTransferPayload(deposit);
    await sideTesseract.connect(fundOwner).completeCrossChainTransfer(1, mockEncodedVm(fundOwner.address, finalPayload));

    await increaseBlockTimestampBy(366 * 24 * 3600);

    let seedDeposit = await getDeposit(seedPool, fundOwner.address, 0);
    expect(seedDeposit.unlockedAt).equal(0);
    const seedPayload = await fromSideDepositToTransferPayload(seedDeposit);
    const ts = await getTimestamp();

    // unstake
    await sideTesseract.connect(fundOwner).crossChainTransfer(1, seedPayload, 2, 1);
    seedDeposit = await getDeposit(seedPool, fundOwner.address, 0);

    expect(seedDeposit.unlockedAt).greaterThan(ts);

    const passBefore = await pass.balanceOf(fundOwner.address);

    await mainTesseract.completeCrossChainTransfer(1, mockEncodedVm(fundOwner.address, seedPayload));
    const passAfter = await pass.balanceOf(fundOwner.address);
    expect(passAfter.sub(passBefore)).equal(1);
    expect(seedDeposit.tokenType).equal(4);
  });

  it("should stake pass for seed multiple times", async function () {
    // stake SYNR in the Tesseract
    let multiple = 10;
    for (let x = 0; x < multiple; x++) {
      const amount = ethers.utils.parseEther("1000");
      const payload = await serializeInput(
        SYNR_STAKE, // SYNR
        365, // 1 year
        amount
      );
      await synr.connect(fundOwner).approve(mainPool.address, ethers.utils.parseEther("1000"));
      await mainTesseract.connect(fundOwner).crossChainTransfer(
        1,
        payload,
        4, // BSC

        1
      );
      let deposit = await getDeposit(mainPool, fundOwner.address, x);
      const finalPayload = await fromMainDepositToTransferPayload(deposit);
      await sideTesseract.connect(fundOwner).completeCrossChainTransfer(1, mockEncodedVm(fundOwner.address, finalPayload));
    }
  });
});
