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
  // console.log("chainId", chainId);

  const [owner] = await ethers.getSigners();

  const mainPoolAddress = deployed[chainId].MainPool;

  console.log("Deploying SynrBridge");
  const SynrBridge = await ethers.getContractFactory("SynrBridge");

  const synrBridge = await upgrades.deployProxy(SynrBridge, [mainPoolAddress]);
  await synrBridge.deployed();

  // const SynrBridge = await ethers.getContractFactory("SynrBridge");
  // const synrBridge = await SynrBridge.attach("0xF5C2D1cda9Bb2EA793B7F2069b385F7eB3ebf052");

  console.log("SynrBridge deployed at", synrBridge.address);

  const MainPool = await ethers.getContractFactory("MainPool");
  const pool = await MainPool.attach(mainPoolAddress);

  console.log("Set SynrBridge as a MainPool factory");
  await pool.setFactory(synrBridge.address, {gasLimit: 60000});

  await deployUtils.saveDeployed(chainId, ["SynrBridge"], [synrBridge.address]);

  console.log(await deployUtils.verifyCodeInstructions("SynrBridge", chainId, ["address"], [mainPoolAddress], "SynrBridge"));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
