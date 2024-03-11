require("dotenv").config();
const hre = require("hardhat");

const ethers = hre.ethers;
const deployed = require("../export/deployed.json");
const DeployUtils = require("./lib/DeployUtils");
const wormholeConfig = require("./lib/wormholeConfig");

let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);
  const {network} = deployUtils;
  const chainId = await deployUtils.currentChainId();
  const [owner] = await ethers.getSigners();
  const tesseract = wormholeConfig.tesseractsAddress[chainId];
  const pool = wormholeConfig.poolAddress[chainId];
  const relayer = wormholeConfig.relayerAddress[chainId];

  const isMainChain = chainId === 1 || chainId === 44787;

  console.log("Deploying contracts with the account:", owner.address, "to", network(chainId));

  const bridgeName = isMainChain ? "MainWormholeBridgeV2" : "SideWormholeBridgeV2";
  const bridge = await deployUtils.deployProxy(bridgeName, tesseract, pool, relayer);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
