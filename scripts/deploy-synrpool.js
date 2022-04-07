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
  console.log("chainId", chainId);

  const [owner] = await ethers.getSigners();

  const synrAddress = deployed[chainId].SyndicateERC20;
  const sSynrAddress = deployed[chainId].SyntheticSyndicateERC20;

  console.log("Deploying SynrBridge");
  const SynrBridge = await ethers.getContractFactory("SynrBridge");

  const synrBridge = await upgrades.deployProxy(SynrBridge, [synrAddress, sSynrAddress]);
  await synrBridge.deployed();

  const SyntheticSyndicateERC20 = await ethers.getContractFactory("SyntheticSyndicateERC20");
  const sSynr = await SyntheticSyndicateERC20.attach(sSynrAddress);
  await sSynr.updateRole(synrBridge.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER());

  console.log("SynrBridge deployed at", synrBridge.address);

  const network = chainId === 1 ? "ethereum" : chainId === 3 ? "ropsten" : "localhost";

  console.log(`
To verify SynrBridge source code, flatten the source code, get the implementation address in .openzeppelin, remove the licenses, except the first one, and verify manually

The encoded arguments are:

${deployUtils.encodeArguments(["address", "address"], [synrAddress, sSynrAddress])}

`);

  console.log("SynrBridge deployed at", synrBridge.address);
  await deployUtils.saveDeployed(chainId, ["SynrBridge"], [synrBridge.address]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
