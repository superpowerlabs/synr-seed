require('dotenv').config()
const hre = require("hardhat");
const ethers = hre.ethers

const DeployUtils = require('./lib/DeployUtils')
let deployUtils

async function main() {
  deployUtils = new DeployUtils(ethers)
  const chainId = await deployUtils.currentChainId()
  let [, , localSuperAdmin] = await ethers.getSigners();

  const network = chainId === 56 ? 'BSC'
      : chainId === 97 ? 'BSCTestnet'
          : 'localhost'

  const superAdmin = chainId === 1337
      ? localSuperAdmin.address
      : process.env.SUPER_ADMIN

  console.log('Deploying SEED...')
  const SeedToken = await ethers.getContractFactory("SeedToken")
  const seed = await upgrades.deployProxy(SeedToken, []);
  await seed.deployed()

  console.log(`
To verify SeedToken source code:
    
  npx hardhat verify --show-stack-traces \\
      --network ${network} \\
      ${seed.address}  \\
      ${superAdmin}
      
`)

  console.log('SeedToken deployed at', seed.address)
  await deployUtils.saveDeployed(chainId, ['SeedToken'], [seed.address])
}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
