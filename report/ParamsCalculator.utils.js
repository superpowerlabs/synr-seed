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

const {
  rewardsFactor,
  decayInterval,
  decayFactor,
  swapFactor,
  stakeFactor,
  taxPoints,
  burnRatio,
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
  let SynCityCouponsSimplified, blueprint;
  let tokenId1, tokenId3;

  let deployer, fundOwner, superAdmin, operator, validator, bob, alice, mark, treasury, frank, user5;

  before(async function () {
    initEthers(ethers);
    [deployer, fundOwner, superAdmin, operator, validator, bob, alice, mark, treasury, frank, user5] =
      await ethers.getSigners();
    SyndicateERC20 = await ethers.getContractFactory("SyndicateERC20");
    SyntheticSyndicateERC20 = await ethers.getContractFactory("SyntheticSyndicateERC20");
    Tesseract = await ethers.getContractFactory("Tesseract");
    TesseractV2 = await ethers.getContractFactory("TesseractV2Mock");
    MainWormholeBridge = await ethers.getContractFactory("MainWormholeBridgeMock");
    SideWormholeBridge = await ethers.getContractFactory("SideWormholeBridgeMock");
    SeedPool = await ethers.getContractFactory("SeedPool");
    MainPool = await ethers.getContractFactory("MainPool");
    SeedToken = await ethers.getContractFactory("SeedToken");
    WormholeMock = await ethers.getContractFactory("WormholeMock");
    SynCityPasses = await ethers.getContractFactory("SynCityPassesMock");
    SynCityCouponsSimplified = await ethers.getContractFactory("SynCityCoupons");
  });

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

    seedPool = await upgrades.deployProxy(SeedPool, [seed.address, blueprint.address]);

    await seedPool.deployed();
    await seedPool.initPool(rewardsFactor_, 7 * 24 * 3600, 9800, swapFactor_, stakeFactor_, 800, 3000, 14);

    await seedPool.updateNftConf(
      sPSynrEquivalent_,
      sPBoostFactor_,
      sPBoostLimit_,
      bPSynrEquivalent_,
      bPBoostFactor_,
      bPBoostLimit_
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
      // best choice
      // [100, 50000, 20000],
      // [100, 2000, 800],
      // this give a ratio SYNR>SEED of 1>20
      // [5, 2000, 18000],
      // [30, 2000, 3000],
      // [2, 2000, 23000],
      [400, 2000, 17000],
    ];

    let report = [
      [
        "rewardsFactor",
        "stakeFactor",
        "swapFactor",
        "SYNR/sSYNR amount",
        "SEED after staking SYNR",
        "SEED after swapping sSYNR",
        "Final SEED for SYNR",
        "Final SEED for sSYNR",
        "sSYNR/SYNR",
        "APY",
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

      // approve SYNR spend
      await synr.connect(bob).approve(mainPool.address, amount);

      // console.log(amount.toString());

      let payload = await serializeInput(SYNR_STAKE, 365, amount);
      await mainTesseract.connect(bob).crossChainTransfer(1, payload, 4, 1);

      // approve sSYNR spend
      await sSynr.connect(alice).approve(mainPool.address, amount);
      let payload2 = await serializeInput(S_SYNR_SWAP, 0, amount);
      await mainTesseract.connect(alice).crossChainTransfer(1, payload2, 4, 1);

      let deposit = await mainPool.getDepositByIndex(bob.address, 0);
      let finalPayload = await fromMainDepositToTransferPayload(deposit);

      await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(bob.address, finalPayload));

      deposit = await mainPool.getDepositByIndex(alice.address, 0);
      finalPayload = await fromMainDepositToTransferPayload(deposit);

      await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(alice.address, finalPayload));

      await increaseBlockTimestampBy(366 * 24 * 3600);

      // unstake SEED and SYNR
      let seedDeposit = await seedPool.getDepositByIndex(bob.address, 0);
      let seedPayload = await fromSideDepositToTransferPayload(seedDeposit);

      let stakedSeedFromSYNR = ethers.utils.formatEther(seedDeposit.tokenAmount.toString()).toString().split(".")[0];
      row.push(stakedSeedFromSYNR);

      let seedDeposit2 = await seedPool.getDepositByIndex(alice.address, 0);

      let stakedSeedFromSSYNR = ethers.utils.formatEther(seedDeposit2.tokenAmount.toString()).toString().split(".")[0];
      row.push(stakedSeedFromSSYNR);

      await sideTesseract.connect(bob).crossChainTransfer(1, seedPayload, 2, 1);

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
      row.push((100 * parseInt(seedFromSYNR)) / parseInt(stakedSeedFromSYNR)); // APY

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
    // console.info(getJSONFromCSV(report));

    console.info("Report saved in", path.resolve(__dirname, "../tmp/report.csv"));
  });

  it.only("should verify balance between sPSynrEquivalent, sPBoostFactor and sPBoostLimit", async function () {
    // 1 SYNR Pass ~= 2 ETH ~= $5,800 ~= 100,000 $SYNR

    // best from previous it:

    const params = [
      // [
      //   100000, // sPSynrEquivalent
      //   100000, //sPBoostFactor
      //   1000000, //sPBoostLimit
      // ],
      [100000, 20600, 200000],
      // [100000, 200000, 500000],
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
      for (let w = 1; w < 5; w++) {
        const tokenAmount = ((sPSynrEquivalent_ * w) / 2).toString();
        const amount = ethers.utils.parseEther(tokenAmount);
        const row = [tokenAmount, k, sPSynrEquivalent_, sPBoostFactor_, sPBoostLimit_, tokenAmount];
        await initAndDeploy(undefined, undefined, sPSynrEquivalent_, sPBoostFactor_, sPBoostLimit_);

        async function stakeSYNR(user, amount, m = 1) {
          await synr.connect(user).approve(mainPool.address, amount.mul(m));
          let payload = await serializeInput(SYNR_STAKE, k, amount.mul(m));
          await mainTesseract.connect(user).crossChainTransfer(1, payload, 4, 1);
          let deposit = await mainPool.getDepositByIndex(user.address, 0);
          let finalPayload = await fromMainDepositToTransferPayload(deposit);
          await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(user.address, finalPayload));
          // console.log(formatBN((await seedPool.getDepositByIndex(user.address, 0)).tokenAmount))
        }

        await stakeSYNR(bob, amount);
        await stakeSYNR(alice, amount);
        await stakeSYNR(mark, amount);

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

        console.log("Alice", formatBN((await seedPool.users(alice.address)).tokenAmount));
        console.log("Bob", formatBN((await seedPool.users(bob.address)).tokenAmount));
        console.log("Mark", formatBN((await seedPool.users(mark.address)).tokenAmount));

        async function unstake(user) {
          let seedDeposit = await seedPool.getDepositByIndex(user.address, 0);
          let seedPayload = await fromSideDepositToTransferPayload(seedDeposit);
          await sideTesseract.connect(user).crossChainTransfer(1, seedPayload, 2, 1);
          await mainTesseract.completeCrossChainTransfer(1, mockEncodedVm(user.address, seedPayload));
        }

        await unstake(bob);
        await unstake(alice);
        await unstake(mark);

        const noBoostNoSeed = await seed.balanceOf(alice.address);
        const forBoost = await seed.balanceOf(mark.address);
        const forSeed = await seed.balanceOf(bob.address);

        row.push(formatBN(noBoostNoSeed));
        row.push(formatBN(forSeed));
        row.push(formatBN(forBoost));
        let boost = parseFloat(formatBN(forBoost)) / parseFloat(formatBN(noBoostNoSeed));
        row.push(boost);

        let ratio = parseFloat(formatBN(forBoost)) / parseFloat(formatBN(forSeed));

        row.push(ratio);

        report.push(row);

        // break
        // if (1 - ratio < 0.2) {
        //   break
        // }
      }
    }
    await fs.ensureDir(path.resolve(__dirname, "../tmp"));
    // report.sort((a, b) => {
    //   a = a[8];
    //   b = b[8];
    //   return a > b ? 1 : a < b ? -1 : 0;
    // });
    report = report.map((e) => e.join("\t")).join("\n");
    await fs.writeFile(path.resolve(__dirname, "../tmp/report2.csv"), report);
    console.info(getJSONFromCSV(report));

    console.info("Report saved in", path.resolve(__dirname, "../tmp/report2.csv"));
  });

  it("should verify the balance between blueprint boost and pass boost", async function () {
    const params = [
      [
        100000, //sPBoostFactor
        1000000, //sPBoostLimit
        Math.floor(100000 / 20), //bPBoostFactor
        1000000, //bPBoostLimit
      ],
      [
        100000, //sPBoostFactor
        1000000, //sPBoostLimit
        Math.floor(100000 / 10), //bPBoostFactor
        50000, //bPBoostLimit
      ],
      // [500000, 200000, Math.floor(500000 / 20), 200000],
      // [200000, 500000, Math.floor(200000 / 20), 500000],
    ];

    let report = [
      [
        "SYNR amount",
        "lockupTime",
        "sPBoostFactor",
        "sPBoostLimit",
        "bPBoostFactor",
        "bPBoostLimit",
        "Final Boost for Pass without SYNR",
        "Final Boost for Blueprints without SYNR",
        "Ratio",
      ],
    ];

    for (let k = 92; k < 380; k += 92) {
      if (k > 365) {
        k = 365;
      }

      for (let i = 0; i < params.length; i++) {
        const tokenAmount = "100000";
        const amount = ethers.utils.parseEther(tokenAmount);
        let [sPBoostFactor, sPBoostLimit, bPBoostFactor, bPBoostLimit] = params[i];
        const row = [tokenAmount, k, sPBoostFactor, sPBoostLimit, bPBoostFactor, bPBoostLimit];
        await initAndDeploy(100, 8300, 100000, sPBoostFactor, sPBoostLimit, undefined, bPBoostFactor, bPBoostLimit);

        // approve SYNR spend no boost
        await synr.connect(bob).approve(mainPool.address, amount);
        // console.log(amount.toString());
        let payload = await serializeInput(SYNR_STAKE, k, amount);
        await mainTesseract.connect(bob).crossChainTransfer(1, payload, 4, 1);

        let deposit = await mainPool.getDepositByIndex(bob.address, 0);
        let finalPayload = await fromMainDepositToTransferPayload(deposit);
        await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(bob.address, finalPayload));

        //approve and transfer SYNR and boost for mark
        await synr.connect(mark).approve(mainPool.address, amount);
        payload = await serializeInput(SYNR_STAKE, k, amount);
        await mainTesseract.connect(mark).crossChainTransfer(1, payload, 4, 1);

        deposit = await mainPool.getDepositByIndex(mark.address, 0);
        finalPayload = await fromMainDepositToTransferPayload(deposit);
        await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(mark.address, finalPayload));

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

        //approve and transfer blueprint on bsc for user 4
        await synr.connect(frank).approve(mainPool.address, amount);
        payload = await serializeInput(SYNR_STAKE, k, amount);
        await mainTesseract.connect(frank).crossChainTransfer(1, payload, 4, 1);

        deposit = await mainPool.getDepositByIndex(frank.address, 0);
        finalPayload = await fromMainDepositToTransferPayload(deposit);
        await sideTesseract.completeCrossChainTransfer(1, mockEncodedVm(frank.address, finalPayload));

        await blueprint.connect(frank).approve(seedPool.address, 5);
        await seedPool.connect(frank).stake(BLUEPRINT_STAKE_FOR_BOOST, k, 5);

        await increaseBlockTimestampBy(366 * 24 * 3600);

        // unstake SEED and SYNR
        let seedDeposit = await seedPool.getDepositByIndex(bob.address, 0);
        let seedPayload = await fromSideDepositToTransferPayload(seedDeposit);

        await sideTesseract.connect(bob).crossChainTransfer(1, seedPayload, 2, 1);

        let seedFromSYNR = ethers.utils
          .formatEther((await seed.balanceOf(bob.address)).toString())
          .toString()
          .split(".")[0];

        //unstake from mark
        seedDeposit = await seedPool.getDepositByIndex(mark.address, 0);
        seedPayload = await fromSideDepositToTransferPayload(seedDeposit);
        await sideTesseract.connect(mark).crossChainTransfer(1, seedPayload, 2, 1);
        await mainTesseract.completeCrossChainTransfer(1, mockEncodedVm(mark.address, seedPayload));

        seedDeposit = await seedPool.getDepositByIndex(mark.address, 1);
        seedPayload = await fromSideDepositToTransferPayload(seedDeposit);

        await sideTesseract.connect(mark).crossChainTransfer(1, seedPayload, 2, 1);
        await mainTesseract.completeCrossChainTransfer(1, mockEncodedVm(mark.address, seedPayload));

        let balanceAfterBoostPass = ethers.utils
          .formatEther((await seed.balanceOf(mark.address)).toString())
          .toString()
          .split(".")[0];
        row.push(balanceAfterBoostPass - seedFromSYNR);

        // unstake from frank
        seedDeposit = await seedPool.getDepositByIndex(frank.address, 0);
        seedPayload = await fromSideDepositToTransferPayload(seedDeposit);
        await sideTesseract.connect(frank).crossChainTransfer(1, seedPayload, 2, 1);
        await mainTesseract.completeCrossChainTransfer(1, mockEncodedVm(frank.address, seedPayload));

        let balanceAfterBoostBlueprint = ethers.utils
          .formatEther((await seed.balanceOf(frank.address)).toString())
          .toString()
          .split(".")[0];

        row.push(balanceAfterBoostBlueprint - seedFromSYNR);

        row.push(parseInt(balanceAfterBoostBlueprint - seedFromSYNR) / parseInt(balanceAfterBoostPass - seedFromSYNR));
        report.push(row);
      }
    }
    await fs.ensureDir(path.resolve(__dirname, "../tmp"));
    // report.sort((a, b) => {
    //   a = a[7];
    //   b = b[7];
    //   return a > b ? 1 : a < b ? -1 : 0;
    // });
    report = report.map((e) => e.join("\t")).join("\n");
    await fs.writeFile(path.resolve(__dirname, "../tmp/report3.csv"), report);
    console.info(report);

    console.info("Report saved in", path.resolve(__dirname, "../tmp/report3.csv"));
  });
});
