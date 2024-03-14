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
  const isMainChain = chainId === 1 || chainId === 44787;
  const [owner] = await ethers.getSigners();
  const tesseract = deployed[chainId].Tesseract;
  const pool = isMainChain ? deployed[chainId].MainPool : deployed[chainId].SeedPool;
  const relayer = wormholeConfig.relayerAddress[chainId];

  console.log("Deploying contracts with the account:", owner.address, "to", network(chainId));

  const bridgeName = isMainChain ? "MainWormholeBridgeV2" : "SideWormholeBridgeV2";
  const bridge = await deployUtils.deployProxy(bridgeName, tesseract, pool, relayer);

  const poolABI = require(`../artifacts/contracts/pool/${isMainChain ? "MainPool" : "SeedPool"}.sol/${
    isMainChain ? "MainPool" : "SeedPool"
  }.json`).abi;
  const poolContract = new ethers.Contract(pool, poolABI, owner);

  const tesseractABI = require("../artifacts/contracts/Tesseract.sol/Tesseract.json").abi;
  const tesseractContract = new ethers.Contract(tesseract, tesseractABI, owner);

  await deployUtils.Tx(poolContract.setBridge(bridge.address, true), "Set bridgeV2 in pool");
  await deployUtils.Tx(tesseractContract.setBridge(2, bridge.address), "Set bridgeV2 in tesseract");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
