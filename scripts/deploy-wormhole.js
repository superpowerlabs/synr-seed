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
const wormholeConfig = require("./lib/wormholeConfig");
const net = require("net");
let deployUtils;
const {bytes32Address} = require("../test/helpers");

async function main() {
  deployUtils = new DeployUtils(ethers);
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
    const SynrBridge = await ethers.getContractFactory("SynrBridge");
    const synrBridge = SynrBridge.attach(deployed[chainId].SynrBridge);
    console.log("Configuring wormhole");
    let tx = await synrBridge.wormholeInit(wormholeContract[0], wormholeContract[1]);
    await tx.wait();
    console.log("Configuring the side chain");
    tx = await synrBridge.wormholeRegisterContract(4, bytes32Address(deployed[otherChain].SeedFactory));
    await tx.wait();
  } else {
    const otherChain = chainId === 56 ? 1 : 5;
    const SeedFactory = await ethers.getContractFactory("SeedFactory");
    const seedFactory = SeedFactory.attach(deployed[chainId].SeedFactory);
    console.log("Configuring wormhole");
    let tx = await seedFactory.wormholeInit(wormholeContract[0], wormholeContract[1]);
    await tx.wait();
    console.log("Configuring the main chain");
    tx = await seedFactory.wormholeRegisterContract(
      chainId === 56 ? 2 : 10001,
      bytes32Address(deployed[otherChain].SynrBridge)
    );
    await tx.wait();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
