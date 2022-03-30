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

  console.log("Deploying SeedFarm");
  const SeedFarm = await ethers.getContractFactory("SeedFarm");

  const seedFarm = await upgrades.deployProxy(SeedFarm, [seedAddress]);
  await seedFarm.deployed();

  const SeedToken = await ethers.getContractFactory("SeedToken");
  const seed = await SeedToken.attach(seedAddress);
  await seed.grantRole(await seed.MINTER_ROLE(), seedFarm.address);

  console.log("SeedFarm deployed at", seedFarm.address);

  const network = chainId === 56 ? "BSC" : chainId === 97 ? "BSCTestnet" : "localhost";

  console.log(`
To verify SeedFarm source code, flatten the source code, get the implementation address in .openzeppelin, remove the licenses, except the first one, and verify manually

The encoded arguments are:

${deployUtils.encodeArguments(["address"], [seedAddress])}
`);

  console.log("SeedFarm deployed at", seedFarm.address);
  await deployUtils.saveDeployed(chainId, ["SeedFarm"], [seedFarm.address]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
