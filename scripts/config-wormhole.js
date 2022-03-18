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
      : chainId === 3
      ? "ropsten"
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
  const synrPool = deployed[chainId].SynrPool;
  const seedFactory = deployed[chainId].SeedFactory;

  if (chainId < 6) {
    await synrPool.wormholeInit(wormholeContract[0], wormholeContract[1]);
    await synrPool.wormholeRegisterContract(4, bytes32Address(seedFactory.address));
  } else {
    await seedFactory.wormholeInit(wormholeContract[0], wormholeContract[1]);
    await seedFactory.wormholeRegisterContract(chainId === 56 ? 2 : 10001, bytes32Address(synrPool.address));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
