require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const DeployUtils = require("./lib/DeployUtils");
let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);
  const chainId = await deployUtils.currentChainId();
  const network = chainId === 56 ? "BSC" : chainId === 97 ? "BSCTestnet" : "localhost";

  console.log("Deploying SEED...");
  const SeedToken = await ethers.getContractFactory("SeedToken");
  const seed = await upgrades.deployProxy(SeedToken, []);
  await seed.deployed();

  console.log(`
To verify SeedToken source code, flatten the source code, get the implementation address in .openzeppelin, remove the licenses, except the first one, and verify manually
`);

  console.log("SeedToken deployed at", seed.address);
  await deployUtils.saveDeployed(chainId, ["SeedToken"], [seed.address]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
