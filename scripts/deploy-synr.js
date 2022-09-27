require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const DeployUtils = require("./lib/DeployUtils");
let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);
  const chainId = await deployUtils.currentChainId();
  if (chainId === 1) {
    console.error("This script is for test and development only");
    process.exit();
  }
  let [, localTokenOwner, localSuperAdmin] = await ethers.getSigners();
  // let tx;

  const tokenOwner = chainId === 1337 ? localTokenOwner.address : process.env.TOKEN_OWNER;

  const superAdmin = chainId === 1337 ? localSuperAdmin.address : process.env.SUPER_ADMIN;

  const maxTotalSupply = process.env.MAX_TOTAL_SUPPLY || 10000000000;

  console.log("Deploying SyndicateERC20...");
  const SYNR = await ethers.getContractFactory("SyndicateERC20");
  const synr = await SYNR.deploy(tokenOwner, maxTotalSupply, superAdmin);
  await synr.deployed();
  console.log("SyndicateERC20 deployed at", synr.address);

  let notReallyDeployedYet = true;
  let features;

  // if the network is congested the following can fail
  while (notReallyDeployedYet) {
    try {
      features =
        (await synr.FEATURE_TRANSFERS_ON_BEHALF()) +
        (await synr.FEATURE_TRANSFERS()) +
        (await synr.FEATURE_UNSAFE_TRANSFERS()) +
        (await synr.FEATURE_DELEGATIONS()) +
        (await synr.FEATURE_DELEGATIONS_ON_BEHALF());
      notReallyDeployedYet = false;
    } catch (e) {
      await deployUtils.sleep(1000);
    }
  }
  await (await synr.updateFeatures(features)).wait();

  const network = chainId === 1 ? "ethereum" : chainId === 44787 ? "alfajores" : "localhost";

  console.log(`
To verify SyndicateERC20 source code:
    
  npx hardhat verify --show-stack-traces \\
      --network ${network} \\
      ${synr.address} \\
      ${tokenOwner} \\
      ${maxTotalSupply} \\
      ${superAdmin} 
      
`);

  await deployUtils.saveDeployed(chainId, ["SyndicateERC20"], [synr.address]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
