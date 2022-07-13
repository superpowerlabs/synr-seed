// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
require("dotenv").config();
const hre = require("hardhat");

const ethers = hre.ethers;
const deployed = require("../export/deployed.json");
const DeployUtils = require("./lib/DeployUtils");
const {upgrades} = require("hardhat");
let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);

  await deployUtils.deployProxy("SidePoolViews");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
