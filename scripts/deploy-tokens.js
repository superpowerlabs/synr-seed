require('dotenv').config()
const hre = require("hardhat");
const ethers = hre.ethers

const DeployUtils = require('./lib/DeployUtils')
let deployUtils

async function main() {
  deployUtils = new DeployUtils(ethers)
  const chainId = await deployUtils.currentChainId()
  let [, localTokenOwner, localSuperAdmin, localTreasury] = await ethers.getSigners();
  // let tx;

  const tokenOwner = chainId === 1337
      ? localTokenOwner.address
      : process.env.TOKEN_OWNER

  const superAdmin = chainId === 1337
      ? localSuperAdmin.address
      : process.env.SUPER_ADMIN

  const treasury = chainId === 1337
      ? localTreasury.address
      : process.env.TREASURY

  const network = chainId === 1 ? 'ethereum'
      : chainId === 42 ? 'kovan'
          : 'localhost'

  if (!process.env.MAX_TOTAL_SUPPLY) {
    throw new Error('Missing parameters')
  }

  console.log('Deploying SyndicateERC20...')
  const SYN = await ethers.getContractFactory("SyndicateERC20")
  const syn = await SYN.deploy(tokenOwner, process.env.MAX_TOTAL_SUPPLY, superAdmin)
  await syn.deployed()
  console.log('SyndicateERC20 deployed at', syn.address)

  let notReallyDeployedYet = true
  let features

  // if the network is congested the following can fail
  while (notReallyDeployedYet) {
    try {
      features =
          (await syn.FEATURE_TRANSFERS_ON_BEHALF()) +
          (await syn.FEATURE_TRANSFERS()) +
          (await syn.FEATURE_UNSAFE_TRANSFERS()) +
          (await syn.FEATURE_DELEGATIONS()) +
          (await syn.FEATURE_DELEGATIONS_ON_BEHALF())
      notReallyDeployedYet = false
    } catch (e) {
      await deployUtils.sleep(1000)
    }
  }
  console.log('Updating features')
  await (await syn.updateFeatures(features)).wait()

  console.log('Giving treasury right to swap sSYN for SYN')
  await (await syn.updateRole(treasury, await syn.ROLE_TREASURY())).wait()

  console.log(`
To verify SyndicateERC20 source code:
    
  npx hardhat verify --show-stack-traces \\
      --network ${network} \\
      ${syn.address} \\
      ${tokenOwner} \\
      ${process.env.MAX_TOTAL_SUPPLY}
      
`)

  console.log('Deploying SyntheticSyndicateERC20...')
  const SSYN = await ethers.getContractFactory("SyntheticSyndicateERC20")
  const ssyn = await SSYN.deploy(superAdmin)
  await ssyn.deployed()

  console.log('Giving treasury right to receive sSYN')
  await (await ssyn.updateRole(treasury, await ssyn.ROLE_WHITE_LISTED_RECEIVER())).wait()

  console.log(`
To verify SyntheticSyndicateERC20 source code:
    
  npx hardhat verify --show-stack-traces \\
      --network ${network} \\
      ${ssyn.address}  \\
      ${superAdmin.address}
      
`)

  console.log('SyntheticSyndicateERC20 deployed at', ssyn.address)

  console.log('Deploying SynrSwapper')
  const SynrSwapper = await ethers.getContractFactory("SynrSwapper")
  const synrSwapper = await SynrSwapper.deploy(
      superAdmin,
      syn.address,
      ssyn.address);
  await synrSwapper.deployed()
  console.log('SynrSwapper deployed at', synrSwapper.address)

  console.log(`
To verify SynrSwapper source code:
    
  npx hardhat verify --show-stack-traces \\
      --network ${network} \\
      ${synrSwapper.address} \\
      ${superAdmin} \\
      ${syn.address} \\
      ${ssyn.address}
      
`)

  await deployUtils.saveDeployed(chainId, ['SyndicateERC20', 'SyntheticSyndicateERC20', 'SynrSwapper'],
      [syn.address, ssyn.address, synrSwapper.address])
}

main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
