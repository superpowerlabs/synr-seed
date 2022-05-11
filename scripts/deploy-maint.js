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

  const mainPoolAddress = deployed[chainId].MainPool;
  const tesseract = await deployUtils.deploy("MainTesseract", mainPoolAddress);

  // const MainTesseract = await ethers.getContractFactory("MainTesseract");
  // const tesseract = await MainTesseract.attach("0xF5C2D1cda9Bb2EA793B7F2069b385F7eB3ebf052");

  const MainPool = await ethers.getContractFactory("MainPool");
  const pool = await MainPool.attach(mainPoolAddress);

  await deployUtils.Tx(pool.setBridge(tesseract.address, {gasLimit: 60000}), "Set MainTesseract as a MainPool factory");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
