require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const DeployUtils = require("./lib/DeployUtils");
let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);
  const {deploy, network} = deployUtils;
  const chainId = await deployUtils.currentChainId();

  const seed = await deploy("SeedToken", "Deploying SEED...");

  console.log("SeedToken deployed at", seed.address);
  await deployUtils.saveDeployed(chainId, ["SeedToken"], [seed.address]);

  console.log(`
To verify SeedToken source code:
    
  npx hardhat verify \\
      --contract contracts/token/SeedToken.sol:SeedToken \\
      --show-stack-traces \\
      --network ${network(chainId)} \\
      ${seed.address}
      
`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
