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
  const seedFarmingAddress = deployed[chainId].SeedPool;

  const SeedPool = await ethers.getContractFactory("SeedPool");
  const seedPool = SeedPool.attach(seedFarmingAddress);

  const tesseract = await deployUtils.deploy("SideTesseract", seedFarmingAddress);

  await deployUtils.Tx(seedPool.setFactory(tesseract.address), "Set SideTesseract as SeedPool factory");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
