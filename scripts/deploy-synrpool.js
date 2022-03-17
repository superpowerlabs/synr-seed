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

// TODO must be rewritten

async function main() {
  deployUtils = new DeployUtils(ethers);
  const chainId = await deployUtils.currentChainId();
  console.log("chainId", chainId);

  const [owner] = await ethers.getSigners();

  const synAddress = deployed[chainId].SyndicateERC20;
  const ssynAddress = deployed[chainId].SyntheticSyndicateERC20;
  console.log("Deploying SynrPool");
  const SynrPool = await ethers.getContractFactory("SynrPool");

  const synrPool = await upgrades.deployProxy(SynrPool, [synr.address, sSynr.address]);
  await synrPool.deployed();

  console.log("SynrPool deployed at", synrPool.address);

  const network = chainId === 1 ? "ethereum" : chainId === 3 ? "ropsten" : "localhost";

  console.log(`
To verify SynrPool source code:
    
  npx hardhat verify --show-stack-traces \\
      --network ${network} \\
      ${synrPool.address} \\
      ${synAddress} \\
      ${ssynAddress} \\  
`);

  console.log("SynrPool deployed at", synrPool.address);
  await deployUtils.saveDeployed(chainId, ["SynrPool"], [synrPool.address]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
