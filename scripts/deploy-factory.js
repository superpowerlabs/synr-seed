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

async function main() {
  deployUtils = new DeployUtils(ethers);
  const chainId = await deployUtils.currentChainId();
  const seedAddress = deployed[chainId].SeedToken;
  const blueprintAddress = deployed[chainId].SynCityCoupons;
  const seedFarmingAddress = deployed[chainId].SeedPool;

  const SeedPool = await ethers.getContractFactory("SeedPool");
  const SeedFactory = await ethers.getContractFactory("SeedFactory");

  const seedPool = SeedPool.attach(seedFarmingAddress);

  const SeedToken = await ethers.getContractFactory("SeedToken");
  const seed = await SeedToken.attach(seedAddress);
  console.log("Give the pool minting permissions on Seed");

  // await seed.grantRole(await seed.MINTER_ROLE(), seedPool.address, {gasLimit: 60000});

  console.log("Deploying SeedFactory");

  const seedFactory = await upgrades.deployProxy(SeedFactory, [seedPool.address]);
  await seedFactory.deployed();
  const tx = await seedPool.setFactory(seedFactory.address);
  // const tx = await seedPool.setFactory(deployed[chainId].SeedFactory);
  await tx.wait();

  console.log("SeedFactory deployed at", seedFactory.address);
  await deployUtils.saveDeployed(chainId, ["SeedFactory"], [seedFactory.address]);

  console.log(await deployUtils.verifyCodeInstructions("SeedFactory", chainId, ["address"], [seedPool.address], "SeedFactory"));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
