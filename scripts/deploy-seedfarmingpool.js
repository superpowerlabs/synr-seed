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
const {upgrades} = require('hardhat');
let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);
  const chainId = await deployUtils.currentChainId();
  const seedAddress = deployed[chainId].SeedToken;
  const blueprintAddress = deployed[chainId].SynCityCoupons

  const SeedFarmingPool = await ethers.getContractFactory("SeedFarmingPool");

  console.log("Deploying SeedFarmingPool");
  const seedPool = await upgrades.deployProxy(SeedFarmingPool, [seedAddress, seedAddress, blueprintAddress]);
  await seedPool.deployed()
  console.log("SeedFarmingPool deployed at", seedPool.address);

  const SeedToken = await ethers.getContractFactory("SeedToken");
  const seed = await SeedToken.attach(seedAddress);

  console.log("Give the pool minting permissions on Seed")
  await seed.grantRole(await seed.MINTER_ROLE(), seedPool.address, {
    gasLimit: 66340
  });

  await deployUtils.saveDeployed(chainId, ["SeedFarmingPool"], [seedPool.address]);

  console.log(
      await deployUtils.verifyCodeInstructions("SeedFarmingPool", chainId, ["address","address", "address"], [seedAddress, seedAddress, blueprintAddress], "SeedFarmingPool")
  );

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
