// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
require("dotenv").config();
const {expect} = require("chai");
const hre = require("hardhat");
const requireOrMock = require("require-or-mock");
const ethers = hre.ethers;
const deployed = requireOrMock("export/deployed.json");
const DeployUtils = require("./lib/DeployUtils");
const wormholeConfig = require("./lib/wormholeConfig");
const net = require("net");
let deployUtils;
const {bytes32Address} = require("../test/helpers");

async function main() {
  deployUtils = new DeployUtils(ethers);
  const {Tx} = deployUtils;
  const chainId = await deployUtils.currentChainId();

  const network =
    chainId === 1
      ? "ethereum"
      : chainId === 5
      ? "goerli"
      : chainId === 56
      ? "bsc"
      : chainId === 97
      ? "bsc_testnet"
      : "localhost";

  if (network === "localhost") {
    console.error("Network not supported");
    process.exit(1);
  }

  const wormholeContract = wormholeConfig.byChainId[chainId];

  if (chainId < 6) {
    const otherChain = chainId === 1 ? 56 : 97;
    const MainTesseract = await ethers.getContractFactory("MainTesseract");
    const mainTesseract = MainTesseract.attach(deployed[chainId].MainTesseract);
    await Tx(mainTesseract.wormholeInit(wormholeContract[0], wormholeContract[1]), "Configuring wormhole");
    await Tx(
      mainTesseract.wormholeRegisterContract(4, bytes32Address(deployed[otherChain].SideTesseract)),
      "Configuring the side chain"
    );
  } else {
    const otherChain = chainId === 56 ? 1 : 5;
    const SideTesseract = await ethers.getContractFactory("SideTesseract");
    const sideTesseract = SideTesseract.attach(deployed[chainId].SideTesseract);
    await Tx(sideTesseract.wormholeInit(wormholeContract[0], wormholeContract[1]), "Configuring wormhole");
    await Tx(
      sideTesseract.wormholeRegisterContract(2, bytes32Address(deployed[otherChain].MainTesseract)),
      "Configuring the main chain"
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
