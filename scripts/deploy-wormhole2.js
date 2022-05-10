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

  if (/1337$/.test(chainId.toString())) {
    console.error("Network not supported");
    process.exit(1);
  }

  const wormholeContract = wormholeConfig.byChainId[chainId];

  if (chainId < 6) {
    const otherChain = chainId === 1 ? 56 : chainId === 5 ? 97 : 80001;
    const recipientChain = chainId === 1 || chainId === 5 ? 4 : 5;
    const MainTesseract = await ethers.getContractFactory("MainTesseract");
    const mainTesseract = MainTesseract.attach(deployed[chainId].MainTesseract);
    await Tx(mainTesseract.wormholeInit(wormholeContract[0], wormholeContract[1], {gasLimit: 200000}), "Configuring wormhole");
    await Tx(
      mainTesseract.wormholeRegisterContract(recipientChain, bytes32Address(deployed[otherChain].SideTesseract)),
      "Configuring the side chain"
    );
  } else {
    const otherChain = chainId === 56 ? 1 : chainId === 97 ? 5 : 3;
    const recipientChain = chainId === 56 || chainId === 97 ? 2 : 10001;
    const SideTesseract = await ethers.getContractFactory("SideTesseract");
    const sideTesseract = SideTesseract.attach(deployed[chainId].SideTesseract);
    await Tx(sideTesseract.wormholeInit(wormholeContract[0], wormholeContract[1], {gasLimit: 200000}), "Configuring wormhole");
    await Tx(
      sideTesseract.wormholeRegisterContract(recipientChain, bytes32Address(deployed[otherChain].MainTesseract)),
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
