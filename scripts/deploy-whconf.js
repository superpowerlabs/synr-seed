require("dotenv").config();
const hre = require("hardhat");

const ethers = hre.ethers;
const deployed = require("../export/deployed.json");
const DeployUtils = require("./lib/DeployUtils");
const wormholeConfig = require("./lib/wormholeConfig");
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
  let otherChain, recipientChain, bridge, otherContract;
  if (chainId === 3 || chainId === 43113) {
    if (chainId === 3) {
      otherChain = 43113;
      recipientChain = 6;
      bridge = await deployUtils.attach("MainWormholeBridge");
      otherContract = "SideWormholeBridge";
    } else {
      otherChain = 3;
      recipientChain = 10001;
      bridge = await deployUtils.attach("SideWormholeBridge");
      otherContract = "MainWormholeBridge";
    }
  } else if (chainId === 1) {
    otherChain = 56;
    recipientChain = 4;
    bridge = await deployUtils.attach("MainWormholeBridge");
    otherContract = "SideWormholeBridge";
  } else if (chainId === 56) {
    otherChain = 1;
    recipientChain = 2;
    bridge = await deployUtils.attach("SideWormholeBridge");
    otherContract = "MainWormholeBridge";
  }
  await Tx(bridge.wormholeInit(wormholeContract[0], wormholeContract[1], {gasLimit: 200000}), "Configuring wormhole");
  await Tx(
    bridge.wormholeRegisterContract(recipientChain, bytes32Address(deployed[otherChain][otherContract])),
    "Configuring the recipient chain"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
