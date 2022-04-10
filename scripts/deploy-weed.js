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
  const WeedToken = await ethers.getContractFactory("WeedToken");
  const seed = await upgrades.deployProxy(WeedToken, []);
  await seed.deployed();

  console.log(
      await deployUtils.verifyCodeInstructions("WeedToken", chainId, [], [], "WeedToken")
  );


  console.log("WeedToken deployed at", seed.address);
  await deployUtils.saveDeployed(chainId, ["WeedToken"], [seed.address]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
