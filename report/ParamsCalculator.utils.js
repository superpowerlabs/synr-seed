const fs = require("fs-extra");
const path = require("path");
const {expect, assert} = require("chai");
const {parse} = require("csv-parse/sync");
const {execSync} = require("node:child_process");

function getJSONFromCSV(input) {
  return parse(input, {
    columns: true,
    delimiter: "\t",
  });
}

const {
  fromMainDepositToTransferPayload,
  fromSideDepositToTransferPayload,
  serializeInput,
} = require("../scripts/lib/PayloadUtils");

function formatBN(bn) {
  let t = ethers.utils.formatEther(bn.toString()).split(".");
  t[1] = t[1].substring(0, 3);
  return t.join(".");
}

function threeDecimals(n) {
  let t = n.toString().split(".");
  t[1] = t[1].substring(0, 3);
  return t.join(".");
}

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
} = require("../scripts/parameters");

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
  sleep,
} = require("../test/helpers");
const {upgrades} = require("hardhat");

// tests to be fixed

function normalize(val, n = 18) {
  return "" + val + "0".repeat(n);
}

describe("#Params Calculator", function () {
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
  let SynCityCouponsSimplified, blueprint;
  let tokenId1, tokenId3;

  let deployer, fundOwner, superAdmin, operator, validator, bob, alice, mark, treasury, frank, fred;

  before(async function () {
    initEthers(ethers);
    [deployer, fundOwner, superAdmin, operator, validator, bob, alice, mark, treasury, frank, fred] = await ethers.getSigners();
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
    SynCityCouponsSimplified = await ethers.getContractFactory("SynCityCoupons");
  });

  async function stake(user, amount, index = 0, tokenType = SYNR_STAKE, k = 365) {
    await synr.connect(user).approve(mainPool.address, amount);
    let payload = await serializeInput(tokenType, k, amount);
    await mainTesseract.connect(user).crossChainTransfer(1, payload, 4, 1);
    let deposit = await mainPool.getDepositByIndex(user.address, index);
    let finalPayload = await fromMainDepositToTransferPayload(deposit);
    await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(user.address, finalPayload));
  }

  async function unstake(user, index = 0) {
    let seedDeposit = await seedPool.getDepositByIndex(user.address, index);
    let seedPayload = await fromSideDepositToTransferPayload(seedDeposit);
    await sideTesseract.connect(user).crossChainTransfer(1, seedPayload, 2, 1);
    await mainTesseract.completeCrossChainTransfer(1, mockEncodedVm(user.address, seedPayload));
  }

  async function initAndDeploy(
    //[100, 8300] best choice
    stakeFactor_,
    swapFactor_,
    sPSynrEquivalent_,
    sPBoostFactor_,
    sPBoostLimit_,
    bPSynrEquivalent_,
    bPBoostFactor_,
    bPBoostLimit_,
    rewardsFactor_
  ) {
    if (!stakeFactor_) stakeFactor_ = stakeFactor;
    if (!swapFactor_) swapFactor_ = swapFactor;
    if (!sPSynrEquivalent_) sPSynrEquivalent_ = sPSynrEquivalent;
    if (!sPBoostFactor_) sPBoostFactor_ = sPBoostFactor;
    if (!sPBoostLimit_) sPBoostLimit_ = sPBoostLimit;
    if (!bPSynrEquivalent_) bPSynrEquivalent_ = bPSynrEquivalent;
    if (!bPBoostFactor_) bPBoostFactor_ = bPBoostFactor;
    if (!bPBoostLimit_) bPBoostLimit_ = bPBoostLimit;
    if (!rewardsFactor_) rewardsFactor_ = rewardsFactor;

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
    synr.connect(fundOwner).transfer(mark.address, ethers.utils.parseEther("1000000000"));
    synr.connect(fundOwner).transfer(frank.address, ethers.utils.parseEther("1000000000"));
    synr.connect(fundOwner).transfer(fred.address, ethers.utils.parseEther("1000000000"));

    sSynr = await SyntheticSyndicateERC20.deploy(superAdmin.address);
    await sSynr.deployed();

    await sSynr.connect(superAdmin).mint(bob.address, ethers.utils.parseEther("1000000000"));
    await sSynr.connect(superAdmin).mint(alice.address, ethers.utils.parseEther("1000000000"));

    pass = await SynCityPasses.deploy(validator.address);
    await pass.deployed();

    await pass.mintToken(bob.address);
    tokenId1 = (await pass.nextTokenId()).sub(1).toNumber();
    await pass.mintToken(mark.address);
    tokenId3 = (await pass.nextTokenId()).sub(1).toNumber();

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

    seed = await SeedToken.deploy();
    await seed.deployed();

    blueprint = await SynCityCouponsSimplified.deploy(8000);
    await blueprint.deployed();

    await blueprint.mint(bob.address, 2);
    await blueprint.mint(mark.address, 1);
    await blueprint.mint(frank.address, 10);

    sidePoolViews = await upgrades.deployProxy(SidePoolViews, []);

    seedPool = await upgrades.deployProxy(SeedPool, [seed.address, blueprint.address, sidePoolViews.address]);

    await seedPool.deployed();

    await seedPool.initPool(rewardsFactor_, decayInterval, decayFactor, swapFactor_, stakeFactor_, taxPoints, coolDownDays);
    //
    // rewardsFactor_,
    // 7 * 24 * 3600,
    //     9800, swapFactor_, stakeFactor_, 800, 3000, 14);

    await seedPool.updateExtraConf(
      sPSynrEquivalent_,
      sPBoostFactor_,
      sPBoostLimit_,
      bPSynrEquivalent_,
      bPBoostFactor_,
      bPBoostLimit_,
      burnRatio
    );

    sideTesseract = await upgrades.deployProxy(Tesseract);
    await sideTesseract.deployed();

    sideBridge = await upgrades.deployProxy(SideWormholeBridge, [sideTesseract.address, seedPool.address]);
    await sideBridge.deployed();

    await seedPool.setBridge(sideBridge.address, true);
    await sideTesseract.setBridge(1, sideBridge.address);

    await seed.grantRole(await seed.MINTER_ROLE(), seedPool.address);

    wormhole = await WormholeMock.deploy();
    await mainBridge.wormholeInit(2, wormhole.address);
    await wormhole.deployed();

    await mainBridge.wormholeRegisterContract(4, bytes32Address(sideBridge.address));

    await sideBridge.wormholeInit(4, wormhole.address);
    await sideBridge.wormholeRegisterContract(2, bytes32Address(mainBridge.address));
  }

  it("should verify balance between stakeFactor and swapFactor", async function () {
    const params = [
      [520, 2000, 17000],
      //
      // BEST | ratio sSYNR/SYNR = 1.20%
      [530, 2000, 17000],
      //
      //
      [540, 2000, 17000],
    ];

    let report = [
      [
        "rewardsFactor",
        "stakeFactor",
        "swapFactor",
        "SYNR/sSYNR amount",
        "Generator for SYNR",
        "Generator for sSYNR",
        "Final SEED for SYNR",
        "Final SEED for sSYNR",
        "sSYNR/SYNR",
      ],
    ];

    for (let i = 0; i < params.length; i++) {
      const tokenAmount = "100000";
      const amount = ethers.utils.parseEther(tokenAmount);
      let [stakeFactor_, swapFactor_, rewardsFactor_] = params[i];

      const row = [rewardsFactor_, stakeFactor_, swapFactor_, tokenAmount];

      await initAndDeploy(
        stakeFactor_,
        swapFactor_,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        rewardsFactor_
      );

      await sSynr.connect(alice).approve(mainPool.address, amount);
      await stake(alice, amount, 0, S_SYNR_SWAP);

      await synr.connect(bob).approve(mainPool.address, amount);
      await stake(bob, amount);

      let seedDeposit = await seedPool.getDepositByIndex(bob.address, 0);
      let generatorFromSYNR = ethers.utils.formatEther(seedDeposit.generator.toString()).toString().split(".")[0];
      row.push(generatorFromSYNR);

      let seedDeposit2 = await seedPool.getDepositByIndex(alice.address, 0);
      let generatorFromSSYNR = ethers.utils.formatEther(seedDeposit2.generator.toString()).toString().split(".")[0];
      row.push(generatorFromSSYNR);

      await increaseBlockTimestampBy(365 * 24 * 3600);

      await unstake(bob);

      let seedFromSYNR = ethers.utils
        .formatEther((await seed.balanceOf(bob.address)).toString())
        .toString()
        .split(".")[0];

      row.push(seedFromSYNR);

      await seedPool.connect(alice).unstake(seedDeposit2);
      // unstake SEED from sSYNR
      let seedFromSSYNR = ethers.utils
        .formatEther((await seed.balanceOf(alice.address)).toString())
        .toString()
        .split(".")[0];

      row.push(seedFromSSYNR);
      row.push(parseInt(seedFromSSYNR) / parseInt(seedFromSYNR));

      report.push(row);
    }
    await fs.ensureDir(path.resolve(__dirname, "../tmp"));
    // report.sort((a, b) => {
    //   a = a[7];
    //   b = b[7];
    //   if (/\d/.test(a) && !/\d/.test(b)) {
    //     a = 1;
    //     b = 0;
    //   } else if (!/\d/.test(a) && /\d/.test(b)) {
    //     a = 0;
    //     b = 1;
    //   }
    //   return a > b ? 1 : a < b ? -1 : 0;
    // });
    report = report.map((e) => e.join("\t")).join("\n");
    await fs.writeFile(path.resolve(__dirname, "../tmp/report.csv"), report);
    console.info(getJSONFromCSV(report));

    console.info("Report saved in", path.resolve(__dirname, "../tmp/report.csv"));
  });

  it("should verify balance between sPSynrEquivalent, sPBoostFactor and sPBoostLimit", async function () {
    // 1 SYNR Pass ~= 2 ETH ~= $5,800 ~= 100,000 $SYNR

    // best from previous it:

    const params = [
      // [
      //   100000, // sPSynrEquivalent
      //   100000, //sPBoostFactor
      //   1000000, //sPBoostLimit
      // ],
      // SYNR PASS
      // [100000, 13220, 200000],

      // blueprints (the calculations works the same)
      [10000, 13220, 20000],
      // [100000, 2660, 1000000],
    ];

    let report = [
      [
        "stakedAmount",
        "lockupTime",
        "sPSynrEquivalent",
        "sPBoostFactor",
        "sPBoostLimit",
        "SYNR",
        "SEEDNoPass",
        "SEEDPassSeed",
        "SEEDPassBoost",
        "Boost",
        "Ratio",
      ],
    ];

    const k = 365;
    for (let i = 0; i < params.length; i++) {
      let [sPSynrEquivalent_, sPBoostFactor_, sPBoostLimit_] = params[i];
      for (let w = 5; w < 6; w++) {
        const tokenAmount = ((sPBoostLimit_ * w) / 10).toString();
        const amount = ethers.utils.parseEther(tokenAmount);
        const row = [tokenAmount, k, sPSynrEquivalent_, sPBoostFactor_, sPBoostLimit_, tokenAmount];
        await initAndDeploy(undefined, undefined, sPSynrEquivalent_, sPBoostFactor_, sPBoostLimit_);

        await stake(bob, amount);
        await stake(alice, amount);
        await stake(mark, amount);

        // mark stake a SYNR Pass for boost
        let payloadPass = await serializeInput(
          SYNR_PASS_STAKE_FOR_BOOST,
          k, // 1 year
          tokenId3
        );
        await pass.connect(mark).approve(mainPool.address, tokenId3);
        await mainTesseract.connect(mark).crossChainTransfer(1, payloadPass, 4, 1);

        deposit = await mainPool.getDepositByIndex(mark.address, 1);
        finalPayload = await fromMainDepositToTransferPayload(deposit);
        await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(mark.address, finalPayload));

        // bob stakes SYNR Pass for SEED
        payloadPass = await serializeInput(
          SYNR_PASS_STAKE_FOR_SEEDS,
          k, // 1 year
          tokenId1
        );
        await pass.connect(bob).approve(mainPool.address, tokenId1);
        await mainTesseract.connect(bob).crossChainTransfer(1, payloadPass, 4, 1);

        deposit = await mainPool.getDepositByIndex(bob.address, 1);
        finalPayload = await fromMainDepositToTransferPayload(deposit);
        await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(bob.address, finalPayload));

        await increaseBlockTimestampBy(366 * 24 * 3600);

        await unstake(bob);
        await unstake(bob, 1);
        await unstake(alice);
        await unstake(mark);
        await unstake(mark, 1);

        const noBoostNoSeed = await seed.balanceOf(alice.address);
        const forBoost = await seed.balanceOf(mark.address);
        const forSeed = await seed.balanceOf(bob.address);

        row.push(formatBN(noBoostNoSeed));
        row.push(formatBN(forSeed));
        row.push(formatBN(forBoost));

        let boost = threeDecimals(parseFloat(formatBN(forBoost)) / parseFloat(formatBN(noBoostNoSeed)));
        row.push(boost);

        let ratio = threeDecimals(parseFloat(formatBN(forBoost)) / parseFloat(formatBN(forSeed)));
        row.push(ratio);

        report.push(row);

        // break
      }
    }
    await fs.ensureDir(path.resolve(__dirname, "../tmp"));
    report = report.map((e) => e.join("\t")).join("\n");
    await fs.writeFile(path.resolve(__dirname, "../tmp/report2.csv"), report);
    console.info(getJSONFromCSV(report));

    console.info("Report saved in", path.resolve(__dirname, "../tmp/report2.csv"));
  });
});
