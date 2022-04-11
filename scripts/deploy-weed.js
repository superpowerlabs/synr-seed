require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const DeployUtils = require("./lib/DeployUtils");
let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);
  const chainId = await deployUtils.currentChainId();

  console.log("Deploying SEED...");
  const WeedToken = await ethers.getContractFactory("WeedToken");
  const weed = await WeedToken.deploy();
  await weed.deployed();

  console.log("WeedToken deployed at", weed.address);
  await deployUtils.saveDeployed(chainId, ["WeedToken"], [weed.address]);

  const network = chainId === 56 ? "bsc" : chainId === 97 ? "bsc_testnet" : "localhost";

  console.log(`
To verify weedToken source code:
    
  npx hardhat verify --show-stack-traces \\
      --network ${network} \\
      ${weed.address}
      
`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
