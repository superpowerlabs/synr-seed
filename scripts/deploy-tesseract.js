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
const DeployUtils = require("./lib/DeployUtils");
const wormholeConfig = require("./lib/wormholeConfig");
const {bytes32Address} = require("../test/helpers");

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
} = require("./parameters");

async function main() {
  deployUtils = new DeployUtils(ethers);
  const {network} = deployUtils;
  const chainId = await deployUtils.currentChainId();
  const [owner] = await ethers.getSigners();

  let pool;

  console.log("Deploying contracts with the account:", owner.address, "to", network(chainId));

  if (chainId < 6) {
    const sSynr = await deployUtils.attach("SyntheticSyndicateERC20");
    pool = await deployUtils.deployProxy(
      "MainPool",
      deployed[chainId].SyndicateERC20,
      sSynr.address,
      deployed[chainId].SynCityPasses
    );
    // pool = await deployUtils.attach("MainPool");
    await deployUtils.Tx(
      sSynr.connect(owner).updateRole(pool.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER(), {gasLimit: 60000}),
      "Whitelisting the pool"
    );
    await deployUtils.Tx(pool.initPool(minimumLockupTime, earlyUnstakePenalty, {gasLimit: 70000}), "Init main pool");
  } else {
    const seed = await deployUtils.attach("SeedToken");
    pool = await deployUtils.deployProxy("SeedPool", deployed[chainId].SeedToken, deployed[chainId].SynCityCoupons);

    await deployUtils.Tx(
      pool.initPool(rewardsFactor, decayInterval, decayFactor, swapFactor, stakeFactor, taxPoints, burnRatio, coolDownDays, {
        gasLimit: 90000,
      }),
      "Init SeedPool"
    );
    await deployUtils.Tx(
      pool.updateNftConf(sPSynrEquivalent, sPBoostFactor, sPBoostLimit, bPBoostFactor, bPBoostLimit, {gasLimit: 60000}),
      "Init NFT Conf"
    );
    await deployUtils.Tx(
      seed.grantRole(await seed.MINTER_ROLE(), pool.address),
      "Granting the pool minting role for SeedToken"
    );
  }

  const tesseract = await deployUtils.deployProxy("Tesseract");

  const bridgeName = chainId < 6 ? "MainWormholeBridge" : "SideWormholeBridge";
  const bridge = await deployUtils.deploy(bridgeName, tesseract.address, pool.address);

  await deployUtils.Tx(pool.setBridge(bridge.address, true), "Set bridge in pool");
  await deployUtils.Tx(tesseract.setBridge(1, bridge.address), "Se bridge in tesseract");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
