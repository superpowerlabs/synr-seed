// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
require("dotenv").config();
const hre = require("hardhat");
const requireOrMock = require("require-or-mock");
const ethers = hre.ethers;
const deployed = requireOrMock("export/deployed.json");
const DeployUtils = require("../scripts/lib/DeployUtils");
const {serializeInput, fromDepositToTransferPayload} = require("../scripts/lib/PayloadUtils");
const {bytes32Address, mockEncodedVm} = require("../test/helpers");

let deployUtils;

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
const {upgrades} = require("hardhat");

async function main() {
  deployUtils = new DeployUtils(ethers);
  const {Tx} = deployUtils;
  const chainId = await deployUtils.currentChainId();

  let [, localTokenOwner, localSuperAdmin] = await ethers.getSigners();

  const tokenOwner = localTokenOwner.address;
  const superAdmin = localSuperAdmin.address;
  const maxTotalSupply = process.env.MAX_TOTAL_SUPPLY || 10000000000;

  const synr = await deployUtils.deploy("SyndicateERC20", tokenOwner, maxTotalSupply, superAdmin);

  let features =
    (await synr.FEATURE_TRANSFERS_ON_BEHALF()) +
    (await synr.FEATURE_TRANSFERS()) +
    (await synr.FEATURE_UNSAFE_TRANSFERS()) +
    (await synr.FEATURE_DELEGATIONS()) +
    (await synr.FEATURE_DELEGATIONS_ON_BEHALF());

  await deployUtils.Tx(synr.updateFeatures(features));

  const sSynr = await deployUtils.deploy("SyntheticSyndicateERC20", superAdmin);

  // pass

  const validator = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";

  const operators = ["0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"];

  const pass = await deployUtils.deploy("SynCityPasses", validator);
  await deployUtils.Tx(pass.setOperators(operators));

  let mainPool = await deployUtils.deployProxy("MainPool", synr.address, sSynr.address, pass.address);
  await deployUtils.Tx(sSynr.updateRole(mainPool.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER()), "Whitelisting the pool");
  await deployUtils.Tx(mainPool.initPool(minimumLockupTime, earlyUnstakePenalty, {gasLimit: 70000}), "Init main pool");

  const seed = await deployUtils.deploy("SeedToken");
  const coupons = await deployUtils.deploy("SynCityCoupons", 8000);
  await coupons.deployed();
  await coupons.mint(tokenOwner, 1);

  let sidePool = await deployUtils.deployProxy("SeedPool", seed.address, coupons.address);

  await deployUtils.Tx(
    sidePool.initPool(rewardsFactor, decayInterval, decayFactor, swapFactor, stakeFactor, taxPoints, burnRatio, coolDownDays, {
      gasLimit: 90000,
    }),
    "Init SeedPool"
  );
  await deployUtils.Tx(
    sidePool.updateExtraConf(sPSynrEquivalent, sPBoostFactor, sPBoostLimit, bPSynrEquivalent, bPBoostFactor, bPBoostLimit, {
      gasLimit: 60000,
    }),
    "Init NFT Conf"
  );

  await deployUtils.Tx(
    seed.grantRole(await seed.MINTER_ROLE(), sidePool.address),
    "Granting the pool minting role for SeedToken"
  );

  // test cases

  let mainTesseract = await deployUtils.deployProxy("Tesseract");
  await mainTesseract.deployed();
  mainBridge = await deployUtils.deployProxy("MainWormholeBridge", mainTesseract.address, mainPool.address);
  await mainBridge.deployed();
  await mainTesseract.setBridge(1, mainBridge.address);
  await mainPool.setBridge(mainBridge.address, true);

  let sideTesseract = await deployUtils.deployProxy("Tesseract");
  await sideTesseract.deployed();
  let sideBridge = await deployUtils.deployProxy("SideWormholeBridge", sideTesseract.address, sidePool.address);

  await sideBridge.deployed();
  await sideTesseract.setBridge(1, sideBridge.address);
  await sidePool.setBridge(sideBridge.address, true);

  let wormhole = await deployUtils.deployProxy("WormholeMock");
  await wormhole.deployed();

  await mainBridge.wormholeInit(2, wormhole.address);
  await mainBridge.wormholeRegisterContract(4, bytes32Address(sideBridge.address));

  await sideBridge.wormholeInit(4, wormhole.address);
  await sideBridge.wormholeRegisterContract(2, bytes32Address(mainBridge.address));

  const amount = ethers.utils.parseEther("10000");

  let payload = await serializeInput(
    2, // SYNR
    365, // 1 year
    amount
  );

  await synr.connect(localTokenOwner).approve(mainPool.address, amount);

  await mainTesseract.connect(localTokenOwner).crossChainTransfer(
    1,
    payload,
    4, // BSC
    1
  );

  const amount2 = ethers.utils.parseEther("50000");
  payload = await serializeInput(
    2, // SYNR
    365, // 1 year
    amount2
  );
  await synr.connect(localTokenOwner).approve(mainPool.address, amount2);
  await mainTesseract.connect(localTokenOwner).crossChainTransfer(
    1,
    payload,
    4, // BSC
    1
  );

  await coupons.connect(localTokenOwner).approve(sidePool.address, 1);
  await sidePool.connect(localTokenOwner).stake(5, 0, 1);

  // console.log(await mainPool.getDepositsLength(tokenOwner));
  // console.log(await sidePool.getDepositsLength(tokenOwner));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
