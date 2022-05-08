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
  // const blueprintAddress = deployed[chainId].SynCityCoupons;
  const seedFarmingAddress = deployed[chainId].SeedPool;

  const SeedPool = await ethers.getContractFactory("SeedPool");
  const SideTesseract = await ethers.getContractFactory("SideTesseract");

  const seedPool = SeedPool.attach(seedFarmingAddress);

  const SeedToken = await ethers.getContractFactory("SeedToken");
  const seed = await SeedToken.attach(seedAddress);
  console.log("Give the pool minting permissions on Seed");

  // await seed.grantRole(await seed.MINTER_ROLE(), seedPool.address, {gasLimit: 60000});

  console.log("Deploying SideTesseract");

  const tesseract = await SideTesseract.deploy(seedFarmingAddress);
  await tesseract.deployed();

  console.log("SideTesseract deployed at", tesseract.address);
  await deployUtils.saveDeployed(chainId, ["SideTesseract"], [tesseract.address]);

  const network = chainId === 56 ? "bsc" : chainId === 97 ? "bsc_testnet" : "localhost";

  console.log(`
To verify SideTesseract source code:
    
  npx hardhat verify \\
      --contract contracts/SideTesseract.sol:SideTesseract \\
      --show-stack-traces \\
      --network ${network} \\
      ${tesseract.address} \\
      ${seedFarmingAddress}
      
`);

  await deployUtils.Tx(seedPool.setFactory(tesseract.address), "Set SideTesseract as SeedPool factory");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
