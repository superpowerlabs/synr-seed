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

const wormholeRopsten = "0xF174F9A837536C449321df1Ca093Bb96948D5386"
const wormholeBSCTest= "0x9dcF9D205C9De35334D646BeE44b2D2859712A09"

async function main() {
  deployUtils = new DeployUtils(ethers)
  const chainId = await deployUtils.currentChainId()
  console.log('chainId', chainId)
 
  const seed = deployed[chainId].SeedToken
  const seedFactory = deployed[chainId].SeedFactory
  const Synr = deployed[chainId].SyndicateERC20
  const sSynr = deployed[chainId].SyntheticSyndicateERC20SyndicateERC20
  const synrPool = deployed[chainId].SynrPool


  await sSynr.updateRole(synrPool.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER());


  await seed.setManager(seedFactory.address)


  await synrPool.wormholeInit(10001, wormholeRopsten)
  await synrPool.wormholeRegisterContract(
      4,
      bytes32Address(seedFactory.address)
  )

  await seedFactory.wormholeInit(4, wormholeBSCTest)
  await seedFactory.wormholeRegisterContract(
    10001,
        bytes32Address(synrPool.address)
    )
}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });

