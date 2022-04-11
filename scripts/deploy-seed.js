require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const DeployUtils = require("./lib/DeployUtils");
let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);
  const chainId = await deployUtils.currentChainId();

  console.log("Deploying SEED...");
  const SeedToken = await ethers.getContractFactory("SeedToken");
  const seed = await SeedToken.deploy();
  await seed.deployed();

  console.log("SeedToken deployed at", seed.address);
  await deployUtils.saveDeployed(chainId, ["SeedToken"], [seed.address]);

  const network = chainId === 56 ? "bsc" : chainId === 97 ? "bsc_testnet" : "localhost";

  console.log(`
To verify SeedToken source code:
    
  npx hardhat verify --show-stack-traces \\
      --network ${network} \\
      ${seed.address}
      
`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
