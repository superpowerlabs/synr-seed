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
  let [owner, minter, localSuperAdmin] = await ethers.getSigners();

  const network = chainId === 1 ? "ethereum" : chainId === 3 ? "ropsten" : "localhost";

  const superAdmin = chainId === 1337 ? localSuperAdmin.address : process.env.SUPER_ADMIN;

  // const ssyn = await deployUtils.deploy("SyntheticSyndicateERC20", superAdmin);
  const ssyn = await deployUtils.attach("SyntheticSyndicateERC20");

  // team
  // await ssyn.mint(owner.address, ethers.utils.parseEther("1000000000"));
  await deployUtils.Tx(ssyn.mint(owner.address, ethers.utils.parseEther("1000000000")), "sSYNR to deployer");
  await deployUtils.Tx(
    ssyn.mint("0xa27E8ACBF87979A7A25480c428B9fe8A56a3Fc85", ethers.utils.parseEther("1000000000")),
    "sSYNR to Jerry"
  );
  await deployUtils.Tx(
    ssyn.mint("0x8A96e7F2cae379559496C810e9B7DecE971B771E", ethers.utils.parseEther("1000000000")),
    "sSYNR to Rolando"
  );

  console.log(`
To verify SyntheticSyndicateERC20 source code:
    
  npx hardhat verify --show-stack-traces \\
      --network ${network} \\
      ${ssyn.address}  \\
      ${superAdmin}
      
`);

  console.log("SyntheticSyndicateERC20 deployed at", ssyn.address);
  await deployUtils.saveDeployed(chainId, ["SyntheticSyndicateERC20"], [ssyn.address]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
