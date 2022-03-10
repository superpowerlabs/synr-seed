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

  const [owner] = await ethers.getSigners()

  const synPerBlock = process.env.SYN_PER_BLOCK || '360000000000000000000'
  const blockPerUpdate = process.env.BLOCK_PER_UPDATE || 91252
  const threeYearsBlocks = process.env.THREE_YEARS_BLOCKS || 7120725
  const weight = process.env.WEIGHT || 200
  const delay = process.env.DELAY || 6460 // 24 hours

  const synAddress = deployed[chainId].SyndicateERC20
  const ssynAddress = deployed[chainId].SyntheticSyndicateERC20
  console.log('Deploying SyndicatePoolFactory')
  const PoolFactory = await ethers.getContractFactory("SyndicatePoolFactory")
  const blockNumberFactoryConstructor = (await ethers.provider.getBlockNumber())
      // + 1
      //(chainId === 1 ? delay : chainId === 42 ? 40 : 1)

  const poolFactory = await PoolFactory.deploy(
      synAddress,
      ssynAddress,
      ethers.BigNumber.from(synPerBlock),
      ethers.BigNumber.from(blockPerUpdate),
      blockNumberFactoryConstructor,
      blockNumberFactoryConstructor + parseInt(threeYearsBlocks)
  );
  await poolFactory.deployed()
  console.log('SyndicatePoolFactory deployed at', poolFactory.address)

  const network = chainId === 1 ? 'ethereum'
      : chainId === 42 ? 'kovan'
          : 'localhost'

  console.log(`
To verify SyndicatePoolFactory source code:
    
  npx hardhat verify --show-stack-traces \\
      --network ${network} \\
      ${poolFactory.address} \\
      ${synAddress} \\
      ${ssynAddress} \\
      ${ethers.BigNumber.from(synPerBlock).toString()} \\
      ${ethers.BigNumber.from(blockPerUpdate).toString()} \\
      ${blockNumberFactoryConstructor} \\
      ${blockNumberFactoryConstructor + parseInt(threeYearsBlocks)}
      
`)

  const blockNumberPoolCreation = await ethers.provider.getBlockNumber()

  console.log('Creating SyndicateCorePool')
  const tx = await poolFactory.connect(owner).createPool(synAddress, blockNumberPoolCreation, weight)
  await tx.wait()

  const synPoolAddress = await poolFactory.getPoolAddress(synAddress)
  const corePool = await deployUtils.getContract('SyndicateCorePool', 'pools', synPoolAddress, chainId)
  console.log('SyndicateCorePool deployed at', corePool.address)

  console.log(`
To verify SyndicateCorePool source code:
    
  npx hardhat verify --show-stack-traces \\
      --network ${network} \\
      ${corePool.address} \\
      ${synAddress} \\
      ${ssynAddress} \\
      ${poolFactory.address} \\
      ${synAddress} \\
      ${blockNumberPoolCreation} \\
      ${weight}
      
`)

  // await corePool.connect(owner).setQuickRewardRate(ethers.BigNumber.from(process.env.QUICK_REWARDS))
  // console.log('Quick reward set')

  const SYN = await ethers.getContractFactory("SyndicateERC20")
  const syn = await SYN.attach(deployed[chainId].SyndicateERC20)

  const SSYN = await ethers.getContractFactory("SyntheticSyndicateERC20")
  const ssyn = await SSYN.attach(deployed[chainId].SyntheticSyndicateERC20)

  // for safety we will give this role to the pool only before the 16 weeks ends
  // await syn.connect(owner).updateRole(poolFactory.address, await syn.ROLE_TOKEN_CREATOR());

  await ssyn.connect(owner).updateRole(corePool.address, await ssyn.ROLE_TOKEN_CREATOR());
  console.log('Pool authorized to manage sSYN')

  await deployUtils.saveDeployed(chainId,
      ['SyndicatePoolFactory', 'SyndicateCorePool'],
      [poolFactory.address, corePool.address],
      {
        blockNumberFactoryConstructor,
        blockNumberPoolCreation
      }
  )

}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });

