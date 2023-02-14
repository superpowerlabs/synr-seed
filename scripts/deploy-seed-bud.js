require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;
const DeployUtils = require("./lib/DeployUtils");
let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);
  let [deployer] = await ethers.getSigners();

  const seed = await deployUtils.deployProxy("SeedTokenMock");
  const bud = await deployUtils.deployProxy("BudToken");

  const recipients = {
    // Zhimin: "0x4ec0655C4A6db5A0515bCF111C7202b845fd329D",
    // Stella: "0x3E4276Eb950C7a8aF7A1B4d03BDDF02e34A503f7",
    // Tim: "0xB664130222198dBE922C20C912d9847Bd87E31b1",
    // Dev1: "0x5e7E3a602bBE9987BD653379bBA7Bf478D0570f5",
    // Dev2: "0x781e24d233758D949e161f944C3b577Ab49fe192",
    // Devansh: "0x5e7E3a602bBE9987BD653379bBA7Bf478D0570f5",
    // Rolando: "0x8A96e7F2cae379559496C810e9B7DecE971B771E",
    // Jerry: "0xa27E8ACBF87979A7A25480c428B9fe8A56a3Fc85",
    // Yacin: "0x11b896e896026de7976c209bbac7e60a6b5f846a"
  };

  await deployUtils.Tx(seed.setMinter(deployer.address, true));

  for (let user in recipients) {
    const address = recipients[user];
    await deployUtils.Tx(seed.mint(address, ethers.utils.parseEther("1000000")), "Minting 1M seed to " + address);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
