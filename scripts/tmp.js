require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const DeployUtils = require("./lib/DeployUtils");
let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);
  const [owner] = await ethers.getSigners();

  const sSynr = await deployUtils.attach("SyntheticSyndicateERC20");

  await deployUtils.Tx(sSynr.updateRole(owner.address, await sSynr.ROLE_TOKEN_CREATOR()), "Making owner a token creator");
  await deployUtils.Tx(
    sSynr.mint("0x34923658675B99B2DB634cB2BC0cA8d25EdEC743", ethers.utils.parseEther("10000000")),
    "Minting 1M tokens"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
