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
let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);
  const chainId = await deployUtils.currentChainId();
  const seedAddress = deployed[chainId].SeedToken;
  const blueprintAddress = deployed[chainId].SynCityCoupons

  console.log("Deploying SeedFarm");
  const SeedFarm = await ethers.getContractFactory("SeedFarm");

  const seedFarm = await upgrades.deployProxy(SeedFarm, [seedAddress, blueprintAddress]);
  await seedFarm.deployed();

  const SeedToken = await ethers.getContractFactory("SideToken");
  const seed = await SeedToken.attach(seedAddress);
  await seed.grantRole(await seed.MINTER_ROLE(), seedFarm.address);

  console.log("SeedFarm deployed at", seedFarm.address);

  const network = chainId === 56 ? "BSC" : chainId === 97 ? "BSCTestnet" : "localhost";

  console.log(
      await deployUtils.verifyCodeInstructions("WeedToken", chainId, ["address", "address"], [seedAddress, blueprintAddress], "SeedFarm")
  );

  console.log("SeedFarm deployed at", seedFarm.address);
  await deployUtils.saveDeployed(chainId, ["SeedFarm"], [seedFarm.address]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
