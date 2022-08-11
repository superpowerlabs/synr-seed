require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const DeployUtils = require("./lib/DeployUtils");
const testnetWallets = require("./testnetWallets");
let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);
  const [deployer] = await ethers.getSigners();
  const bud = await deployUtils.deployProxy("BudTokenMock");
  // const bud = await deployUtils.attach("BudTokenMock");
  await deployUtils.Tx(bud.setMinter(deployer.address, true), "Set deployer as minter");

  for (let address of testnetWallets) {
    await deployUtils.Tx(
      bud.mint(address, ethers.utils.parseEther("200000"), {
        gasLimit: 120000,
      }),
      "BUD to " + address
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
