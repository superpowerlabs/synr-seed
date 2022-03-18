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

  console.log("Deploying SynrPool");
  const SynrPool = await ethers.getContractFactory("SynrPool");

  const synrPool = await upgrades.deployProxy(SynrPool, [synrAddress, sSynrAddress]);
  await synrPool.deployed();

  const SyntheticSyndicateERC20 = await ethers.getContractFactory("SyntheticSyndicateERC20");
  const sSynr = await SyntheticSyndicateERC20.attach(sSynrAddress);
  await sSynr.updateRole(synrPool.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER());

  console.log("SynrPool deployed at", synrPool.address);

  const network = chainId === 1 ? "ethereum" : chainId === 3 ? "ropsten" : "localhost";

  console.log(`
To verify SynrPool source code, flatten the source code, get the implementation address in .openzeppelin, remove the licenses, except the first one, and verify manually
`);

  console.log("SynrPool deployed at", synrPool.address);
  await deployUtils.saveDeployed(chainId, ["SynrPool"], [synrPool.address]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
