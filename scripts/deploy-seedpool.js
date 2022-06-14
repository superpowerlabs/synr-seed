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
const {upgrades} = require("hardhat");
let deployUtils;

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
} = require("./parameters");

async function main() {
  deployUtils = new DeployUtils(ethers);
  const {Tx} = deployUtils;
  const chainId = await deployUtils.currentChainId();
  const seedAddress = deployed[chainId].SeedToken;
  const blueprintAddress = deployed[chainId].SynCityCoupons;
  const poolViewsAddress = deployed[chainId].SidePoolViews;

  const SeedPool = await ethers.getContractFactory("SeedPool");

  console.log("Deploying SeedPool");
  const seedPool = await upgrades.deployProxy(SeedPool, [seedAddress, blueprintAddress, poolViewsAddress]);
  await seedPool.deployed();

  console.log("SeedPool deployed at", seedPool.address);
  await deployUtils.saveDeployed(chainId, ["SeedPool"], [seedPool.address]);

  console.log(await deployUtils.verifyCodeInstructions("SeedPool", chainId, "SeedPool", "pool"));

  await deployUtils.Tx(
    seedPool.initPool(
      rewardsFactor,
      decayInterval,
      decayFactor,
      swapFactor,
      stakeFactor,
      taxPoints,
      coolDownDays,
      chainId === 1337
        ? {}
        : {
            gasLimit: 90000,
          }
    ),
    "Init SeedPool"
  );
  await deployUtils.Tx(
    seedPool.updateExtraConf(
      sPSynrEquivalent,
      sPBoostFactor,
      sPBoostLimit,
      bPSynrEquivalent,
      bPBoostFactor,
      bPBoostLimit,
      chainId === 1337
        ? {}
        : {
            gasLimit: 60000,
          }
    ),
    "Init NFT Conf"
  );
  const SeedToken = await ethers.getContractFactory("SeedToken");
  const seed = await SeedToken.attach(seedAddress);

  await Tx(
    seed.setMinter(seedPool.address, true, {
      gasLimit: 66340,
    }),
    "Give the pool minting permissions on Seed"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
