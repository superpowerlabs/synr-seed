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
  const SeedToken = await ethers.getContractFactory("SideToken");
  const seed = await upgrades.deployProxy(SeedToken, []);
  await seed.deployed();

  console.log(
    await deployUtils.verifyCodeInstructions("SeedToken", chainId, [], [], "SeedToken")
  );

  console.log("SeedToken deployed at", seed.address);
  await deployUtils.saveDeployed(chainId, ["SeedToken"], [seed.address]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
