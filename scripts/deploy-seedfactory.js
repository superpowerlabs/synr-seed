// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
require('dotenv').config()
const hre = require("hardhat");
const requireOrMock = require('require-or-mock');
const ethers = hre.ethers
const deployed = requireOrMock('export/deployed.json')
const DeployUtils = require('./lib/DeployUtils')
let deployUtils

// TODO must be rewritten

async function main() {
  deployUtils = new DeployUtils(ethers)
  const chainId = await deployUtils.currentChainId()
  console.log('chainId', chainId)

  const [owner] = await ethers.getSigners()

 
  const seed = deployed[chainId].SeedToken

  console.log('Deploying SeedFactory')
  const SeedFactory = await ethers.getContractFactory("SeedFactory")

  const seedFactory = await upgrades.deployProxy(SeedFactory, [seed.address]);
  await seedFactory.deployed()


  console.log('SeedFactory deployed at', seedFactory.address)

  const network = chainId === 56 ? 'BSC'
      : chainId === 97 ? 'BSCTestnet'
          : 'localhost'

  console.log(`
To verify SeedFactory source code:

  npx hardhat verify --show-stack-traces \\
      --network ${network} \\
      ${poolFactory.address} \\
      ${seed.address} \\
`)

console.log('SeedFactory deployed at', seedFactory.address)
await deployUtils.saveDeployed(chainId, ['SeedFactory'], [seedFactory.address])

}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });

