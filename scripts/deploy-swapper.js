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

async function main() {
  deployUtils = new DeployUtils(ethers)
  const chainId = await deployUtils.currentChainId()
  console.log('chainId', chainId)

  let [, localTokenOwner, localSuperAdmin] = await ethers.getSigners();

  const tokenOwner = chainId === 1337
      ? localTokenOwner.address
      : process.env.TOKEN_OWNER

  const superAdmin = chainId === 1337
      ? localSuperAdmin.address
      : process.env.SUPER_ADMIN

  const synAddress = deployed[chainId].SyndicateERC20
  const ssynAddress = deployed[chainId].SyntheticSyndicateERC20
  console.log('Deploying SynrSwapper')
  const SynrSwapper = await ethers.getContractFactory("SynrSwapper")
  const synrSwapper = await SynrSwapper.deploy(
      superAdmin,
      synAddress,
      ssynAddress);
  await synrSwapper.deployed()
  console.log('SynrSwapper deployed at', synrSwapper.address)

  const network = chainId === 1 ? 'ethereum'
      : chainId == 42 ? 'kovan'
          : 'localhost'

  console.log(`
To verify SynrSwapper source code:
    
  npx hardhat verify --show-stack-traces \\
      --network ${network} \\
      ${synrSwapper.address} \\
      ${superAdmin} \\
      ${synAddress} \\
      ${ssynAddress}
      
`)

  const SYN = await ethers.getContractFactory("SyndicateERC20")
  const syn = await SYN.attach(synAddress)

  const SSYN = await ethers.getContractFactory("SyntheticSyndicateERC20")
  const ssyn = await SSYN.attach(ssynAddress)

  await ssyn.updateRole(synrSwapper.address, await ssyn.ROLE_TOKEN_DESTROYER());
  await syn.updateRole(synrSwapper.address, await syn.ROLE_TOKEN_CREATOR());

  await deployUtils.saveDeployed(chainId,
      ['SynrSwapper'],
      [synrSwapper.address]
  )

}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });

