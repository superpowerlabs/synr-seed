require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const DeployUtils = require("./lib/DeployUtils");
let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);
  const seed = await deployUtils.deployProxy("SeedToken");
  // const seed = await deployUtils.attach("SeedToken");
  // await deployUtils.Tx(seed.unpauseAllowance(), "Unpause allowance");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
